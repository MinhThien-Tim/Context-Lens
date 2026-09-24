import { useRef, useState } from 'preact/hooks';
import type { ReaderSelection } from '../TextReader';
import { readingSelectionFromDom, readingWordAtPoint } from './readingSelectionAdapter';
import type { ReaderHighlight } from '../../db/database';
import type { MarkupTool } from '../MarkupPalette';
import type { OcrLanguage } from '../../documents/pdf/ocrStore';
import { highlightedText } from './PdfReadingBlock';

export function PdfOcrReadingPage({ page, text, language = 'eng', highlights = [], activeMarkupTool, activeMarkupColor = 'yellow', onHighlight, onErase, hasPdfText = false, onSource, onLookup, onAddNote, onOpenOriginal }: { page: number; text: string; language?: OcrLanguage; highlights?: ReaderHighlight[]; activeMarkupTool?: MarkupTool | null; activeMarkupColor?: ReaderHighlight['color']; onHighlight?: (highlight: ReaderHighlight) => void; onErase?: (start: number, end: number) => void; hasPdfText?: boolean; onSource?: (source: 'pdf' | 'ocr') => void; onLookup: (selection: ReaderSelection) => void; onAddNote: (selection: ReaderSelection) => void; onOpenOriginal: () => void }) {
  const root = useRef<HTMLElement>(null);
  const [pending, setPending] = useState<ReaderSelection | null>(null);
  const decorate = (selection: ReaderSelection | null) => selection ? { ...selection, pdfPage: page, ocr: true } : null;
  const capture = () => {
    if (!root.current) return;
    const selection = decorate(readingSelectionFromDom(root.current, text));
    if (selection) {
      if (activeMarkupTool) applyMarkup(selection);
      else setPending(selection);
    }
  };
  const applyMarkup = (selection: ReaderSelection) => {
    if (!activeMarkupTool) return;
    const end = selection.endOffset ?? selection.offset + selection.text.length;
    if (activeMarkupTool === 'eraser') onErase?.(selection.offset, end);
    else onHighlight?.({ id: crypto.randomUUID(), startOffset: selection.offset, endOffset: end, ocrPage: page, ocrLanguage: language, color: activeMarkupColor, style: activeMarkupTool, createdAt: Date.now() });
    setPending(null);
    window.getSelection()?.removeAllRanges();
  };
  return <section ref={root} class="pdf-reading-page pdf-ocr-page" data-pdf-reading-page={page} data-ocr-page={page} data-reader-text aria-label={`Page ${page}, recognized text`}>
    <header>Page {page} · OCR{hasPdfText && <label> Nguồn chữ <select aria-label={`Nguồn chữ trang ${page}`} value="ocr" onChange={event => onSource?.(event.currentTarget.value as 'pdf' | 'ocr')}><option value="pdf">Chữ PDF</option><option value="ocr">Chữ OCR</option></select></label>}</header>
    <p class="pdf-ocr-warning">Chữ nhận dạng có thể sai. <button onClick={onOpenOriginal}>Xem Trang gốc</button></p>
    <div class="pdf-reading-content" onPointerUp={() => window.setTimeout(capture, 0)} onKeyUp={event => { if (event.shiftKey) capture(); }} onClick={event => {
      if (window.getSelection() && !window.getSelection()!.isCollapsed) return;
      const selected = root.current && decorate(readingWordAtPoint(root.current, text, event.clientX, event.clientY));
      if (selected) onLookup(selected);
    }}><p data-offset="0" class="pdf-ocr-text">{highlightedText(text, 0, highlights)}</p></div>
    {pending && <div class="pdf-reading-selection-actions" role="toolbar" aria-label="Selected OCR text actions">
      <button onPointerDown={event => event.preventDefault()} onClick={() => onLookup(pending)}>Explain</button>
      {activeMarkupTool && <button class="active" onPointerDown={event => event.preventDefault()} onClick={() => applyMarkup(pending)}>{activeMarkupTool === 'eraser' ? 'Erase' : activeMarkupTool === 'underline' ? 'Underline' : 'Highlight'}</button>}
      <button onPointerDown={event => event.preventDefault()} onClick={() => onAddNote(pending)}>Note</button>
      <button onPointerDown={event => event.preventDefault()} onClick={() => void navigator.clipboard?.writeText(pending.text)}>Copy</button>
      <button aria-label="Close OCR selection actions" onClick={() => { setPending(null); window.getSelection()?.removeAllRanges(); }}>×</button>
    </div>}
  </section>;
}
