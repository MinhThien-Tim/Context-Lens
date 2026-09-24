import { useDesktop } from '../components/useDesktop';
import { ReaderShell } from '../reader/ReaderShell';
import { ReaderToolbar } from '../reader/ReaderToolbar';
import { ContentsPanel } from '../reader/ContentsPanel';
import { DocumentPosition, GoToLocation, PageNavigation } from '../reader/DocumentPosition';
import { jumpToOffset, keyboardCanNavigate, locationAtOffset, navigationOffset, positionLabel } from '../reader/navigation';
import { htmlSections, textSections } from '../documents/sections';
import type { DocumentLocation } from '../documents/location';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { LookupBottomSheet } from '../components/LookupBottomSheet';
import { ReaderSettings } from '../components/ReaderSettings';
import { db, defaultPreferences, loadPreferences, queryDocumentLibrary, savePreferences, type AppPreferences, type DocumentRecord, type PdfOcrRecord } from '../db/database';
import { TextReader, type ReaderSelection } from '../reader/TextReader';
import { createLocationPersistence } from '../reader/pdf/locationPersistence';
import { PdfViewer } from '../reader/pdf/PdfViewer';
import { PdfModeSwitch } from '../reader/pdf/PdfModeSwitch';
import { usePdfOcrQueue } from '../reader/pdf/usePdfOcrQueue';
import { pdfOffsetForPage, pdfPageForOffset } from '../reader/pdf/navigation';
import { PdfReadingView } from '../reader/pdf-reading/PdfReadingView';
import { eraseHighlights, upsertHighlight } from '../reader/pdf-reading/highlights';
import { pdfHasReadableText } from '../reader/pdf-reading/structuredPages';
import { loadOcrPages } from '../documents/pdf/ocrStore';
import { ocrCandidate } from '../documents/pdf/ocrEligibility';
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
import { collectionTitle, isVocabularySaved, removeVocabulary, saveVocabulary } from '../vocabulary/store';
import type { VocabularyRecord } from '../db/database';
import { VocabularyLibrary } from '../vocabulary/VocabularyLibrary';
import { DataManagement } from '../storage/DataManagement';
import { loadDictionaryPacks } from '../lookup/dictionary/packs';
import { maintainStorageBudget } from '../storage/storageService';
import { defaultEngineSettings, loadEngineSettings, saveEngineSettings, type EngineSettings } from '../settings/engines';
import type { ContextMode } from '../core/context/types';
import { NotesPanel } from '../notes/NotesPanel';
import { EngineError } from '../core/errors';
import { ensureLocalDictionaryAssets } from '../lookup/localAssets';
import { ContextLensOnboarding, LanguageToggle, OnboardingCard } from '../onboarding/ContextLensOnboarding';
import { hasSeenContextLensOnboarding, loadGuideLanguage, markContextLensOnboardingSeen, saveGuideLanguage, type GuideLanguage } from '../onboarding/store';
import { PasteComposer } from '../components/PasteComposer';
import { MarkupPalette, type MarkupTool } from '../reader/MarkupPalette';

function makeRequest(selection: ReaderSelection, mode: LanguageMode): LookupRequest {
  return {
    selection: selection.text, selection_type: selection.type,
    selection_start: selection.context.selectionStart,
    sentence: selection.context.current, previous_sentence: selection.context.previous, next_sentence: selection.context.next, paragraph: selection.context.paragraph,
    language_mode: mode,
    learner: { native_language: 'vi', english_level: 'B2-C1' },
    options: { include_ipa: true, include_contrast: true, include_grammar: true, include_sentence_translation: true }
  };
}

export function App() {
  const desktop = useDesktop();
  const [documentRecord, setDocumentRecord] = useState<DocumentRecord | null>(null);
  const [ocrPages, setOcrPages] = useState<PdfOcrRecord[]>([]);
  const [ocrCacheReadyId, setOcrCacheReadyId] = useState<string | null>(null);
  const [sharedDraft, setSharedDraft] = useState('');
  const [continueDocs, setContinueDocs] = useState<DocumentRecord[]>([]);
  const [libraryDocs, setLibraryDocs] = useState<DocumentRecord[]>([]);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryKind, setLibraryKind] = useState<DocumentRecord['kind'] | 'all'>('all');
  const [libraryHasMore, setLibraryHasMore] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [preferences, setPreferences] = useState<AppPreferences>(defaultPreferences);
  const [aiSettings, setAiSettings] = useState<AiSettings>(defaultAiSettings);
  const [engineSettings, setEngineSettings] = useState<EngineSettings>(defaultEngineSettings);
  const [contextResult, setContextResult] = useState<LookupResponse | null>(null);
  const [showReaderSettings, setShowReaderSettings] = useState(false);
  const [highlightToolsOpen, setHighlightToolsOpen] = useState(false);
  const [activeMarkupTool, setActiveMarkupTool] = useState<MarkupTool | null>(null);
  const [activeMarkupColor, setActiveMarkupColor] = useState<'yellow' | 'pink' | 'blue'>('yellow');
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [lookup, setLookup] = useState<LookupResponse | null>(null);
  const [activeSelection, setActiveSelection] = useState<ReaderSelection | null>(null);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupDisplay, setLookupDisplay] = useState<'popup' | 'panel'>('popup');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [goToOpen, setGoToOpen] = useState(false);
  const [pdfNavigationToken, setPdfNavigationToken] = useState(0);
  const [currentLocation, setCurrentLocation] = useState<DocumentLocation>(initialTextLocation());
  const [noteLocation, setNoteLocation] = useState<DocumentLocation>(initialTextLocation());
  const [noteSelection, setNoteSelection] = useState<ReaderSelection | null>(null);
  const [jumpAnnouncement, setJumpAnnouncement] = useState('');
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
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showOnboardingCard, setShowOnboardingCard] = useState(false);
  const [guideLanguage, setGuideLanguage] = useState<GuideLanguage>('en');
  const [homeTheme, setHomeTheme] = useState<'calm' | 'bright'>('calm');
  const preferredPdfMode = documentRecord?.location.kind === 'pdf' ? (documentRecord.location.viewMode ?? (desktop ? preferences.pdfViewMode : preferences.pdfMobileViewMode)) : (desktop ? preferences.pdfViewMode : preferences.pdfMobileViewMode);
  const ocrLanguage = documentRecord?.pdfOcrLanguage ?? 'eng';
  const hasSelectedOcr = ocrPages.some(record => record.language === ocrLanguage);
  const pdfMode = documentRecord?.kind === 'pdf' && preferredPdfMode === 'reading' && !pdfHasReadableText(documentRecord) && !hasSelectedOcr ? 'original' : preferredPdfMode;
  const ocrQueue = usePdfOcrQueue(documentRecord, ocrLanguage, ocrPages,
    record => setOcrPages(pages => [...pages.filter(page => page.key !== record.key), record]),
    () => setOcrPages([]));
  useEffect(() => {
    const id = documentRecord?.kind === 'pdf' ? documentRecord.id : null;
    setOcrPages([]);
    setOcrCacheReadyId(null);
    if (!id) return;
    let cancelled = false;
    void loadOcrPages(id).then(records => { if (!cancelled) { setOcrPages(records); setOcrCacheReadyId(id); } }).catch(() => { if (!cancelled) setOcrCacheReadyId(id); });
    return () => { cancelled = true; };
  }, [documentRecord?.id]);
  useEffect(() => {
    if (!documentRecord || documentRecord.kind !== 'pdf' || ocrCacheReadyId !== documentRecord.id || !documentRecord.pdfPages?.length) return;
    const firstPages = documentRecord.pdfPages.slice(0, 12);
    if (firstPages.some(page => !page.plainText.trim() && ocrCandidate(documentRecord, page.pageNumber, ocrLanguage, ocrPages, documentRecord.pdfHash))) void ocrQueue.preloadFirstTwelve();
  }, [ocrCacheReadyId]);
  useEffect(() => { if (!desktop && (lookupOpen || showNotes)) setContentsOpen(false); }, [desktop, lookupOpen, showNotes]);
  const requestRef = useRef<AbortController | null>(null);
  const contextRequestRef = useRef<AbortController | null>(null);
  const importControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void loadEngineSettings().then(setEngineSettings).catch(() => {});
    void Promise.all([ensureLocalDictionaryAssets(), loadDictionaryPacks()]).catch(() => {
      setImportError('The offline dictionary could not load. Reconnect and reload to download it.');
    });
    void maintainStorageBudget();
    void hasSeenContextLensOnboarding().then(seen => setShowOnboardingCard(!seen)).catch(() => {});
    void loadGuideLanguage().then(setGuideLanguage).catch(() => {});
    void db.settings.get('homepage.theme').then(record => setHomeTheme(record?.value === 'bright' ? 'bright' : 'calm')).catch(() => {});
    void Promise.all([loadPreferences(), loadAiSettings(), db.vocabulary.orderBy('createdAt').reverse().limit(20).toArray()]).then(([prefs, ai, words]) => {
      setPreferences(prefs); setPreferencesLoaded(true); setAiSettings(ai); setVocabulary(words);
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
        setDocumentRecord(doc);
      }).catch((error: unknown) => setImportError(importErrorMessage(error))).finally(() => { setImporting(false); setImportProgress(null); importControllerRef.current = null; });
    }
    else if (sharedText) setSharedDraft(sharedText);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLibraryLoading(true);
    const timer = window.setTimeout(() => {
      void queryDocumentLibrary({ query: libraryQuery, kind: libraryKind, limit: 18 }).then(result => {
        if (cancelled) return;
        setLibraryDocs(result.items); setLibraryHasMore(result.hasMore);
      }).finally(() => { if (!cancelled) setLibraryLoading(false); });
    }, 120);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [libraryQuery, libraryKind]);

  useEffect(() => {
    void db.documents.orderBy('updatedAt').reverse().limit(16).toArray().then(documents => setContinueDocs(documents.filter(document => document.location.progress > 0).slice(0, 4)));
  }, [documentRecord]);

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

  const pdfPersistence = useMemo(() => createLocationPersistence(location => {
    if (documentRecord) void db.documents.update(documentRecord.id, { location, updatedAt: Date.now() });
  }), [documentRecord?.id]);
  useEffect(() => {
    const flush = () => pdfPersistence.flush();
    const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', hidden);
    return () => { flush(); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hidden); };
  }, [pdfPersistence]);
  const trackPdfLocation = (location: import('../documents/location').PdfDocumentLocation) => {
    setCurrentLocation(location); setProgress(location.progress); pdfPersistence.update(location);
  };
  useEffect(() => {
    if (!documentRecord) return;
    const originalPdf = documentRecord.kind === 'pdf';
    if (!originalPdf) restoreTextLocation(documentRecord);
    setProgress(documentRecord.location.progress);
    setCurrentLocation(documentRecord.location);
    const persist = debounce(() => {
      const location = captureDocumentLocation(documentRecord);
      setProgress(location.progress); setCurrentLocation(location);
      void db.documents.update(documentRecord.id, { location, updatedAt: Date.now() });
    }, 250);
    const onScroll = () => persist.run();
    const onPageHide = () => persist.flush();
    const onVisibility = () => { if (document.visibilityState === 'hidden') persist.flush(); };
    if (!originalPdf) window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
      persist.flush();
    };
  }, [documentRecord?.id, pdfMode]);

  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    if (preferencesLoaded) void savePreferences(preferences);
  }, [preferences, preferencesLoaded]);

  const readerStyle = useMemo(() => ({
    '--reader-size': `${preferences.fontSize}px`, '--reader-leading': String(preferences.lineHeight),
    '--reader-font': preferences.fontFamily === 'serif' ? 'Georgia, Cambria, serif' : 'system-ui, sans-serif'
  }), [preferences]);

  const openDocument = async (doc: DocumentRecord) => {
    const current = await db.documents.get(doc.id) ?? doc;
    setDocumentRecord(current);
    if (current.toc?.length || (current.tocVersion ?? 0) >= 2 || !current.data || !['pdf', 'epub'].includes(current.kind)) return;
    try {
      const file = new File([current.data], `${current.title}.${current.kind}`, { type: current.data.type });
      const indexed = await importLocalFile(file);
      const oldOffsets = current.kind === 'pdf' ? current.pageOffsets : current.chapterOffsets;
      const newOffsets = current.kind === 'pdf' ? indexed.pageOffsets : indexed.chapterOffsets;
      if (JSON.stringify(oldOffsets) !== JSON.stringify(newOffsets) || current.content !== indexed.content) return;
      await db.documents.update(current.id, { toc: indexed.toc, tocSource: indexed.tocSource, tocVersion: indexed.tocVersion });
      setDocumentRecord(open => open?.id === current.id ? { ...open, toc: indexed.toc, tocSource: indexed.tocSource, tocVersion: indexed.tocVersion } : open);
    } catch { /* Keep the original document usable if re-indexing fails. */ }
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
    setDocumentRecord(doc);
  };
  const closeDocument = async () => {
    requestRef.current?.abort(); contextRequestRef.current?.abort();
    if (documentRecord?.kind === 'pdf') pdfPersistence.flush();
    else if (documentRecord) await saveDocumentLocation(documentRecord);
    setDocumentRecord(null); setLookupOpen(false); setShowNotes(false); setContentsOpen(false); setGoToOpen(false); setActiveSelection(null);
    const result = await queryDocumentLibrary({ query: libraryQuery, kind: libraryKind, limit: 18 });
    setLibraryDocs(result.items); setLibraryHasMore(result.hasMore);
  };

  const runLookup = (selection: ReaderSelection, mode = preferences.languageMode, engines = engineSettings) => {
    requestRef.current?.abort();
    contextRequestRef.current?.abort();
    const controller = new AbortController(); requestRef.current = controller;
    const request = makeRequest(selection, mode);
    // Invalidate the previous selection before moving/opening the surface. The
    // asynchronous local lookup below is the first result that should be shown.
    setLookup(null);
    setActiveSelection(selection); setShowNotes(false); if (!desktop) setContentsOpen(false); setLookupOpen(true); setError(null);
    setContextResult(null); setLoading(false);
    const immediate = lookupService.immediate(request, engines);
    setSaved(false);
    if (documentRecord) void isVocabularySaved(documentRecord.id, immediate).then(value => { if (!controller.signal.aborted) setSaved(value); });
    // A stable selection delay avoids network calls during repeated mobile selection changes.
    const timer = window.setTimeout(() => { void lookupService.quick(request, engines, controller.signal, local => {
      if (!controller.signal.aborted) setLookup(local);
    }).then((result) => {
      if (result && !controller.signal.aborted) {
        setLookup(result);
        if (documentRecord) void isVocabularySaved(documentRecord.id, result).then(value => { if (!controller.signal.aborted) setSaved(value); });
      }
    }).catch((failure: unknown) => {
      if (controller.signal.aborted || immediate.difficulty.worth_learning || immediate.quick.lexical_unit) return;
      if (import.meta.env.VITE_MANAGED_TRANSLATION === 'true') {
        if (failure instanceof EngineError && failure.code === 'QUOTA') setError('Online translation limit reached. Cached and offline meanings remain available.');
        else if (failure instanceof EngineError && ['TIMEOUT', 'PROVIDER_DOWN', 'NETWORK'].includes(failure.code)) setError('Online translation is temporarily unavailable. You can continue reading.');
      }
    }); }, 0);
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
    setLookup(current => current ? { ...current, language_mode: mode } : current);
    setContextResult(current => current ? { ...current, language_mode: mode } : current);
  };
  const translateSelectedSentence = () => {
    if (!activeSelection || !lookup) return;
    contextRequestRef.current?.abort();
    const controller = new AbortController(); contextRequestRef.current = controller;
    setLoading(true); setError(null);
    void lookupService.translateSentence(makeRequest(activeSelection, preferences.languageMode), engineSettings, controller.signal).then(translation => {
      if (controller.signal.aborted) return;
      setContextResult({ ...lookup, source: translation.cached ? 'cache' : translation.provider === 'browser' ? 'browser' : 'translation',
        deep: { ...lookup.deep, sentence_analysis: { ...lookup.deep.sentence_analysis, translation_vi: translation.targetLang === 'vi' ? translation.text : '' },
          context_explanation_en: translation.targetLang === 'en' ? translation.text : lookup.deep.context_explanation_en } });
    }).catch(() => { if (!controller.signal.aborted) setError('Sentence translation is unavailable. Local word meanings remain available.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
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
      const vocabularyLocation = documentRecord.kind === 'pdf' && currentLocation.kind === 'pdf' && activeSelection?.ocr
        ? { ...currentLocation, page: activeSelection.pdfPage ?? currentLocation.page, textOffset: activeSelection.offset, textSource: 'ocr' as const, viewMode: 'reading' as const }
        : documentRecord.kind === 'pdf' ? currentLocation : captureDocumentLocation(documentRecord);
      const currentDocument = { ...documentRecord, location: vocabularyLocation };
      const id = await saveVocabulary(currentDocument, contextResult ? { ...lookup, deep: contextResult.deep } : lookup);
      const record = await db.vocabulary.get(id);
      if (record) setVocabulary((items) => [record, ...items.filter((item) => item.id !== id)]);
      setSaved(true);
    }
  };

  const jump = (offset: number) => {
    if (!documentRecord) return;
    if (documentRecord.kind === 'pdf') {
      const page = pdfPageForOffset(documentRecord.pageOffsets, offset);
      const location: DocumentLocation = { kind: 'pdf', page, viewMode: pdfMode, textOffset: offset - pdfOffsetForPage(documentRecord.pageOffsets, page), absoluteOffset: offset, pageOffset: 0, scrollY: 0, progress: documentRecord.content.length ? offset / documentRecord.content.length : 0, updatedAt: Date.now() };
      pdfPersistence.flush(); setPdfNavigationToken(value => value + 1);
      setCurrentLocation(location); setProgress(location.progress);
      void db.documents.update(documentRecord.id, { location, updatedAt: Date.now() });
      return;
    }
    jumpToOffset(offset);
    const location = locationAtOffset(documentRecord, offset);
    setCurrentLocation(location); setProgress(location.progress);
    setJumpAnnouncement(`Moved to ${positionLabel(documentRecord, location)}`);
    void db.documents.update(documentRecord.id, { location, updatedAt: Date.now() });
  };
  const jumpPdfPage = (page: number) => {
    if (!documentRecord || documentRecord.kind !== 'pdf' || !Number.isInteger(page) || page < 1 || page > (documentRecord.pageOffsets?.length ?? 0)) return;
    const absoluteOffset = pdfOffsetForPage(documentRecord.pageOffsets, page);
    const location: DocumentLocation = { kind: 'pdf', page, viewMode: pdfMode, pageOffset: 0, textOffset: 0, absoluteOffset, scrollY: 0, progress: (page - 1) / documentRecord.pageOffsets!.length, updatedAt: Date.now() };
    pdfPersistence.flush(); setPdfNavigationToken(value => value + 1);
    setCurrentLocation(location); setProgress(location.progress);
    void db.documents.update(documentRecord.id, { location, updatedAt: Date.now() });
  };
  const openNotes = (selection: ReaderSelection | null) => {
    if (!documentRecord) return;
    setNoteSelection(selection);
    const captured = selection?.ocr && currentLocation.kind === 'pdf'
      ? (() => { const page = selection.pdfPage ?? currentLocation.page; const length = ocrPages.find(record => record.page === page && record.language === ocrLanguage)?.text.length ?? 0; const pageOffset = length ? Math.min(1, selection.offset / length) : 0; return { ...currentLocation, page, pageOffset, textOffset: selection.offset, textSource: 'ocr' as const, absoluteOffset: pdfOffsetForPage(documentRecord.pageOffsets, page), progress: (page - 1 + pageOffset) / (documentRecord.pageOffsets?.length ?? 1), viewMode: 'reading' as const }; })()
      : selection ? locationAtOffset(documentRecord, selection.offset) : currentLocation;
    setNoteLocation(captured.kind === 'pdf' ? { ...captured, viewMode: pdfMode } : captured);
    setLookupOpen(false); if (!desktop) setContentsOpen(false); setShowNotes(true);
  };
  const changePdfViewMode = (mode: 'original' | 'reading') => {
    if (!documentRecord || documentRecord.kind !== 'pdf' || mode === pdfMode || (mode === 'reading' && !pdfHasReadableText(documentRecord) && !hasSelectedOcr)) return;
    const offset = currentLocation.absoluteOffset ?? (currentLocation.kind === 'pdf' ? pdfOffsetForPage(documentRecord.pageOffsets, currentLocation.page) : 0);
    const page = currentLocation.kind === 'pdf' ? currentLocation.page : pdfPageForOffset(documentRecord.pageOffsets, offset);
    const pageStart = pdfOffsetForPage(documentRecord.pageOffsets, page);
    const pageEnd = documentRecord.pageOffsets?.[page] ?? documentRecord.content.length;
    const pageFraction = currentLocation.kind === 'pdf' ? currentLocation.pageOffset ?? 0 : Math.max(0, Math.min(1, (offset - pageStart) / Math.max(1, pageEnd - pageStart)));
    const nextLocation: DocumentLocation = mode === 'original'
      ? { kind: 'pdf', viewMode: mode, page, pageOffset: pageFraction, textOffset: currentLocation.kind === 'pdf' ? currentLocation.textOffset : undefined, textSource: currentLocation.kind === 'pdf' ? currentLocation.textSource : undefined, absoluteOffset: offset, scrollY: 0, progress: (page - 1 + pageFraction) / (documentRecord.pageOffsets?.length ?? 1), updatedAt: Date.now() }
      : { kind: 'pdf', viewMode: mode, page, pageOffset: pageFraction, textOffset: currentLocation.kind === 'pdf' ? currentLocation.textOffset : undefined, textSource: currentLocation.kind === 'pdf' ? currentLocation.textSource : undefined, absoluteOffset: offset, scrollY: 0, progress: (page - 1 + pageFraction) / (documentRecord.pageOffsets?.length ?? 1), updatedAt: Date.now() };
    pdfPersistence.flush(); setPdfNavigationToken(value => value + 1);
    setCurrentLocation(nextLocation); setProgress(nextLocation.progress);
    setDocumentRecord(current => current?.id === documentRecord.id ? { ...current, location: nextLocation } : current);
    setPreferences(current => desktop ? { ...current, pdfViewMode: mode } : { ...current, pdfMobileViewMode: mode });
    void db.documents.update(documentRecord.id, { location: nextLocation, updatedAt: Date.now() });
  };
  const choosePdfTextSource = (page: number, source: 'pdf' | 'ocr') => {
    if (!documentRecord || documentRecord.kind !== 'pdf') return;
    const pdfTextSources = { ...documentRecord.pdfTextSources, [page]: source };
    setDocumentRecord(current => current?.id === documentRecord.id ? { ...current, pdfTextSources } : current);
    void db.documents.update(documentRecord.id, { pdfTextSources });
    changePdfViewMode('reading');
  };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!documentRecord || !keyboardCanNavigate(event)) return;
      if (event.key.toLowerCase() === 't') { event.preventDefault(); setContentsOpen(value => !value); }
      if (event.key.toLowerCase() === 'g') { event.preventDefault(); setGoToOpen(true); }
      if (documentRecord.kind === 'pdf' && currentLocation.kind === 'pdf' && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        const offset = navigationOffset(documentRecord, currentLocation.page + (event.key === 'ArrowRight' ? 1 : -1));
        if (offset !== null) { event.preventDefault(); jumpPdfPage(currentLocation.page + (event.key === 'ArrowRight' ? 1 : -1)); }
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [documentRecord, currentLocation]);
  const sections = useMemo(() => documentRecord?.toc ?? (documentRecord?.safeHtml ? htmlSections(documentRecord.safeHtml).toc : textSections(documentRecord?.content ?? '')), [documentRecord]);
  const openOnboarding = () => { setShowOnboarding(true); setShowOnboardingCard(false); void markContextLensOnboardingSeen(); };
  const dismissOnboarding = () => { setShowOnboardingCard(false); void markContextLensOnboardingSeen(); };
  const changeGuideLanguage = (value: GuideLanguage) => { setGuideLanguage(value); void saveGuideLanguage(value); };
  const changeHomeTheme = (value: 'calm' | 'bright') => { setHomeTheme(value); void db.settings.put({ key: 'homepage.theme', value }); };

  if (!documentRecord) return (
    <main class="home-shell" data-home-theme={homeTheme}>
      {!online && <div class="status-banner" role="status">Offline mode · Saved documents and cached meanings remain available.</div>}
      {updateReady && <button class="status-banner update-banner" onClick={() => window.dispatchEvent(new Event('context-lens:apply-update'))}>An update is ready · Reload</button>}
      <header class="brand-header">
        <div class="brand-lockup"><div class="brand-mark">C</div><div><h1>Context Lens</h1><p>Read English. Stay in context.</p></div></div>
        <nav class="home-nav" aria-label="Library tools">
          <button class="nav-button" aria-label="Saved words" onClick={() => setShowVocabulary(true)}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 4h12a2 2 0 0 1 2 2v14l-8-3.5L4 20V6a2 2 0 0 1 2-2Z"/></svg><span>Saved words</span></button>
          <button class="nav-button" aria-label="Storage" onClick={() => setShowDataManagement(true)}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M6 3h12l2 4v13H4V7l2-4Zm3 8h6"/></svg><span>Storage</span></button>
          <button class="nav-button" aria-label="Settings" onClick={() => setShowApiSettings(true)}><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M4.9 4.9 7 7m10 10 2.1 2.1M2 12h3m14 0h3M4.9 19.1 7 17M17 7l2.1-2.1"/></svg><span>Settings</span></button>
          <button class="nav-button" aria-label="Guide" onClick={openOnboarding}><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 3.6 2.25c-.85.45-1.3.95-1.3 1.75m0 3h.01"/></svg><span>Guide</span></button>
          <LanguageToggle language={guideLanguage} onChange={changeGuideLanguage} />
          <div class="home-theme-toggle" role="group" aria-label={guideLanguage === 'vi' ? 'Màu trang chủ' : 'Homepage color theme'}>
            <button aria-pressed={homeTheme === 'calm'} onClick={() => changeHomeTheme('calm')}>{guideLanguage === 'vi' ? 'Dịu' : 'Calm'}</button>
            <button aria-pressed={homeTheme === 'bright'} onClick={() => changeHomeTheme('bright')}>{guideLanguage === 'vi' ? 'Tươi' : 'Bright'}</button>
          </div>
        </nav>
      </header>
      <section class="home-intro"><p class="eyebrow">Your reading space</p><h2>Start reading.</h2><p>Paste a passage or open a document. Select any word or phrase when you need context.</p></section>
      <div class="primary-actions">
        <PasteComposer disabled={importing} initialText={sharedDraft} onCreate={imported => void storeImportedDocument(imported)} />
        <section class="action-card import-card">
          <div class="action-card-heading"><span class="action-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 16V3m0 0L7 8m5-5 5 5M4 14v6h16v-6"/></svg></span><div><p class="eyebrow">Your files</p><h2>Import a book or document</h2><p>TXT, Markdown, PDF, EPUB, or DOCX.</p></div></div>
          <label class="document-drop"><input class="visually-hidden" type="file" disabled={importing} accept=".txt,.md,.markdown,.pdf,.epub,.docx,text/plain,text/markdown,application/pdf,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => void importTextFile(event.currentTarget.files?.[0])} /><span>{importing ? 'Importing…' : 'Choose a document'}</span><small>5 MB for text · 50 MB for books</small></label>
          <div class="import-form"><label for="article-url">Or import an article URL</label><div><input id="article-url" type="url" inputMode="url" value={articleUrl} onInput={(event) => setArticleUrl(event.currentTarget.value)} placeholder="https://example.com/article" /><button class="secondary-button" onClick={importArticleUrl} disabled={!articleUrl.trim() || importing}>Import URL</button></div></div>
          {importError && <p class="import-error" role="alert">{importError}</p>}
          {importProgress && <div class="import-progress" role="status"><span>{importProgress}</span><button onClick={() => importControllerRef.current?.abort()}>Cancel</button></div>}
        </section>
      </div>
      <section class="continue-section"><div class="section-heading"><div><p class="eyebrow">Continue</p><h2>Pick up where you left off</h2></div></div>{continueDocs.length ? <div class="continue-grid">{continueDocs.map(doc => <button class="continue-card" onClick={() => void openDocument(doc)}><span class={`document-badge kind-${doc.kind}`}>{documentKindLabel(doc)}</span><strong>{doc.title}</strong><small>{positionLabel(doc, doc.location)}</small><span class="mini-progress"><i style={{ width: `${Math.round(doc.location.progress * 100)}%` }} /></span></button>)}</div> : <p class="section-empty">Your reading progress will appear here.</p>}</section>
      <section class="library-section">
        <div class="section-heading"><div><p class="eyebrow">Library</p><h2>All documents</h2></div></div>
        <div class="library-tools"><label class="library-search"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/></svg><input value={libraryQuery} onInput={event => setLibraryQuery(event.currentTarget.value)} placeholder="Search by title" aria-label="Search library" /></label><select aria-label="Filter document type" value={libraryKind} onChange={event => setLibraryKind(event.currentTarget.value as typeof libraryKind)}><option value="all">All types</option><option value="pdf">PDF</option><option value="epub">EPUB</option><option value="docx">DOCX</option><option value="article">Articles</option><option value="text">Text</option><option value="markdown">Markdown</option></select></div>
        {libraryLoading && !libraryDocs.length ? <p class="section-empty" role="status">Loading your library…</p> : libraryDocs.length ? <div class="library-grid">{libraryDocs.map(doc => <article class="library-card"><button class="library-open" onClick={() => void openDocument(doc)}><span class={`document-badge kind-${doc.kind}`}>{documentKindLabel(doc)}</span><strong>{doc.title}</strong><small>{documentPositionDetail(doc)}</small><span class="mini-progress"><i style={{ width: `${Math.round(doc.location.progress * 100)}%` }} /></span></button><button class="icon-button library-delete" aria-label={`Delete ${doc.title}`} onClick={() => { if (confirm(`Delete “${doc.title}” and its notes from this device?`)) { void db.transaction('rw', [db.documents, db.notes, db.pdfOcr], async () => { await db.documents.delete(doc.id); await db.notes.where('documentId').equals(doc.id).delete(); await db.pdfOcr.where('documentId').equals(doc.id).delete(); }).then(async () => { const result = await queryDocumentLibrary({ query: libraryQuery, kind: libraryKind, limit: 18 }); setLibraryDocs(result.items); setLibraryHasMore(result.hasMore); setContinueDocs(items => items.filter(item => item.id !== doc.id)); }); } }}>×</button></article>)}</div> : <p class="section-empty">{libraryQuery || libraryKind !== 'all' ? 'No documents match this search.' : 'Your imported documents will appear here.'}</p>}
        {libraryHasMore && <button class="secondary-button load-more" disabled={libraryLoading} onClick={() => { setLibraryLoading(true); void queryDocumentLibrary({ query: libraryQuery, kind: libraryKind, offset: libraryDocs.length, limit: 18 }).then(result => { setLibraryDocs(items => [...items, ...result.items]); setLibraryHasMore(result.hasMore); }).finally(() => setLibraryLoading(false)); }}>Load more</button>}
      </section>
      {showOnboardingCard && <OnboardingCard language={guideLanguage} onOpen={openOnboarding} onDismiss={dismissOnboarding} />}
      <p class="home-note">Documents stay on this device. Offline reading remains available after the first visit.</p>
      {showOnboarding && <ContextLensOnboarding language={guideLanguage} onLanguageChange={changeGuideLanguage} onClose={() => setShowOnboarding(false)} />}
      {showApiSettings && <ApiSettings initialEngines={engineSettings} initial={aiSettings} health={lookupService.diagnostics()} onClose={() => setShowApiSettings(false)} onSave={saveSetup} />}
      {showVocabulary && <VocabularyLibrary records={vocabulary} onClose={() => setShowVocabulary(false)} onDelete={(id) => { void db.vocabulary.delete(id); setVocabulary((items) => items.filter((item) => item.id !== id)); }} />}
      {showDataManagement && <DataManagement onClose={() => setShowDataManagement(false)} onRestored={() => { void queryDocumentLibrary({ query: libraryQuery, kind: libraryKind, limit: 18 }).then(result => { setLibraryDocs(result.items); setLibraryHasMore(result.hasMore); }); void db.documents.orderBy('updatedAt').reverse().limit(16).toArray().then(documents => setContinueDocs(documents.filter(document => document.location.progress > 0).slice(0, 4))); void db.vocabulary.orderBy('createdAt').reverse().limit(20).toArray().then(setVocabulary); }} />}
    </main>
  );

  const activeOcrProgress = ocrQueue.status && ['preparing', 'running', 'paused'].includes(ocrQueue.status.state) ? ocrQueue.status : null;
  const progressPercent = activeOcrProgress ? activeOcrProgress.total ? (activeOcrProgress.completed + activeOcrProgress.progress / 100) / activeOcrProgress.total * 100 : 0 : progress * 100;
  return (
    <ReaderShell contentsOpen={contentsOpen} contextOpen={(lookupOpen && lookupDisplay === 'panel') || showNotes}>
      {!online && <div class="reader-offline" role="status">Offline</div>}
      <ReaderToolbar title={documentRecord.title} contentsOpen={contentsOpen} highlightAvailable highlightActive={activeMarkupTool !== null} highlightOpen={highlightToolsOpen} onHighlight={() => setHighlightToolsOpen(value => !value)} onBack={() => void closeDocument()} onContents={() => setContentsOpen(!contentsOpen)} onNote={() => openNotes(null)} onSettings={() => setShowReaderSettings(!showReaderSettings)} onEngines={() => setShowApiSettings(true)}>
        {documentRecord.kind === 'pdf' && currentLocation.kind === 'pdf' ? <><PdfModeSwitch mode={pdfMode} canRead={pdfHasReadableText(documentRecord) || hasSelectedOcr} hasPdfText={Boolean(documentRecord.pdfPages?.[currentLocation.page - 1]?.plainText.trim())} hasOcr={ocrPages.some(record => record.page === currentLocation.page && record.language === ocrLanguage)} language={ocrLanguage} onOriginal={() => changePdfViewMode('original')} onReading={() => changePdfViewMode('reading')} onSource={source => choosePdfTextSource(currentLocation.page, source)} onLanguage={language => { setDocumentRecord(current => current?.id === documentRecord.id ? { ...current, pdfOcrLanguage: language } : current); void db.documents.update(documentRecord.id, { pdfOcrLanguage: language }); }} onRecognize={count => { void ocrQueue.start(currentLocation.page, count); }} queueStatus={ocrQueue.status} onPause={ocrQueue.pause} onContinue={ocrQueue.continueQueue} onCancel={ocrQueue.cancel} hasAnyOcr={ocrPages.length > 0} onClear={() => { if (confirm('Xóa kết quả OCR của tài liệu này khỏi thiết bị?')) void ocrQueue.clear(); }} nextPageCount={Math.max(0, (documentRecord.pageOffsets?.length ?? 0) - currentLocation.page)} /><PageNavigation page={currentLocation.page} total={documentRecord.pageOffsets?.length ?? 1} onPrevious={() => jumpPdfPage(currentLocation.page - 1)} onNext={() => jumpPdfPage(currentLocation.page + 1)} onOpen={() => setGoToOpen(true)} /></> : <DocumentPosition document={documentRecord} location={currentLocation} onOpen={() => setGoToOpen(true)} />}
      </ReaderToolbar>
      {highlightToolsOpen && <MarkupPalette tool={activeMarkupTool} color={activeMarkupColor} onToolChange={setActiveMarkupTool} onColorChange={setActiveMarkupColor} onClose={() => setHighlightToolsOpen(false)} />}
      {showReaderSettings && <ReaderSettings value={preferences} onChange={setPreferences} onClose={() => setShowReaderSettings(false)} />}
      {goToOpen && <GoToLocation document={documentRecord} onClose={() => setGoToOpen(false)} onJump={jump} onPage={jumpPdfPage} />}
      {contentsOpen && <ContentsPanel sections={sections} offset={currentLocation.absoluteOffset ?? 0} onJump={jump} onClose={() => setContentsOpen(false)} />}
      <div class="visually-hidden" role="status" aria-live="polite">{jumpAnnouncement}</div>
      <div class="progress-line" role="progressbar" aria-label={activeOcrProgress ? 'OCR progress' : 'Reading progress'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressPercent)}><span style={{ width: `${progressPercent}%` }} /></div>
      <div class="reader-viewport">
      {documentRecord.kind === 'pdf' && ocrQueue.status && <div class="pdf-queue-status" role="status">
        <span>{ocrQueue.status.state === 'error' ? 'OCR lỗi' : ocrQueue.status.state === 'paused' ? 'OCR tạm dừng' : ocrQueue.status.state === 'done' ? 'OCR hoàn tất' : 'OCR'} · {ocrQueue.status.completed}/{ocrQueue.status.total}{ocrQueue.status.page ? ` · trang ${ocrQueue.status.page} ${ocrQueue.status.progress}%` : ''}{ocrQueue.status.message ? ` · ${ocrQueue.status.message}` : ''}</span>
        {ocrQueue.status.state === 'running' && <button onClick={ocrQueue.pause}>Tạm dừng</button>}
        {ocrQueue.status.state === 'paused' && <button onClick={ocrQueue.continueQueue}>Tiếp tục</button>}
        <button onClick={ocrQueue.cancel}>{['error', 'done'].includes(ocrQueue.status.state) ? 'Đóng' : 'Hủy OCR'}</button>
      </div>}
      {documentRecord.source && <div class="reader-source">{documentRecord.source.author && <span>{documentRecord.source.author}</span>}{documentRecord.source.siteName && <span>{documentRecord.source.siteName}</span>}{documentRecord.source.url && <a href={documentRecord.source.url} target="_blank" rel="noreferrer noopener">Original ↗</a>}</div>}
      {documentRecord.kind === 'pdf' && pdfMode === 'original' && currentLocation.kind === 'pdf'
        ? <PdfViewer key={documentRecord.id} documentRecord={documentRecord} location={currentLocation} zoomMode={desktop ? preferences.pdfZoomMode : 'fit-width'} ocrBusy={Boolean(ocrQueue.status && !['error', 'done'].includes(ocrQueue.status.state))} onZoomMode={pdfZoomMode => setPreferences(current => ({ ...current, pdfZoomMode }))} activeMarkupTool={activeMarkupTool} activeMarkupColor={activeMarkupColor} navigationToken={pdfNavigationToken} onLocation={trackPdfLocation} onLookup={runLookup} onAddNote={selection => openNotes(selection)} onHighlight={highlight => setDocumentRecord(current => { if (!current || current.id !== documentRecord.id) return current; const highlights = upsertHighlight(current.highlights ?? [], highlight); void db.documents.update(current.id, { highlights, updatedAt: Date.now() }); return { ...current, highlights }; })} onErase={(startOffset, endOffset) => setDocumentRecord(current => { if (!current || current.id !== documentRecord.id) return current; const highlights = eraseHighlights(current.highlights ?? [], startOffset, endOffset); void db.documents.update(current.id, { highlights, updatedAt: Date.now() }); return { ...current, highlights }; })} />
        : documentRecord.kind === 'pdf' && currentLocation.kind === 'pdf'
        ? <PdfReadingView key={documentRecord.id} documentRecord={documentRecord} location={currentLocation} style={readerStyle} ocrPages={ocrPages} ocrLanguage={ocrLanguage} onTextSource={(page, source) => { const pdfTextSources = { ...documentRecord.pdfTextSources, [page]: source }; setDocumentRecord(current => current?.id === documentRecord.id ? { ...current, pdfTextSources } : current); void db.documents.update(documentRecord.id, { pdfTextSources }); }} onOpenOriginal={() => changePdfViewMode('original')} activeMarkupTool={activeMarkupTool} activeMarkupColor={activeMarkupColor} navigationToken={pdfNavigationToken} onLocation={trackPdfLocation} onLookup={runLookup} onAddNote={selection => openNotes(selection)} onHighlight={highlight => setDocumentRecord(current => { if (!current || current.id !== documentRecord.id) return current; const highlights = upsertHighlight(current.highlights ?? [], highlight); void db.documents.update(current.id, { highlights, updatedAt: Date.now() }); return { ...current, highlights }; })} onErase={(startOffset, endOffset, ocrPage, ocrLanguage) => setDocumentRecord(current => { if (!current || current.id !== documentRecord.id) return current; const highlights = eraseHighlights(current.highlights ?? [], startOffset, endOffset, ocrPage, ocrLanguage); void db.documents.update(current.id, { highlights, updatedAt: Date.now() }); return { ...current, highlights }; })} />
        : <TextReader offsets={documentRecord.kind === 'pdf' ? documentRecord.pageOffsets : documentRecord.chapterOffsets} onAddNote={selection => openNotes(selection)} content={documentRecord.content} safeHtml={documentRecord.safeHtml} onLookup={runLookup} style={readerStyle} highlights={documentRecord.highlights} activeMarkupTool={activeMarkupTool} activeMarkupColor={activeMarkupColor} onHighlight={highlight => setDocumentRecord(current => { if (!current || current.id !== documentRecord.id) return current; const highlights = upsertHighlight(current.highlights ?? [], highlight); void db.documents.update(current.id, { highlights, updatedAt: Date.now() }); return { ...current, highlights }; })} onErase={(startOffset, endOffset) => setDocumentRecord(current => { if (!current || current.id !== documentRecord.id) return current; const highlights = eraseHighlights(current.highlights ?? [], startOffset, endOffset); void db.documents.update(current.id, { highlights, updatedAt: Date.now() }); return { ...current, highlights }; })} />}
      </div>
      <LookupBottomSheet displayMode={lookupDisplay} onDisplayModeChange={setLookupDisplay} anchor={activeSelection?.anchor} selectionKey={`${activeSelection?.offset}:${activeSelection?.text}`} selectionText={activeSelection?.text} debug={engineSettings.debugMode} contextResult={contextResult} onExplain={explainSelection} onTranslateSentence={translateSelectedSentence} open={lookupOpen} result={lookup} loading={loading} error={error} mode={preferences.languageMode} onModeChange={changeMode} onClose={() => { requestRef.current?.abort(); contextRequestRef.current?.abort(); setLookupOpen(false); }} onOpenSettings={() => setShowApiSettings(true)} onSpeak={pronounceEnglish} onToggleSave={() => void toggleVocabulary().catch(() => setError("Unable to save vocabulary. Please try again."))} onAddNote={() => openNotes(activeSelection)} saved={saved} collectionTitle={collectionTitle(documentRecord ?? {})} />
      {showApiSettings && <ApiSettings initialEngines={engineSettings} initial={aiSettings} health={lookupService.diagnostics()} onClose={() => setShowApiSettings(false)} onSave={saveSetup} />}
      {showNotes && <NotesPanel document={documentRecord} selection={noteSelection} location={noteLocation} onJump={location => { if (location.kind === 'pdf') { if (location.textSource) { const pdfTextSources = { ...documentRecord.pdfTextSources, [location.page]: location.textSource }; setDocumentRecord(current => current?.id === documentRecord.id ? { ...current, pdfTextSources } : current); void db.documents.update(documentRecord.id, { pdfTextSources }); } pdfPersistence.flush(); setPdfNavigationToken(value => value + 1); setCurrentLocation(location); setProgress(location.progress); setPreferences(current => desktop ? { ...current, pdfViewMode: location.viewMode ?? 'reading' } : { ...current, pdfMobileViewMode: location.viewMode ?? 'reading' }); return; } const offset = location.absoluteOffset ?? (location.kind === 'epub' ? documentRecord.chapterOffsets?.[location.chapter - 1] : undefined); if (offset !== undefined) jump(offset); else window.scrollTo({ top: location.scrollY, behavior: 'auto' }); }} onClose={() => setShowNotes(false)} />}
    </ReaderShell>
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

function documentKindLabel(document: DocumentRecord): string {
  if (document.kind === 'article') return 'Article';
  if (document.kind === 'markdown') return 'Markdown';
  if (document.kind === 'text') return document.safeHtml ? 'Formatted text' : 'Text';
  return document.kind.toUpperCase();
}

function documentPositionDetail(document: DocumentRecord): string {
  if (document.kind === 'pdf' && document.pageOffsets?.length) return `Page ${document.location.kind === 'pdf' ? document.location.page : 1} of ${document.pageOffsets.length}`;
  if (document.kind === 'epub' && document.chapterOffsets?.length) return `Chapter ${document.location.kind === 'epub' ? document.location.chapter : 1} of ${document.chapterOffsets.length}`;
  return document.location.progress > 0 ? `${Math.round(document.location.progress * 100)}% read` : 'Not started';
}
