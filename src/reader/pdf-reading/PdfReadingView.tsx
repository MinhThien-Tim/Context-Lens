import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { DocumentRecord, ReaderHighlight } from '../../db/database';
import type { PdfDocumentLocation } from '../../documents/location';
import { usePdfScroll } from '../pdf/usePdfScroll';
import { PdfReadingPage } from './PdfReadingPage';
import { readingPagesForDocument } from './structuredPages';
import type { ReaderSelection } from '../TextReader';
import { readingSelectionFromDom, readingWordAtPoint } from './readingSelectionAdapter';

export function PdfReadingView({ documentRecord, location, style, activeMarkupTool, activeMarkupColor, onLocation, onLookup, onAddNote, onHighlight, onErase, navigationToken = 0 }: { navigationToken?: number; documentRecord: DocumentRecord; location: PdfDocumentLocation; style: Record<string, string | number>; activeMarkupTool?: 'highlight' | 'underline' | 'eraser' | null; activeMarkupColor: ReaderHighlight['color']; onLocation: (location: PdfDocumentLocation) => void; onLookup: (selection: ReaderSelection) => void; onAddNote: (selection: ReaderSelection) => void; onHighlight: (highlight: ReaderHighlight) => void; onErase: (startOffset: number, endOffset: number) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ignoreClick = useRef(false);
  const highlightTimer = useRef<number | undefined>(undefined);
  const [pending, setPending] = useState<ReaderSelection | null>(null);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const pages = useMemo(() => readingPagesForDocument(documentRecord), [documentRecord]);
  const lastPosition = useRef('');
  const goTo = usePdfScroll(rootRef, '.pdf-reading-page', true, location, navigationToken, (page, pageOffset, scrollY) => {
    const model = pages[page - 1];
    if (!model) return;
    const key = `${page}:${Math.round(pageOffset * 1000)}:${Math.round(scrollY)}`;
    if (lastPosition.current === key) return;
    lastPosition.current = key;
    const textOffset = Math.round(model.plainText.length * pageOffset);
    onLocation({ kind: 'pdf', page, viewMode: 'reading', pageOffset, textOffset, absoluteOffset: model.startOffset + textOffset, scrollY, progress: (page - 1 + pageOffset) / pages.length, updatedAt: Date.now() });
  });
  const captureSelection = (commitHighlight = false) => {
    if (!rootRef.current) return null;
    const next = readingSelectionFromDom(rootRef.current, documentRecord.content);
    if (next) {
      setPending(next);
      if (activeMarkupTool && commitHighlight) {
        const endOffset = next.endOffset ?? next.offset + next.text.length;
        if (activeMarkupTool === 'eraser') onErase(next.offset, endOffset);
        else onHighlight({ id: crypto.randomUUID(), startOffset: next.offset, endOffset, color: activeMarkupColor, style: activeMarkupTool, createdAt: Date.now() });
      }
      ignoreClick.current = true;
    }
    return next;
  };
  useEffect(() => {
    let timer: number | undefined;
    const capture = () => {
      clearTimeout(timer);
      clearTimeout(highlightTimer.current);
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !rootRef.current?.contains(selection.anchorNode) || !rootRef.current?.contains(selection.focusNode)) return;
      timer = window.setTimeout(() => captureSelection(false), 160);
      if (activeMarkupTool) highlightTimer.current = window.setTimeout(() => captureSelection(true), 700);
    };
    document.addEventListener('selectionchange', capture);
    return () => { clearTimeout(timer); clearTimeout(highlightTimer.current); document.removeEventListener('selectionchange', capture); };
  }, [documentRecord.id, documentRecord.content, activeMarkupTool, activeMarkupColor]);
  return <div class="pdf-reading-view" style={style}>
    <div ref={rootRef} class={`pdf-reading-scroll ${activeMarkupTool ? 'highlight-mode-active' : ''} ${activeMarkupTool ? `markup-${activeMarkupTool}` : ''}`} onPointerUp={() => window.setTimeout(() => captureSelection(Boolean(activeMarkupTool)), 0)} onKeyUp={event => { if (event.shiftKey) captureSelection(Boolean(activeMarkupTool)); }} onClick={event => {
      if (ignoreClick.current) { ignoreClick.current = false; return; }
      const nativeSelection = window.getSelection();
      if (nativeSelection && !nativeSelection.isCollapsed) return;
      const next = rootRef.current && readingWordAtPoint(rootRef.current, documentRecord.content, event.clientX, event.clientY);
      if (next) onLookup(next);
    }}>{pages.map(page => <PdfReadingPage key={page.pageNumber} page={page} highlights={documentRecord.highlights} />)}</div>
    {pending && <div class="pdf-reading-selection-wrap"><div class="pdf-reading-selection-actions" role="toolbar" aria-label="Selected text actions"><button onPointerDown={event => event.preventDefault()} onClick={() => onLookup(pending)}>Explain</button><button aria-pressed={highlightOpen} class={highlightOpen ? 'active' : ''} onPointerDown={event => event.preventDefault()} onClick={() => setHighlightOpen(value => !value)}>Highlight</button><button onPointerDown={event => event.preventDefault()} onClick={() => onAddNote(pending)}>Note</button><button onPointerDown={event => event.preventDefault()} onClick={() => void navigator.clipboard?.writeText(pending.text)}>Copy</button><button aria-label="Close selection actions" onClick={() => { setPending(null); setHighlightOpen(false); window.getSelection()?.removeAllRanges(); }}>×</button></div>{highlightOpen && <div class="pdf-highlight-colors" role="group" aria-label="Highlight color">{(['yellow', 'pink', 'blue'] as const).map(color => <button key={color} class={`highlight-color highlight-color-${color}`} aria-label={`${color} highlight`} onPointerDown={event => event.preventDefault()} onClick={() => { onHighlight({ id: crypto.randomUUID(), startOffset: pending.offset, endOffset: pending.endOffset ?? pending.offset + pending.text.length, color, createdAt: Date.now() }); setHighlightOpen(false); setPending(null); window.getSelection()?.removeAllRanges(); }} />)}</div>}</div>}
  </div>;
}
