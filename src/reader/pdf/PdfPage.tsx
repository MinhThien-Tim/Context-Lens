import { useEffect, useRef, useState } from 'preact/hooks';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import type { ReaderSelection } from '../TextReader';
import { pdfSelectionFromDom } from './selectionAdapter';

export interface PdfPageSize { width: number; height: number }

export function PdfPage({ pdf, pageNumber, scale, active, documentText, pageOffset, onSize, onNavigate, onLookup, onAddNote }: { pdf: PDFDocumentProxy; pageNumber: number; scale: number; active: boolean; documentText: string; pageOffset: number; onSize: (size: PdfPageSize) => void; onNavigate: (page: number) => void; onLookup: (selection: ReaderSelection) => void; onAddNote?: (selection: ReaderSelection) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const annotationRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [pending, setPending] = useState<ReaderSelection | null>(null);

  useEffect(() => {
    let cancelled = false;
    void pdf.getPage(pageNumber).then(next => {
      if (cancelled) { next.cleanup(); return; }
      setPage(next);
      const viewport = next.getViewport({ scale: 1 });
      onSize({ width: viewport.width, height: viewport.height });
    });
    return () => { cancelled = true; setPage(null); };
  }, [pdf, pageNumber]);

  useEffect(() => {
    if (!page || !active || !canvasRef.current || !textRef.current) return;
    let disposed = false;
    let renderTask: RenderTask | undefined;
    let textLayer: { cancel: () => void; render: () => Promise<unknown> } | undefined;
    const canvas = canvasRef.current, textContainer = textRef.current;
    const viewport = page.getViewport({ scale });
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(viewport.width * ratio); canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
    textContainer.replaceChildren();
    void (async () => {
      const pdfjs = await import('pdfjs-dist');
      if (disposed) return;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return;
      renderTask = page.render({ canvas, canvasContext: context, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      const content = await page.getTextContent();
      if (disposed) return;
      textLayer = new pdfjs.TextLayer({ textContentSource: content, container: textContainer, viewport });
      await Promise.all([renderTask.promise, textLayer.render()]);
      if (annotationRef.current) {
        annotationRef.current.replaceChildren();
        const annotations = await page.getAnnotations({ intent: 'display' });
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
            link.addEventListener('click', event => { event.preventDefault(); void resolveDestination(pdf, annotation.dest).then(onNavigate); });
          } else continue;
          annotationRef.current.append(link);
        }
      }
    })().catch(reason => { if (!disposed && reason?.name !== 'RenderingCancelledException') console.warn('PDF page render failed'); });
    return () => {
      disposed = true; renderTask?.cancel(); textLayer?.cancel();
      canvas.width = 1; canvas.height = 1; textContainer.replaceChildren(); annotationRef.current?.replaceChildren(); page.cleanup();
    };
  }, [page, active, scale]);

  const capture = () => {
    if (!textRef.current) return;
    const selection = pdfSelectionFromDom(textRef.current, documentText, pageOffset);
    if (selection) setPending(selection);
  };
  return <section class="pdf-page" data-pdf-page={pageNumber} aria-label={`Page ${pageNumber}`}>
    <canvas ref={canvasRef} class="pdf-canvas" aria-hidden="true" />
    <div ref={textRef} class="pdf-text-layer" data-reader-text onPointerUp={() => setTimeout(capture, 0)} />
    <div ref={annotationRef} class="pdf-annotation-layer" />
    <div class="context-overlay" aria-hidden="true" />
    {pending && <div class="selection-actions"><button class="selection-lookup" onPointerDown={event => event.preventDefault()} onClick={() => { onLookup(pending); setPending(null); window.getSelection()?.removeAllRanges(); }}>Look up selection</button>{onAddNote && <button class="secondary-button" onPointerDown={event => event.preventDefault()} onClick={() => { onAddNote(pending); setPending(null); window.getSelection()?.removeAllRanges(); }}>Note</button>}</div>}
  </section>;
}

async function resolveDestination(pdf: PDFDocumentProxy, destination: unknown): Promise<number> {
  const explicit = typeof destination === 'string' ? await pdf.getDestination(destination) : destination;
  if (!Array.isArray(explicit) || !explicit.length) return 1;
  const target = explicit[0];
  return typeof target === 'number' ? target + 1 : await pdf.getPageIndex(target) + 1;
}
