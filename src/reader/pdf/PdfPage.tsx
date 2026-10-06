import { createPortal } from 'preact/compat';
import { PdfTextIndex } from './PdfTextIndex';
import type { ReaderHighlight } from '../../db/database';
import { canvasBackingSize, MAX_CANVAS_PIXELS } from './renderBudget';
import { acquirePage } from './pageLease';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import type { ReaderSelection } from '../TextReader';
import { pdfSelectionFromDom, pdfSelectionFromRange } from './selectionAdapter';
import type { MarkupTool } from '../MarkupPalette';

export interface PdfPageSize { width: number; height: number }

type PdfViewport = ReturnType<PDFPageProxy['getViewport']>;

/** Backing geometry plus the inputs that determine which frame a page commits. */
interface FrameTarget {
  page: PDFPageProxy;
  viewport: PdfViewport;
  scale: number;
  ratio: number;
  width: number;
  height: number;
  documentText: string;
  pageOffset: number;
  pageEnd?: number;
}

function frameTargetFor(page: PDFPageProxy, scale: number, renderPixels: number, documentText: string, pageOffset: number, pageEnd?: number): FrameTarget {
  const viewport = page.getViewport({ scale });
  const { ratio, width, height } = canvasBackingSize(viewport.width, viewport.height, window.devicePixelRatio || 1, renderPixels);
  return { page, viewport, scale, ratio, width, height, documentText, pageOffset, pageEnd };
}

/** Two frame targets share a frame when the page, backing geometry and index inputs match. */
function sameFrameTarget(committed: FrameTarget, next: FrameTarget) {
  return committed.page === next.page && committed.width === next.width && committed.height === next.height &&
    committed.scale === next.scale &&
    committed.viewport.width === next.viewport.width && committed.viewport.height === next.viewport.height &&
    committed.documentText === next.documentText && committed.pageOffset === next.pageOffset && committed.pageEnd === next.pageEnd;
}

export function PdfPage({ pdf, pageNumber, scale, active, renderPixels = MAX_CANVAS_PIXELS, clickLookup = false, desktopLookup = false, documentText, pageOffset, onSize, onNavigate, onLookup, onAddNote, pageEnd, highlights = [], activeMarkupTool, activeMarkupColor = 'yellow', onHighlight, onErase }: { pageEnd?: number; highlights?: ReaderHighlight[]; activeMarkupTool?: MarkupTool | null; activeMarkupColor?: ReaderHighlight['color']; onHighlight?: (highlight: ReaderHighlight) => void; onErase?: (startOffset: number, endOffset: number) => void; pdf: PDFDocumentProxy; pageNumber: number; scale: number; active: boolean; renderPixels?: number; clickLookup?: boolean; desktopLookup?: boolean; documentText: string; pageOffset: number; onSize: (size: PdfPageSize) => void; onNavigate: (page: number) => void; onLookup: (selection: ReaderSelection) => void; onAddNote?: (selection: ReaderSelection) => void }) {
  const indexRef = useRef<PdfTextIndex | null>(null);
  const [indexVersion, setIndexVersion] = useState(0);
  const overlayRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const annotationRef = useRef<HTMLDivElement>(null);
  // Backing geometry of the frame currently painted on the mounted canvas, set only
  // after a render task resolves so an in-flight render is never treated as committed.
  const committedRef = useRef<FrameTarget | null>(null);
  // Identity of the frame the render effect should be producing. A role/budget change
  // that resolves to the same frame keeps this referentially stable, so the effect is
  // not torn down and the committed bitmap, lease, text layer and overlay all survive.
  const targetRef = useRef<FrameTarget | null>(null);
  const [frameTarget, setFrameTarget] = useState<FrameTarget | null>(null);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [pending, setPending] = useState<ReaderSelection | null>(null);
  const autoLookupRef = useRef<{ offset: number; endOffset?: number } | null>(null);
  const applyMarkup = (selection: ReaderSelection, tool: MarkupTool = 'highlight') => {
    const endOffset = selection.endOffset ?? selection.offset + selection.text.length;
    if (tool === 'eraser') onErase?.(selection.offset, endOffset);
    else onHighlight?.({ id: crypto.randomUUID(), startOffset: selection.offset, endOffset, color: activeMarkupColor, style: tool, createdAt: Date.now() });
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

  // Resolve the frame the page should show. A budget or role transition that computes
  // the same geometry and the same index inputs reuses the previous target object, so the
  // render effect below does not re-run and the committed frame is left untouched.
  useEffect(() => {
    if (!page) { setFrameTarget(null); return; }
    const next = frameTargetFor(page, scale, renderPixels, documentText, pageOffset, pageEnd);
    const previous = targetRef.current;
    if (previous && sameFrameTarget(previous, next)) return;
    targetRef.current = next;
    setFrameTarget(next);
  }, [page, scale, renderPixels, documentText, pageOffset, pageEnd]);

  useEffect(() => {
    if (!frameTarget || !active || !canvasRef.current || !textRef.current) return;
    const { page, viewport, scale, ratio, width, height, documentText, pageOffset, pageEnd } = frameTarget;
    let disposed = false;
    const releasePage = acquirePage(page);
    let renderTask: RenderTask | undefined;
    let textLayer: { cancel: () => void; render: () => Promise<unknown> } | undefined;
    const canvas = canvasRef.current, textHost = textRef.current;
    const textContainer = document.createElement('div');
    textContainer.className = 'pdf-text-layer textLayer';
    textHost.replaceChildren(textContainer);
    // With a frame already committed, render the replacement into a bounded transient
    // buffer so the committed bitmap stays visible until the new one is ready to swap in.
    const replaceCommitted = Boolean(committedRef.current);
    const renderCanvas = replaceCommitted ? document.createElement('canvas') : canvas;
    const releaseBuffer = () => {
      if (!replaceCommitted) return;
      renderCanvas.width = 1; renderCanvas.height = 1;
    };
    if (replaceCommitted) { renderCanvas.width = width; renderCanvas.height = height; }
    else { canvas.width = width; canvas.height = height; }
    textContainer.style.setProperty('--total-scale-factor', String(scale * (page.userUnit || 1)));
    textContainer.style.setProperty('--scale-factor', String(scale));
    indexRef.current = null;
    canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
    textContainer.replaceChildren();
    void (async () => {
      const pdfjs = await import('pdfjs-dist');
      if (disposed) { releaseBuffer(); return; }
      const context = renderCanvas.getContext('2d', { alpha: false });
      if (!context) { releaseBuffer(); return; }
      renderTask = page.render({ canvas: renderCanvas, canvasContext: context, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      // Attach cancellation handling immediately, before another await can reject.
      let renderError: unknown;
      const rendered = renderTask.promise.catch(reason => { if (!disposed && reason?.name !== 'RenderingCancelledException') renderError = reason; });
      const content = await page.getTextContent();
      if (disposed) { releaseBuffer(); return; }
      textLayer = new pdfjs.TextLayer({ textContentSource: content, container: textContainer, viewport });
      await textLayer.render();
      if (disposed) { releaseBuffer(); return; }
      indexRef.current = new PdfTextIndex(textContainer, documentText, pageOffset, pageEnd);
      setIndexVersion(value => value + 1);
      await rendered;
      if (disposed) { releaseBuffer(); return; }
      if (renderError) { releaseBuffer(); throw renderError; }
      // Commit: publish the committed geometry, then swap the completed bitmap in one step.
      if (replaceCommitted) {
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d', { alpha: false })?.drawImage(renderCanvas, 0, 0);
      }
      committedRef.current = frameTarget;
      releaseBuffer();
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
    })().catch(reason => { releaseBuffer(); if (!disposed && reason?.name !== 'RenderingCancelledException') console.warn('PDF page render failed'); });
    return () => {
      disposed = true; indexRef.current = null; renderTask?.cancel(); textLayer?.cancel();
      releasePage(renderTask?.promise);
      releaseBuffer();
      // The mounted canvas keeps its committed frame; the unmount-only effect releases it.
      const selection = window.getSelection();
      if (selection && textContainer.contains(selection.anchorNode)) selection.removeAllRanges();
      textContainer.remove(); annotationRef.current?.replaceChildren();
    };
  }, [frameTarget, active]);

  // The 1x1 memory release belongs to the PdfPage lifetime, not to a lifecycle
  // transition: a role or budget change must never shrink a mounted page canvas.
  useEffect(() => () => {
    const canvas = canvasRef.current;
    if (canvas) { canvas.width = 1; canvas.height = 1; }
    committedRef.current = null;
  }, []);

  const capture = (clearInvalid = false, commitMarkup = false) => {
    if (!textRef.current || !indexRef.current) return false;
    const selection = pdfSelectionFromDom(textRef.current, documentText, pageOffset, indexRef.current);
    if (selection && autoLookupRef.current?.offset === selection.offset &&
      autoLookupRef.current.endOffset === selection.endOffset) return true;
    autoLookupRef.current = null;
    if (selection && commitMarkup && activeMarkupTool) applyMarkup(selection, activeMarkupTool);
    else if (selection) setPending(selection);
    else if (clearInvalid) setPending(null);
    return Boolean(selection);
  };
  useEffect(() => {
    let frame = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const schedule = (clearInvalid = false, retryMobile = false, commitMarkup = false) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const captured = capture(clearInvalid, commitMarkup);
        if (retryMobile && !captured) retry = setTimeout(() => capture(clearInvalid, commitMarkup), 80);
      });
    };
    const selectionChange = () => { if (!activeMarkupTool) schedule(false); };
    const pointerEnd = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.pdf-original-actions')) return;
      const commitMarkup = Boolean(activeMarkupTool && textRef.current?.contains(event.target as Node));
      schedule(event.pointerType !== 'touch' && event.pointerType !== 'pen', true, commitMarkup);
    };
    const touchEnd = () => schedule(false, true, Boolean(activeMarkupTool));
    const keyUp = (event: KeyboardEvent) => { if (activeMarkupTool && event.shiftKey) schedule(false, false, true); };
    document.addEventListener('selectionchange', selectionChange);
    document.addEventListener('pointerup', pointerEnd);
    document.addEventListener('touchend', touchEnd);
    textRef.current?.addEventListener('keyup', keyUp);
    return () => {
      cancelAnimationFrame(frame); clearTimeout(retry);
      document.removeEventListener('selectionchange', selectionChange);
      document.removeEventListener('pointerup', pointerEnd);
      document.removeEventListener('touchend', touchEnd);
      textRef.current?.removeEventListener('keyup', keyUp);
    };
  }, [documentText, pageOffset, pageEnd, indexVersion, activeMarkupTool, activeMarkupColor]);
  useEffect(() => { if (indexVersion) capture(false); }, [indexVersion]);
  useEffect(() => {
    const host = textRef.current;
    if (!host || !desktopLookup || activeMarkupTool) return;
    let frame = 0;
    const doubleClick = (event: MouseEvent) => {
      if (event.button !== 0 || !(event.target instanceof Element) ||
        !event.target.closest('.pdf-text-layer') ||
        event.target.closest('a, button, input, select, textarea, [role="button"]') ||
        document.elementFromPoint(event.clientX, event.clientY)?.closest('.pdf-annotation-layer a')) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const index = indexRef.current;
        if (!index) return;
        const selected = pdfSelectionFromDom(host, documentText, pageOffset, index);
        const wordRange = strictWordRangeAtPoint(index.root, event.clientX, event.clientY);
        const word = wordRange && pdfSelectionFromRange(host, wordRange, documentText, pageOffset, index);
        if (!selected || selected.type !== 'word' || !word || word.type !== 'word' ||
          selected.offset !== word.offset || selected.endOffset !== word.endOffset) return;
        autoLookupRef.current = { offset: selected.offset, endOffset: selected.endOffset };
        setPending(null);
        onLookup(selected);
      });
    };
    host.addEventListener('dblclick', doubleClick);
    return () => { cancelAnimationFrame(frame); host.removeEventListener('dblclick', doubleClick); };
  }, [desktopLookup, activeMarkupTool, documentText, pageOffset, indexVersion, onLookup]);
  useEffect(() => {
    const host = textRef.current;
    if (!host || !clickLookup) return;
    type Tap = { id: number; x: number; y: number; at: number; scrollTop: number; index: PdfTextIndex; offset: number };
    let tap: Tap | null = null;
    let blocked = false;
    let frame = 0;
    const scroll = host.closest('.pdf-scroll');
    const linkAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest('.pdf-annotation-layer a');
    const mappedWord = (x: number, y: number, index: PdfTextIndex) => {
      if (linkAt(x, y)) return null;
      const range = strictWordRangeAtPoint(index.root, x, y);
      return range ? pdfSelectionFromRange(host, range, documentText, pageOffset, index) : null;
    };
    const down = (event: PointerEvent) => {
      if (!host.contains(event.target as Node)) {
        if (event.pointerType === 'touch' && !event.isPrimary) { tap = null; blocked = true; }
        return;
      }
      if (event.pointerType !== 'touch' || !event.isPrimary || event.button !== 0 || blocked) {
        if (event.pointerType === 'touch') { tap = null; blocked = true; }
        return;
      }
      const index = indexRef.current;
      const word = index && mappedWord(event.clientX, event.clientY, index);
      tap = word && index ? { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now(), scrollTop: scroll?.scrollTop ?? 0, index, offset: word.offset } : null;
    };
    const move = (event: PointerEvent) => {
      if (tap?.id === event.pointerId && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 10) tap = null;
    };
    const end = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      const candidate = tap;
      tap = null;
      if (!event.isPrimary) { blocked = false; return; }
      if (blocked) { blocked = false; return; }
      if (!candidate || candidate.id !== event.pointerId || event.type !== 'pointerup' ||
        performance.now() - candidate.at > 450 || Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y) > 10 ||
        (scroll?.scrollTop ?? 0) !== candidate.scrollTop) return;
      const x = event.clientX, y = event.clientY;
      frame = requestAnimationFrame(() => {
        if (indexRef.current !== candidate.index || !candidate.index.root.isConnected ||
          window.getSelection()?.toString()) return;
        const word = mappedWord(x, y, candidate.index);
        if (word?.offset === candidate.offset && word.type === 'word') { setPending(null); onLookup(word); }
      });
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', end, true);
    document.addEventListener('pointercancel', end, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', end, true);
      document.removeEventListener('pointercancel', end, true);
    };
  }, [clickLookup, documentText, pageOffset, indexVersion, onLookup]);
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
    for (const highlight of highlights.filter(item => item.ocrPage === undefined && item.endOffset > pageOffset && item.startOffset < (pageEnd ?? documentText.length))) for (const range of index.ranges(highlight.startOffset, highlight.endOffset)) {
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
          <button class="selection-lookup" onClick={() => onLookup(pending)}>Define</button>
          {onHighlight && activeMarkupTool !== 'eraser' && <button class="selection-markup" onClick={() => applyMarkup(pending, activeMarkupTool ?? 'highlight')}>{activeMarkupTool === 'underline' ? 'Underline' : 'Highlight'}</button>}
          {activeMarkupTool === 'eraser' && onErase && <button class="selection-markup" onClick={() => applyMarkup(pending, 'eraser')}>Erase</button>}
          {onAddNote && <button onClick={() => onAddNote(pending)}>Note</button>}
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

// Require the contact point to intersect an actual character, not a nearby caret
// position returned for whitespace or the margin around a PDF.js span.
function strictWordRangeAtPoint(root: HTMLElement, x: number, y: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node.parentElement?.closest('span:not([role="img"])'))) continue;
    const value = node.textContent ?? '';
    for (let i = 0; i < value.length; i++) {
      if (!/[\p{L}\p{M}\p{N}'’-]/u.test(value[i])) continue;
      const range = document.createRange();
      range.setStart(node, i); range.setEnd(node, i + 1);
      if (!Array.from(range.getClientRects()).some(rect => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)) continue;
      let start = i, end = i + 1;
      while (start > 0 && /[\p{L}\p{M}\p{N}'’-]/u.test(value[start - 1])) start--;
      while (end < value.length && /[\p{L}\p{M}\p{N}'’-]/u.test(value[end])) end++;
      range.setStart(node, start); range.setEnd(node, end);
      return range;
    }
  }
  return null;
}

async function resolveDestination(pdf: PDFDocumentProxy, destination: unknown): Promise<number> {
  const explicit = typeof destination === 'string' ? await pdf.getDestination(destination) : destination;
  if (!Array.isArray(explicit) || !explicit.length) return 1;
  const target = explicit[0];
  return typeof target === 'number' ? target + 1 : await pdf.getPageIndex(target) + 1;
}
