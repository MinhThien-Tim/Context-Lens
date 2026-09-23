import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { htmlSections } from '../documents/sections';
import { ImportError } from '../documents/import/types';
import { preparePastedDocument, type PasteMode } from '../documents/import/pasteImport';
import type { ImportedDocument } from '../documents/import/types';

export function PasteComposer({ onCreate, disabled, initialText = '' }: { onCreate: (document: ImportedDocument) => void; disabled?: boolean; initialText?: string }) {
  const [title, setTitle] = useState('Untitled reading');
  const [mode, setMode] = useState<PasteMode>('rich');
  const [plainText, setPlainText] = useState(initialText);
  const [safeHtml, setSafeHtml] = useState('');
  const [hasRichClipboard, setHasRichClipboard] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const richRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (initialText && richRef.current && !richRef.current.textContent) richRef.current.textContent = initialText; }, [initialText]);
  const visibleText = mode === 'rich' && safeHtml ? htmlSections(safeHtml).content : plainText;
  const wordCount = useMemo(() => visibleText.trim().split(/\s+/).filter(Boolean).length, [visibleText]);

  const changeMode = (next: PasteMode) => {
    if (next === mode) return;
    if (next === 'plain' && safeHtml) setPlainText(htmlSections(safeHtml).content);
    setMode(next);
    setMessage(next === 'plain' ? 'Plain text keeps paragraphs and line breaks, but original styling cannot be restored.' : hasRichClipboard ? null : 'Paste formatted content to preserve headings, lists, tables, and emphasis when available.');
  };

  const submit = () => {
    try {
      const imported = preparePastedDocument(title, { plainText: visibleText, html: mode === 'rich' ? safeHtml : undefined, mode });
      setMessage(null);
      onCreate(imported);
    } catch (error) {
      setMessage(error instanceof ImportError ? error.message : 'Unable to prepare this text.');
    }
  };

  return <section class="action-card paste-card">
    <div class="action-card-heading"><span class="action-card-icon" aria-hidden="true">Aa</span><div><p class="eyebrow">Quick start</p><h2>Paste text</h2><p>Review and edit before you read.</p></div></div>
    <label class="composer-title">Title<input value={title} onInput={event => setTitle(event.currentTarget.value)} /></label>
    <div class="paste-mode" role="group" aria-label="Paste format">
      <button class={mode === 'rich' ? 'active' : ''} aria-pressed={mode === 'rich'} onClick={() => changeMode('rich')}>Keep formatting</button>
      <button class={mode === 'plain' ? 'active' : ''} aria-pressed={mode === 'plain'} onClick={() => changeMode('plain')}>Plain text</button>
    </div>
    {mode === 'rich' ? <div
      ref={richRef}
      class="paste-editor article-content"
      contentEditable
      role="textbox"
      aria-multiline="true"
      aria-label="Paste and edit formatted text"
      data-placeholder="Paste from a web page, Word, or Google Docs…"
      onPaste={event => {
        const html = event.clipboardData?.getData('text/html') ?? '';
        const text = event.clipboardData?.getData('text/plain') ?? '';
        if (!html) {
          event.preventDefault();
          document.execCommand('insertText', false, text);
          setPlainText(text);
          setSafeHtml('');
          setHasRichClipboard(false);
          setMessage('This clipboard has no HTML. Paragraphs and line breaks are kept, but the original layout cannot be recovered.');
          return;
        }
        event.preventDefault();
        try {
          const prepared = preparePastedDocument(title, { plainText: text, html, mode: 'rich' });
          setSafeHtml(prepared.safeHtml ?? '');
          setPlainText(prepared.content);
          setHasRichClipboard(true);
          setMessage(/<img\b/i.test(html) && !/<img\b/i.test(prepared.safeHtml ?? '') ? 'External images were removed for privacy. Text structure is preserved where the clipboard provides it.' : null);
          if (richRef.current) richRef.current.innerHTML = prepared.safeHtml ?? '';
        } catch (error) { setMessage(error instanceof ImportError ? error.message : 'Unable to read the clipboard.'); }
      }}
      onInput={event => {
        const element = event.currentTarget;
        setSafeHtml(element.innerHTML);
        setPlainText(element.innerText);
      }}
    /> : <textarea aria-label="Paste and edit plain text" value={plainText} onInput={event => setPlainText(event.currentTarget.value)} placeholder="Paste text here…" />}
    {message && <p class="paste-message" role="status">{message}</p>}
    <div class="action-card-footer"><span>{wordCount} words</span><button class="primary-button" disabled={disabled || !visibleText.trim()} onClick={submit}>Preview &amp; read <span aria-hidden="true">→</span></button></div>
  </section>;
}
