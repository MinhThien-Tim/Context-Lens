import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { DocumentRecord, ReaderHighlight } from '../../db/database';
import type { PdfDocumentLocation } from '../../documents/location';
import { usePdfScroll } from '../pdf/usePdfScroll';
import { PdfReadingPage } from './PdfReadingPage';
import { readingPagesForDocument } from './structuredPages';
import type { ReaderSelection } from '../TextReader';
import { readingSelectionFromDom, readingWordAtPoint } from './readingSelectionAdapter';
import type { PdfOcrRecord } from '../../db/database';
import { PdfOcrReadingPage } from './PdfOcrReadingPage';
import { pdfPageNeedsOcr } from './structuredPages';
import type { OcrLanguage } from '../../documents/pdf/ocrStore';

export function PdfReadingView({ documentRecord, location, style, activeMarkupTool, activeMarkupColor, onLocation, onLookup, onAddNote, onHighlight, onErase, navigationToken = 0, ocrPages = [], onOpenOriginal, ocrLanguage = 'eng', onTextSource }: { navigationToken?: number; documentRecord: DocumentRecord; location: PdfDocumentLocation; style: Record<string, string | number>; activeMarkupTool?: 'highlight' | 'underline' | 'eraser' | null; activeMarkupColor: ReaderHighlight['color']; onLocation: (location: PdfDocumentLocation) => void; onLookup: (selection: ReaderSelection) => void; onAddNote: (selection: ReaderSelection) => void; onHighlight: (highlight: ReaderHighlight) => void; onErase: (startOffset: number, endOffset: number, ocrPage?: number, ocrLanguage?: OcrLanguage) => void; ocrPages?: PdfOcrRecord[]; onOpenOriginal?: () => void; ocrLanguage?: OcrLanguage; onTextSource?: (page: number, source: 'pdf' | 'ocr') => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ignoreClick = useRef(false);
  const [pending, setPending] = useState<ReaderSelection | null>(null);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const pages = useMemo(() => readingPagesForDocument(documentRecord), [documentRecord]);
  const selectedOcr = (page: number) => {
    const record = ocrPages.find(item => item.page === page && item.language === ocrLanguage);
    return record && (documentRecord.pdfTextSources?.[page] === 'ocr' || documentRecord.pdfTextSources?.[page] !== 'pdf' && pdfPageNeedsOcr(documentRecord, page)) ? record : undefined;
  };
  const lastPosition = useRef('');
  usePdfScroll(rootRef, '.pdf-reading-page', true, location, navigationToken, (page, pageOffset, scrollY) => {
    const model = pages[page - 1];
    if (!model) return;
    const key = `${page}:${Math.round(pageOffset * 1000)}:${Math.round(scrollY)}`;
    if (lastPosition.current === key) return;
    lastPosition.current = key;
    const ocr = selectedOcr(page);
    const textOffset = Math.round((ocr?.text.length ?? model.plainText.length) * pageOffset);
    onLocation({ kind: 'pdf', page, viewMode: 'reading', pageOffset, textOffset, textSource: ocr ? 'ocr' : 'pdf', absoluteOffset: model.startOffset + Math.min(textOffset, model.plainText.length), scrollY, progress: (page - 1 + pageOffset) / pages.length, updatedAt: Date.now() });
  });
  const captureSelection = (commitMarkup = false) => {
    if (!rootRef.current) return null;
    if (window.getSelection()?.anchorNode?.parentElement?.closest('[data-ocr-page]')) return null;
    const next = readingSelectionFromDom(rootRef.current, documentRecord.content);
    if (next) {
      ignoreClick.current = true;
      if (commitMarkup && activeMarkupTool) applyMarkup(next);
      else setPending(next);
    }
    return next;
  };
  const applyMarkup = (selection: ReaderSelection) => {
    if (!activeMarkupTool) return;
    const endOffset = selection.endOffset ?? selection.offset + selection.text.length;
    if (activeMarkupTool === 'eraser') onErase(selection.offset, endOffset);
    else onHighlight({ id: crypto.randomUUID(), startOffset: selection.offset, endOffset, color: activeMarkupColor, style: activeMarkupTool, createdAt: Date.now() });
    setPending(null);
    setHighlightOpen(false);
    window.getSelection()?.removeAllRanges();
  };
  useEffect(() => {
    let timer: number | undefined;
    const capture = () => {
      clearTimeout(timer);
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !rootRef.current?.contains(selection.anchorNode) || !rootRef.current?.contains(selection.focusNode)) return;
      if (activeMarkupTool) return;
      timer = window.setTimeout(() => captureSelection(), 160);
    };
    document.addEventListener('selectionchange', capture);
    return () => { clearTimeout(timer); document.removeEventListener('selectionchange', capture); };
  }, [documentRecord.id, documentRecord.content, activeMarkupTool, activeMarkupColor]);
  return <div class="pdf-reading-view" style={style}>
    <div ref={rootRef} class={`pdf-reading-scroll ${activeMarkupTool ? 'highlight-mode-active' : ''} ${activeMarkupTool ? `markup-${activeMarkupTool}` : ''}`} onPointerUp={() => window.setTimeout(() => captureSelection(Boolean(activeMarkupTool)), 0)} onKeyUp={event => { if (event.shiftKey) captureSelection(Boolean(activeMarkupTool)); }} onClick={event => {
      if (ignoreClick.current) { ignoreClick.current = false; return; }
      const nativeSelection = window.getSelection();
      if (nativeSelection && !nativeSelection.isCollapsed) return;
      if (event.target instanceof Element && event.target.closest('[data-ocr-page]')) return;
      const next = rootRef.current && readingWordAtPoint(rootRef.current, documentRecord.content, event.clientX, event.clientY);
      if (next) onLookup(next);
    }}>{pages.map(page => {
      const ocr = selectedOcr(page.pageNumber);
      const hasOcr = ocrPages.some(record => record.page === page.pageNumber && record.language === ocrLanguage);
      return ocr ? <PdfOcrReadingPage key={page.pageNumber} page={page.pageNumber} text={ocr.text} language={ocrLanguage} highlights={documentRecord.highlights?.filter(item => item.ocrPage === page.pageNumber && item.ocrLanguage === ocrLanguage)} activeMarkupTool={activeMarkupTool} activeMarkupColor={activeMarkupColor} onHighlight={onHighlight} onErase={(start, end) => onErase(start, end, page.pageNumber, ocrLanguage)} hasPdfText={Boolean(page.plainText.trim())} onSource={source => onTextSource?.(page.pageNumber, source)} onLookup={onLookup} onAddNote={onAddNote} onOpenOriginal={() => onOpenOriginal?.()} /> : <PdfReadingPage key={page.pageNumber} page={page} hasOcr={hasOcr} onSource={source => onTextSource?.(page.pageNumber, source)} highlights={documentRecord.highlights?.filter(item => item.ocrPage === undefined)} />;
    })}</div>
    {pending && <div class="pdf-reading-selection-wrap"><div class="pdf-reading-selection-actions" role="toolbar" aria-label="Selected text actions"><button onPointerDown={event => event.preventDefault()} onClick={() => onLookup(pending)}>Explain</button>{activeMarkupTool && <button class="active" onPointerDown={event => event.preventDefault()} onClick={() => applyMarkup(pending)}>{activeMarkupTool === 'eraser' ? 'Erase' : activeMarkupTool === 'underline' ? 'Underline' : 'Highlight'}</button>}<button aria-pressed={highlightOpen} class={highlightOpen ? 'active' : ''} onPointerDown={event => event.preventDefault()} onClick={() => setHighlightOpen(value => !value)}>Color</button><button onPointerDown={event => event.preventDefault()} onClick={() => onAddNote(pending)}>Note</button><button onPointerDown={event => event.preventDefault()} onClick={() => void navigator.clipboard?.writeText(pending.text)}>Copy</button><button aria-label="Close selection actions" onClick={() => { setPending(null); setHighlightOpen(false); window.getSelection()?.removeAllRanges(); }}>×</button></div>{highlightOpen && <div class="pdf-highlight-colors" role="group" aria-label="Highlight color">{(['yellow', 'pink', 'blue'] as const).map(color => <button key={color} class={`highlight-color highlight-color-${color}`} aria-label={`${color} highlight`} onPointerDown={event => event.preventDefault()} onClick={() => { onHighlight({ id: crypto.randomUUID(), startOffset: pending.offset, endOffset: pending.endOffset ?? pending.offset + pending.text.length, color, createdAt: Date.now() }); setHighlightOpen(false); setPending(null); window.getSelection()?.removeAllRanges(); }} />)}</div>}</div>}
  </div>;
}
