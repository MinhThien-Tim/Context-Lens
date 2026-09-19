import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { LookupBottomSheet } from '../components/LookupBottomSheet';
import { ReaderSettings } from '../components/ReaderSettings';
import { db, defaultPreferences, loadPreferences, savePreferences, type AppPreferences, type DocumentRecord } from '../db/database';
import { TextReader, type ReaderSelection } from '../reader/TextReader';
import { ApiSettings } from '../settings/ApiSettings';
import { loadAiSettings, saveAiSettings } from '../settings/store';
import { defaultAiSettings, type AiSettings } from '../settings/types';
import { lookupService } from '../lookup/service';
import type { LanguageMode, LookupRequest, LookupResponse } from '../lookup/types';
import { initialTextLocation } from '../documents/location';
import { captureDocumentLocation, restoreTextLocation, saveDocumentLocation } from '../reader/readingPosition';
import { debounce } from '../utils/debounce';
import { importLocalFile } from '../documents/import/fileImport';
import { importArticle } from '../documents/import/articleImport';
import { ImportError, type ImportedDocument } from '../documents/import/types';
import { pronounceEnglish } from '../lookup/pronunciation';
import { isVocabularySaved, removeVocabulary, saveVocabulary } from '../vocabulary/store';
import type { VocabularyRecord } from '../db/database';
import { VocabularyLibrary } from '../vocabulary/VocabularyLibrary';
import { DataManagement } from '../storage/DataManagement';
import { loadBundledDictionary, loadDictionaryPacks } from '../lookup/dictionary/packs';
import { maintainStorageBudget } from '../storage/storageService';
import { defaultEngineSettings, loadEngineSettings, saveEngineSettings, type EngineSettings } from '../settings/engines';
import type { ContextMode } from '../core/context/types';
import { NotesPanel } from '../notes/NotesPanel';

const SAMPLE = `The decision had surprised many voters. The government struggled to maintain public confidence after the announcement. Several ministers defended the policy.

Accounts of what happened to the ship vary. Some witnesses blamed the weather, while others pointed to a navigation error.

He considered every option carefully. He finally made up his own mind. Several factors account for the decline.`;

function makeRequest(selection: ReaderSelection, mode: LanguageMode): LookupRequest {
  return {
    selection: selection.text, selection_type: selection.type,
    sentence: selection.context.current, previous_sentence: selection.context.previous, next_sentence: selection.context.next,
    language_mode: mode,
    learner: { native_language: 'vi', english_level: 'B2-C1' },
    options: { include_ipa: true, include_contrast: true, include_grammar: true, include_sentence_translation: true }
  };
}

export function App() {
  const [documentRecord, setDocumentRecord] = useState<DocumentRecord | null>(null);
  const [draft, setDraft] = useState(SAMPLE);
  const [title, setTitle] = useState('Untitled reading');
  const [recent, setRecent] = useState<DocumentRecord[]>([]);
  const [preferences, setPreferences] = useState<AppPreferences>(defaultPreferences);
  const [aiSettings, setAiSettings] = useState<AiSettings>(defaultAiSettings);
  const [engineSettings, setEngineSettings] = useState<EngineSettings>(defaultEngineSettings);
  const [contextResult, setContextResult] = useState<LookupResponse | null>(null);
  const [showReaderSettings, setShowReaderSettings] = useState(false);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [lookup, setLookup] = useState<LookupResponse | null>(null);
  const [activeSelection, setActiveSelection] = useState<ReaderSelection | null>(null);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [updateReady, setUpdateReady] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [articleUrl, setArticleUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [vocabulary, setVocabulary] = useState<VocabularyRecord[]>([]);
  const [showVocabulary, setShowVocabulary] = useState(false);
  const [showDataManagement, setShowDataManagement] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const contextRequestRef = useRef<AbortController | null>(null);
  const importControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void loadEngineSettings().then(setEngineSettings).catch(() => {});
    void Promise.all([loadBundledDictionary(), loadDictionaryPacks()]).catch(() => {
      setImportError('The offline dictionary could not load. Reconnect and reload to download it.');
    });
    void maintainStorageBudget();
    void Promise.all([loadPreferences(), loadAiSettings(), db.documents.orderBy('updatedAt').reverse().limit(8).toArray(), db.vocabulary.orderBy('createdAt').reverse().limit(20).toArray()]).then(([prefs, ai, docs, words]) => {
      setPreferences(prefs); setAiSettings(ai); setRecent(docs); setVocabulary(words);
    });
    const params = new URLSearchParams(location.search);
    const sharedUrl = params.get('url');
    const sharedText = params.get('text');
    if (sharedUrl) {
      setArticleUrl(sharedUrl); setImporting(true);
      const controller = new AbortController(); importControllerRef.current = controller;
      void importArticle(sharedUrl, { signal: controller.signal }).then(async (imported) => {
        const doc = toDocumentRecord(imported);
        await db.documents.put(doc);
        setRecent((current) => [doc, ...current].slice(0, 8));
        setDocumentRecord(doc);
      }).catch((error: unknown) => setImportError(importErrorMessage(error))).finally(() => { setImporting(false); setImportProgress(null); importControllerRef.current = null; });
    }
    else if (sharedText) setDraft(sharedText);
  }, []);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onUpdate = () => setUpdateReady(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('context-lens:update-ready', onUpdate);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('context-lens:update-ready', onUpdate);
    };
  }, []);

  useEffect(() => {
    if (!documentRecord) return;
    restoreTextLocation(documentRecord);
    setProgress(documentRecord.location.progress);
    const persist = debounce(() => {
      const location = captureDocumentLocation(documentRecord);
      setProgress(location.progress);
      void db.documents.update(documentRecord.id, { location, updatedAt: Date.now() });
    }, 250);
    const onScroll = () => persist.run();
    const onPageHide = () => persist.flush();
    const onVisibility = () => { if (document.visibilityState === 'hidden') persist.flush(); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
      persist.flush();
    };
  }, [documentRecord?.id]);

  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    void savePreferences(preferences);
  }, [preferences]);

  const readerStyle = useMemo(() => ({
    '--reader-size': `${preferences.fontSize}px`, '--reader-leading': String(preferences.lineHeight),
    '--reader-font': preferences.fontFamily === 'serif' ? 'Georgia, Cambria, serif' : 'system-ui, sans-serif'
  }), [preferences]);

  const openDocument = async (doc: DocumentRecord) => { setDocumentRecord(doc); };
  const createDocument = async () => {
    const content = draft.trim(); if (!content) return;
    const now = Date.now();
    const doc: DocumentRecord = { id: crypto.randomUUID(), title: title.trim() || 'Untitled reading', content, kind: 'text', createdAt: now, updatedAt: now, location: initialTextLocation() };
    await db.documents.put(doc); setRecent([doc, ...recent]); setDocumentRecord(doc);
  };
  const importTextFile = async (file: File | undefined) => {
    if (!file) return;
    setImportError(null); setImporting(true);
    const controller = new AbortController(); importControllerRef.current = controller;
    try {
      await storeImportedDocument(await importLocalFile(file, { signal: controller.signal, onProgress: (progress) => setImportProgress(progress.label) }));
    } catch (error) { setImportError(importErrorMessage(error)); }
    finally { setImporting(false); setImportProgress(null); importControllerRef.current = null; }
  };
  const importArticleUrl = async () => {
    if (!articleUrl.trim()) return;
    setImportError(null); setImporting(true); setImportProgress('Extracting article');
    const controller = new AbortController(); importControllerRef.current = controller;
    try { await storeImportedDocument(await importArticle(articleUrl, { signal: controller.signal })); }
    catch (error) { setImportError(importErrorMessage(error)); }
    finally { setImporting(false); setImportProgress(null); importControllerRef.current = null; }
  };
  const storeImportedDocument = async (imported: ImportedDocument) => {
    const doc = toDocumentRecord(imported);
    await db.documents.put(doc);
    setRecent((current) => [doc, ...current].slice(0, 8));
    setDocumentRecord(doc);
  };
  const closeDocument = async () => {
    requestRef.current?.abort(); contextRequestRef.current?.abort();
    if (documentRecord) await saveDocumentLocation(documentRecord);
    setDocumentRecord(null); setLookupOpen(false);
  };

  const runLookup = (selection: ReaderSelection, mode = preferences.languageMode, engines = engineSettings) => {
    requestRef.current?.abort();
    contextRequestRef.current?.abort();
    const controller = new AbortController(); requestRef.current = controller;
    const request = makeRequest(selection, mode);
    setActiveSelection(selection); setLookupOpen(true); setError(null);
    setContextResult(null); setLoading(false);
    const immediate = lookupService.immediate(request, engines);
    setLookup(immediate); setSaved(false);
    if (documentRecord) void isVocabularySaved(documentRecord.id, immediate).then(value => { if (!controller.signal.aborted) setSaved(value); });
    // A stable selection delay avoids network calls during repeated mobile selection changes.
    const timer = window.setTimeout(() => { void lookupService.quick(request, engines, controller.signal).then((result) => {
      if (result && !controller.signal.aborted) {
        setLookup(result);
        if (documentRecord) void isVocabularySaved(documentRecord.id, result).then(value => { if (!controller.signal.aborted) setSaved(value); });
      }
    }).catch(() => { /* The immediate local result remains available. */ }); }, 150);
    controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  };

  const explainSelection = (mode: ContextMode) => {
    if (!activeSelection) return;
    contextRequestRef.current?.abort();
    const controller = new AbortController(); contextRequestRef.current = controller;
    setLoading(true); setError(null); setContextResult(null);
    void lookupService.explain(makeRequest(activeSelection, preferences.languageMode), aiSettings, engineSettings, mode, controller.signal).then(response => {
      if (controller.signal.aborted) return;
      setContextResult(response.result);
      if (response.status) setError(response.status === 'quota' ? 'Context quota reached. Your quick result is still available.' : response.status === 'offline' ? 'Offline result. A deeper explanation is not cached yet.' : 'No deeper explanation is available from the enabled engines.');
    }).catch(() => {
      if (!controller.signal.aborted) setError('Context is unavailable. Your quick result is still available.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
  };

  const changeMode = (mode: LanguageMode) => {
    const next = { ...preferences, languageMode: mode }; setPreferences(next);
    if (activeSelection) runLookup(activeSelection, mode);
  };
  const saveSetup = async (settings: AiSettings, engines = engineSettings) => {
    await saveAiSettings(settings);
    await saveEngineSettings(engines); setEngineSettings(engines);
    setAiSettings(settings);
    setShowApiSettings(false);
    if (lookupOpen && activeSelection) runLookup(activeSelection, preferences.languageMode, engines);
  };
  const toggleVocabulary = async () => {
    if (!documentRecord || !lookup) return;
    if (saved) {
      await removeVocabulary(documentRecord.id, lookup);
      setVocabulary((items) => items.filter((item) => !(item.source.documentId === documentRecord.id && item.originalSentence === lookup.context.sentence && item.lemma === lookup.selection.lemma)));
      setSaved(false);
    } else {
      const currentDocument = { ...documentRecord, location: captureDocumentLocation(documentRecord) };
      const id = await saveVocabulary(currentDocument, contextResult ? { ...lookup, deep: contextResult.deep } : lookup);
      const record = await db.vocabulary.get(id);
      if (record) setVocabulary((items) => [record, ...items.filter((item) => item.id !== id)]);
      setSaved(true);
    }
  };

  if (!documentRecord) return (
    <main class="home-shell">
      {!online && <div class="status-banner" role="status">Offline mode · Saved documents and cached meanings remain available.</div>}
      {updateReady && <button class="status-banner update-banner" onClick={() => location.reload()}>An update is ready · Reload</button>}
      <header class="brand-header"><div class="brand-mark">C</div><div><h1>Context Lens</h1><p>Read English. Stay in context.</p></div><button class="icon-button settings-button" aria-label="Saved vocabulary" onClick={() => setShowVocabulary(true)}>★</button><button class="icon-button" aria-label="Data and storage" onClick={() => setShowDataManagement(true)}>▣</button><button class="icon-button" aria-label="AI settings" onClick={() => setShowApiSettings(true)}>⚙</button></header>
      <section class="paste-panel">
        <label class="title-input">Title<input value={title} onInput={(event) => setTitle(event.currentTarget.value)} /></label>
        <label class="paste-label" for="content-input">Paste English text</label>
        <textarea id="content-input" value={draft} onInput={(event) => setDraft(event.currentTarget.value)} placeholder="Paste an article, passage, or notes…" />
        {importError && <p class="import-error" role="alert">{importError}</p>}
        {importProgress && <div class="import-progress" role="status"><span>{importProgress}</span><button onClick={() => importControllerRef.current?.abort()}>Cancel</button></div>}
        <div class="paste-footer"><span>{draft.trim().split(/\s+/).filter(Boolean).length} words</span><div class="paste-actions"><label class="secondary-button">{importing ? 'Importing…' : 'Open file'}<input class="visually-hidden" type="file" disabled={importing} accept=".txt,.md,.markdown,.pdf,.epub,.docx,text/plain,text/markdown,application/pdf,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => void importTextFile(event.currentTarget.files?.[0])} /></label><button class="primary-button" onClick={createDocument} disabled={!draft.trim() || importing}>Start reading</button></div></div>
      </section>
      <section class="url-panel"><label for="article-url">Read an article URL</label><div><input id="article-url" type="url" inputMode="url" value={articleUrl} onInput={(event) => setArticleUrl(event.currentTarget.value)} placeholder="https://example.com/article" /><button class="secondary-button" onClick={importArticleUrl} disabled={!articleUrl.trim() || importing}>Import</button></div><small>Direct fetch first. If the site blocks access, paste the text or configure the optional proxy.</small></section>
      {recent.length > 0 && <section class="recent-section"><h2>Previously opened</h2>{recent.map((doc) => <div class="recent-row"><button class="recent-item" onClick={() => openDocument(doc)}><span><strong>{doc.title}</strong><small>{doc.content.slice(0, 86)}…</small></span><span>›</span></button><button class="icon-button recent-delete" aria-label={`Delete ${doc.title}`} onClick={() => { if (confirm(`Delete “${doc.title}” and its notes from this device?`)) { void db.transaction('rw', [db.documents, db.notes], async () => { await db.documents.delete(doc.id); await db.notes.where('documentId').equals(doc.id).delete(); }); setRecent((items) => items.filter((item) => item.id !== doc.id)); } }}>×</button></div>)}</section>}
      {vocabulary.length > 0 && <section class="recent-section vocabulary-preview"><h2>Saved in context</h2>{vocabulary.slice(0, 8).map((word) => <div class="vocabulary-item"><span><strong>{word.lemma}</strong><small>{word.lexicalUnit ?? word.contextualMeaning}</small></span><span>{word.meaningVi.join(' · ')}</span></div>)}</section>}
      <p class="home-note">Documents stay on this device. Offline reading is available after the first visit.</p>
      {showApiSettings && <ApiSettings initialEngines={engineSettings} initial={aiSettings} health={lookupService.diagnostics()} onClose={() => setShowApiSettings(false)} onSave={saveSetup} />}
      {showVocabulary && <VocabularyLibrary records={vocabulary} onClose={() => setShowVocabulary(false)} onDelete={(id) => { void db.vocabulary.delete(id); setVocabulary((items) => items.filter((item) => item.id !== id)); }} />}
      {showDataManagement && <DataManagement onClose={() => setShowDataManagement(false)} onRestored={() => { void db.documents.orderBy('updatedAt').reverse().limit(8).toArray().then(setRecent); void db.vocabulary.orderBy('createdAt').reverse().limit(20).toArray().then(setVocabulary); }} />}
    </main>
  );

  return (
    <div class="reader-shell">
      {!online && <div class="reader-offline" role="status">Offline</div>}
      <header class="reader-header">
        <button class="icon-button" aria-label="Back to library" onClick={closeDocument}>←</button>
        <h1>{documentRecord.title}</h1>
        <button class="text-button" onClick={() => setShowReaderSettings(!showReaderSettings)} aria-expanded={showReaderSettings}>Aa</button>
        <button class="icon-button" onClick={() => setShowNotes(true)} aria-label="Document notes">✎</button>
        <button class="icon-button" onClick={() => setShowApiSettings(true)} aria-label="Language engine settings">⋯</button>
        {showReaderSettings && <ReaderSettings value={preferences} onChange={setPreferences} onClose={() => setShowReaderSettings(false)} />}
      </header>
      <div class="progress-line" role="progressbar" aria-label="Reading progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}><span style={{ width: `${progress * 100}%` }} /></div>
      {documentRecord.source && <div class="reader-source">{documentRecord.source.author && <span>{documentRecord.source.author}</span>}{documentRecord.source.siteName && <span>{documentRecord.source.siteName}</span>}{documentRecord.source.url && <a href={documentRecord.source.url} target="_blank" rel="noreferrer noopener">Original ↗</a>}</div>}
      <TextReader content={documentRecord.content} safeHtml={documentRecord.safeHtml} onLookup={runLookup} style={readerStyle} />
      <LookupBottomSheet debug={engineSettings.debugMode} contextResult={contextResult} onExplain={explainSelection} open={lookupOpen} result={lookup} loading={loading} error={error} mode={preferences.languageMode} onModeChange={changeMode} onClose={() => { requestRef.current?.abort(); contextRequestRef.current?.abort(); setLookupOpen(false); }} onOpenSettings={() => setShowApiSettings(true)} onSpeak={pronounceEnglish} onToggleSave={() => void toggleVocabulary()} onAddNote={() => { setLookupOpen(false); setShowNotes(true); }} saved={saved} />
      {showApiSettings && <ApiSettings initialEngines={engineSettings} initial={aiSettings} health={lookupService.diagnostics()} onClose={() => setShowApiSettings(false)} onSave={saveSetup} />}
      {showNotes && <NotesPanel document={documentRecord} selection={activeSelection} onClose={() => setShowNotes(false)} />}
    </div>
  );
}

function importErrorMessage(error: unknown): string {
  if (error instanceof ImportError) return error.message;
  return 'Unable to import this document.';
}

function toDocumentRecord(imported: ImportedDocument): DocumentRecord {
  const now = Date.now();
  return { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...imported };
}
