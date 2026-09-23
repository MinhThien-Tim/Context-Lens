import { createPortal } from 'preact/compat';
import { PdfTextIndex } from './PdfTextIndex';
import type { ReaderHighlight } from '../../db/database';
import { canvasBackingSize } from './renderBudget';
import { acquirePage } from './pageLease';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import type { ReaderSelection } from '../TextReader';
import { pdfSelectionFromDom, pdfSelectionFromRange } from './selectionAdapter';
import type { MarkupTool } from '../MarkupPalette';

export interface PdfPageSize { width: number; height: number }

export function PdfPage({ pdf, pageNumber, scale, active, documentText, pageOffset, onSize, onNavigate, onLookup, onAddNote, pageEnd, highlights = [], activeMarkupTool, activeMarkupColor = 'yellow', onHighlight, onErase }: { pageEnd?: number; highlights?: ReaderHighlight[]; activeMarkupTool?: MarkupTool | null; activeMarkupColor?: ReaderHighlight['color']; onHighlight?: (highlight: ReaderHighlight) => void; onErase?: (startOffset: number, endOffset: number) => void; pdf: PDFDocumentProxy; pageNumber: number; scale: number; active: boolean; documentText: string; pageOffset: number; onSize: (size: PdfPageSize) => void; onNavigate: (page: number) => void; onLookup: (selection: ReaderSelection) => void; onAddNote?: (selection: ReaderSelection) => void }) {
  const indexRef = useRef<PdfTextIndex | null>(null);
  const [indexVersion, setIndexVersion] = useState(0);
  const overlayRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const annotationRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [pending, setPending] = useState<ReaderSelection | null>(null);
  const applyMarkup = (selection: ReaderSelection, tool: Exclude<MarkupTool, 'eraser'> = 'highlight') => {
    const endOffset = selection.endOffset ?? selection.offset + selection.text.length;
    onHighlight?.({ id: crypto.randomUUID(), startOffset: selection.offset, endOffset, color: activeMarkupColor, style: tool, createdAt: Date.now() });
    setPending(null); window.getSelection()?.removeAllRanges();
  };

  useEffect(() => {
    let cancelled = false;
    void pdf.getPage(pageNumber).then(next => {
      if (cancelled) return;
      setPage(next);
      const viewport = next.getViewport({ scale: 1 });
      onSize({ width: viewport.width, height: viewport.height });
    }).catch(() => { /* Render state remains unavailable for a failed page. */ });
    return () => { cancelled = true; };
  }, [pdf, pageNumber]);

  useEffect(() => {
    if (!page || !active || !canvasRef.current || !textRef.current) return;
    let disposed = false;
    const releasePage = acquirePage(page);
    let renderTask: RenderTask | undefined;
    let textLayer: { cancel: () => void; render: () => Promise<unknown> } | undefined;
    const canvas = canvasRef.current, textHost = textRef.current;
    const textContainer = document.createElement('div');
    textContainer.className = 'pdf-text-layer textLayer';
    textHost.replaceChildren(textContainer);
    const viewport = page.getViewport({ scale });
    const { ratio, width, height } = canvasBackingSize(viewport.width, viewport.height, window.devicePixelRatio || 1);
    canvas.width = width; canvas.height = height;
    textContainer.style.setProperty('--total-scale-factor', String(scale * (page.userUnit || 1)));
    textContainer.style.setProperty('--scale-factor', String(scale));
    indexRef.current = null;
    canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
    textContainer.replaceChildren();
    void (async () => {
      const pdfjs = await import('pdfjs-dist');
      if (disposed) return;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return;
      renderTask = page.render({ canvas, canvasContext: context, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      // Attach cancellation handling immediately, before another await can reject.
      let renderError: unknown;
      const rendered = renderTask.promise.catch(reason => { if (!disposed && reason?.name !== 'RenderingCancelledException') renderError = reason; });
      const content = await page.getTextContent();
      if (disposed) return;
      textLayer = new pdfjs.TextLayer({ textContentSource: content, container: textContainer, viewport });
      await textLayer.render();
      if (disposed) return;
      indexRef.current = new PdfTextIndex(textContainer, documentText, pageOffset, pageEnd);
      setIndexVersion(value => value + 1);
      await rendered;
      if (disposed) return;
      if (renderError) throw renderError;
      if (annotationRef.current) {
        annotationRef.current.replaceChildren();
        const annotations = await page.getAnnotations({ intent: 'display' });
        if (disposed || !annotationRef.current) return;
        for (const annotation of annotations) {
          if (annotation.subtype !== 'Link' || !Array.isArray(annotation.rect)) continue;
          const first = [annotation.rect[0], annotation.rect[1]], second = [annotation.rect[2], annotation.rect[3]];
          pdfjs.Util.applyTransform(first, viewport.transform); pdfjs.Util.applyTransform(second, viewport.transform);
          const [x1, y1] = first, [x2, y2] = second;
          const link = document.createElement('a');
          link.setAttribute('aria-label', annotation.titleObj?.str || 'PDF link');
          link.style.left = `${Math.min(x1, x2)}px`; link.style.top = `${Math.min(y1, y2)}px`;
          link.style.width = `${Math.abs(x2 - x1)}px`; link.style.height = `${Math.abs(y2 - y1)}px`;
          if (typeof annotation.url === 'string' && /^https?:\/\//i.test(annotation.url)) {
            link.href = annotation.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
          } else if (annotation.dest) {
            link.href = '#';
            link.addEventListener('click', event => { event.preventDefault(); void resolveDestination(pdf, annotation.dest).then(onNavigate).catch(() => { /* Ignore a broken destination. */ }); });
          } else continue;
          annotationRef.current.append(link);
        }
      }
    })().catch(reason => { if (!disposed && reason?.name !== 'RenderingCancelledException') console.warn('PDF page render failed'); });
    return () => {
      disposed = true; indexRef.current = null; renderTask?.cancel(); textLayer?.cancel();
      releasePage(renderTask?.promise);
      canvas.width = 1; canvas.height = 1;
      const selection = window.getSelection();
      if (selection && textContainer.contains(selection.anchorNode)) selection.removeAllRanges();
      textContainer.remove(); annotationRef.current?.replaceChildren(); overlayRef.current?.replaceChildren();
    };
  }, [page, active, scale, documentText, pageOffset, pageEnd]);

  const capture = (clearInvalid = false) => {
    if (!textRef.current || !indexRef.current) return false;
    const selection = pdfSelectionFromDom(textRef.current, documentText, pageOffset, indexRef.current);
    if (selection) setPending(selection);
    else if (clearInvalid) setPending(null);
    return Boolean(selection);
  };
  useEffect(() => {
    let frame = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const schedule = (clearInvalid = false, retryMobile = false) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const captured = capture(clearInvalid);
        if (retryMobile && !captured) retry = setTimeout(() => capture(clearInvalid), 80);
      });
    };
    const selectionChange = () => schedule(false);
    const pointerEnd = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.pdf-original-actions')) return;
      schedule(event.pointerType !== 'touch' && event.pointerType !== 'pen', true);
    };
    const touchEnd = () => schedule(false, true);
    document.addEventListener('selectionchange', selectionChange);
    document.addEventListener('pointerup', pointerEnd);
    document.addEventListener('touchend', touchEnd);
    return () => {
      cancelAnimationFrame(frame); clearTimeout(retry);
      document.removeEventListener('selectionchange', selectionChange);
      document.removeEventListener('pointerup', pointerEnd);
      document.removeEventListener('touchend', touchEnd);
    };
  }, [documentText, pageOffset, pageEnd, indexVersion]);
  useEffect(() => { if (indexVersion) capture(false); }, [indexVersion]);
  useEffect(() => {
    const host = textRef.current;
    if (!host) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let origin: { x: number; y: number } | undefined;
    const cancel = () => { clearTimeout(timer); timer = undefined; origin = undefined; };
    const down = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      cancel(); origin = { x: event.clientX, y: event.clientY };
      timer = setTimeout(() => {
        if (capture(false) || !indexRef.current) return;
        const range = wordRangeAtPoint(document, event.clientX, event.clientY);
        if (!range || !host.contains(range.startContainer)) return;
        const selection = pdfSelectionFromRange(host, range, documentText, pageOffset, indexRef.current);
        if (selection) setPending(selection);
      }, 650);
    };
    const move = (event: PointerEvent) => {
      if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 12) cancel();
    };
    host.addEventListener('pointerdown', down);
    host.addEventListener('pointermove', move);
    host.addEventListener('pointerup', cancel);
    host.addEventListener('pointercancel', cancel);
    return () => { cancel(); host.removeEventListener('pointerdown', down); host.removeEventListener('pointermove', move); host.removeEventListener('pointerup', cancel); host.removeEventListener('pointercancel', cancel); };
  }, [documentText, pageOffset, pageEnd, indexVersion]);
  useEffect(() => {
    const overlay = overlayRef.current, index = indexRef.current;
    if (!overlay || !index) return;
    overlay.replaceChildren();
    const bounds = overlay.getBoundingClientRect();
    for (const highlight of highlights.filter(item => item.endOffset > pageOffset && item.startOffset < (pageEnd ?? documentText.length))) for (const range of index.ranges(highlight.startOffset, highlight.endOffset)) {
      for (const rect of range.getClientRects()) {
        const mark = document.createElement('span');
        mark.className = `pdf-saved-highlight highlight-${highlight.color} ${highlight.style === 'underline' ? 'underline' : ''}`;
        Object.assign(mark.style, { left: `${rect.left - bounds.left}px`, top: `${rect.top - bounds.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
        overlay.append(mark);
      }
    }
    return () => overlay.replaceChildren();
  }, [highlights, indexVersion]);
  return <section class="pdf-page" data-rendered-page={pageNumber} aria-label={`Page ${pageNumber}`}>
    <canvas ref={canvasRef} class="pdf-canvas" aria-hidden="true" />
    <div ref={textRef} class="pdf-text-host" data-reader-text />
    <div ref={annotationRef} class="pdf-annotation-layer" />
    <div ref={overlayRef} class="context-overlay" aria-hidden="true" />
    {pending && createPortal(<div class="selection-actions pdf-original-actions" role="toolbar" aria-label="Selected text actions" onPointerDown={event => event.preventDefault()}>
      <button class="selection-lookup" onClick={() => onLookup(pending)}>Explain</button>
      {onHighlight && activeMarkupTool !== 'eraser' && <button class="selection-markup" onClick={() => applyMarkup(pending, activeMarkupTool ?? 'highlight')}>{activeMarkupTool === 'underline' ? 'Underline' : 'Highlight'}</button>}
      {activeMarkupTool === 'eraser' && onErase && <button class="selection-markup" onClick={() => { onErase(pending.offset, pending.endOffset ?? pending.offset + pending.text.length); setPending(null); window.getSelection()?.removeAllRanges(); }}>Erase</button>}
      {onAddNote && <button onClick={() => onAddNote(pending)}>Note</button>}
      <button onClick={() => void navigator.clipboard?.writeText(pending.text)}>Copy</button>
      <button aria-label="Close selection actions" onClick={() => { setPending(null); window.getSelection()?.removeAllRanges(); }}>?</button>
    </div>, document.body)}
  </section>;
}

function wordRangeAtPoint(owner: Document, x: number, y: number): Range | null {
  const caretDocument = owner as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = caretDocument.caretPositionFromPoint?.(x, y);
  const caret = position ? { node: position.offsetNode, offset: position.offset } : (() => {
    const range = caretDocument.caretRangeFromPoint?.(x, y);
    return range ? { node: range.startContainer, offset: range.startOffset } : null;
  })();
  if (!caret || caret.node.nodeType !== Node.TEXT_NODE || !caret.node.textContent) return null;
  const content = caret.node.textContent;
  const word = /[\p{L}\p{M}\p{N}'’-]/u;
  let start = Math.min(caret.offset, content.length), end = start;
  while (start > 0 && word.test(content[start - 1])) start--;
  while (end < content.length && word.test(content[end])) end++;
  if (end <= start) return null;
  const range = owner.createRange();
  range.setStart(caret.node, start); range.setEnd(caret.node, end);
  return range;
}

async function resolveDestination(pdf: PDFDocumentProxy, destination: unknown): Promise<number> {
  const explicit = typeof destination === 'string' ? await pdf.getDestination(destination) : destination;
  if (!Array.isArray(explicit) || !explicit.length) return 1;
  const target = explicit[0];
  return typeof target === 'number' ? target + 1 : await pdf.getPageIndex(target) + 1;
}
