import { useEffect, useRef, useState } from 'preact/hooks';
import type { DocumentRecord } from '../../db/database';
import type { PdfDocumentLocation } from '../../documents/location';
import type { ReaderSelection } from '../TextReader';
import { calculatePdfScale, pdfOffsetForPage, stepDesktopPdfScale, type PdfZoomMode } from './navigation';
import { PdfPage, type PdfPageSize } from './PdfPage';
import { usePdfDocument } from './usePdfDocument';
import { usePdfScroll } from './usePdfScroll';
import { useDesktop } from '../../components/useDesktop';
import type { MarkupTool } from '../MarkupPalette';
import { MAX_CANVAS_PIXELS, NEIGHBOR_CANVAS_PIXELS } from './renderBudget';

const DEFAULT_SIZE = { width: 612, height: 792 };

export function PdfViewer({ documentRecord, location, zoomMode, onZoomMode, desktopCustomScale = 1, onDesktopCustomScale, onActualScale, onZoomStepReady, clickLookup = true, activeMarkupTool, activeMarkupColor = 'yellow', onLocation, onLookup, onAddNote, navigationToken = 0, onHighlight, onErase, ocrBusy = false }: { navigationToken?: number; activeMarkupTool?: MarkupTool | null; activeMarkupColor?: import('../../db/database').ReaderHighlight['color']; onHighlight?: (highlight: import('../../db/database').ReaderHighlight) => void; onErase?: (startOffset: number, endOffset: number) => void; documentRecord: DocumentRecord; location: PdfDocumentLocation; zoomMode: PdfZoomMode; onZoomMode: (mode: PdfZoomMode) => void; desktopCustomScale?: number; onDesktopCustomScale?: (scale: number) => void; onActualScale?: (scale: number) => void; onZoomStepReady?: (step: (direction: -1 | 1) => void) => void; clickLookup?: boolean; onLocation: (location: PdfDocumentLocation) => void; onLookup: (selection: ReaderSelection) => void; onAddNote?: (selection: ReaderSelection) => void; ocrBusy?: boolean }) {
  const desktop = useDesktop();
  const effectiveZoom = desktop ? zoomMode : 'fit-width';
  const changeZoom = (mode: PdfZoomMode) => { if (desktop) onZoomMode(mode); };
  const { pdf, error, passwordRequired, passwordError, password, setPassword, submitPassword } = usePdfDocument(documentRecord.data);  const [sizes, setSizes] = useState<Record<number, PdfPageSize>>({});
  const ready = Boolean(pdf && Object.keys(sizes).length === pdf.numPages);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !desktop) return;
    let drag: { x: number; left: number; id: number } | null = null;
    let spaceHeld = false;
    const keyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && root.contains(document.activeElement) &&
        !(document.activeElement as Element)?.closest('button, input, select, textarea')) {
        spaceHeld = true;
        event.preventDefault();
      }
    };
    const keyUp = (event: KeyboardEvent) => { if (event.code === 'Space') spaceHeld = false; };
    const down = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || root.scrollWidth <= root.clientWidth) return;
      const target = event.target as Element;
      if (!spaceHeld && target.closest('.pdf-text-layer span, .pdf-annotation-layer a, button, input, select, textarea')) return;
      drag = { x: event.clientX, left: root.scrollLeft, id: event.pointerId };
      root.setPointerCapture(event.pointerId);
      root.style.cursor = 'grabbing';
      event.preventDefault();
    };
    const move = (event: PointerEvent) => {
      if (drag?.id === event.pointerId) root.scrollLeft = drag.left + drag.x - event.clientX;
    };
    const end = (event: PointerEvent) => {
      if (drag?.id !== event.pointerId) return;
      drag = null;
      root.style.cursor = '';
      if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    root.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp);
      root.removeEventListener('pointerdown', down); root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', end); root.removeEventListener('pointercancel', end);
    };
  }, [desktop, ready]);
  const [geometryError, setGeometryError] = useState<string | null>(null);
  const [visible, setVisible] = useState(location.page);
  const [bounds, setBounds] = useState<{ width: number; height: number } | null>(null);
  const selectedCustomScale = desktop ? desktopCustomScale : 1;
  const scaleFor = (size: PdfPageSize) => calculatePdfScale(effectiveZoom, selectedCustomScale, bounds?.width ?? 0, bounds?.height ?? 0, size.width, size.height, desktop ? 6 : 3);
  const stepZoom = (direction: -1 | 1) => {
    const size = sizes[visible] ?? DEFAULT_SIZE;
    const current = scaleFor(size);
    const fitWidth = calculatePdfScale('fit-width', 1, bounds?.width ?? 0, bounds?.height ?? 0, size.width, size.height);
    const next = stepDesktopPdfScale(current, fitWidth, direction, effectiveZoom);
    onDesktopCustomScale?.(next);
    changeZoom('custom');
  };
  const geometryKey = `${effectiveZoom}:${selectedCustomScale}:${bounds?.width}:${bounds?.height}`;
  const actualScale = scaleFor(sizes[visible] ?? DEFAULT_SIZE);
  // docs/desktop-reader.md §3/§3.1: PdfViewer owns `scaleFor` and `stepZoom`, and the Header selector
  // shows the actual rendering scale. App.tsx holds no measured bounds and no visible-page size, so
  // it cannot re-derive either value: both are published out through stable callbacks instead of a
  // ref, and the refs below keep those callbacks out of the effect dependencies so an inline
  // arrow in App cannot re-fire the effect on every render.
  const actualScaleSink = useRef(onActualScale);
  const stepSink = useRef(onZoomStepReady);
  const stepRef = useRef(stepZoom);
  useEffect(() => { actualScaleSink.current = onActualScale; stepSink.current = onZoomStepReady; stepRef.current = stepZoom; });
  useEffect(() => { if (desktop) actualScaleSink.current?.(actualScale); }, [actualScale, desktop]);
  useEffect(() => { if (desktop) stepSink.current?.((direction: -1 | 1) => stepRef.current(direction)); }, [desktop]);
  // The previous page can still be visible when tracking advances. Keep both
  // neighbors within the existing three-canvas budget; OCR keeps only one.

  // Resolve geometry without allocating canvases before restoring the saved location.
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    void (async () => {
      const next: Record<number, PdfPageSize> = {};
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1 });
        next[n] = { width: viewport.width, height: viewport.height };
        page.cleanup();
      }
      if (!cancelled) setSizes(next);
    })().catch(() => { if (!cancelled) setGeometryError('Unable to load PDF page dimensions. Please reopen this document.'); });
    return () => { cancelled = true; };
  }, [pdf]);
  const lastPosition = useRef('');
  const goTo = usePdfScroll(rootRef, '.pdf-page-slot', ready && Boolean(bounds), location, navigationToken, (page, pageOffset, scrollY, _visiblePage, dominantPage) => {
    setVisible(dominantPage);
    const key = `${page}:${Math.round(pageOffset * 1000)}:${Math.round(scrollY)}`;
    if (lastPosition.current === key || !pdf) return;
    lastPosition.current = key;
    const start = pdfOffsetForPage(documentRecord.pageOffsets, page);
    const end = documentRecord.pageOffsets?.[page] ?? documentRecord.content.length;
    const textOffset = Math.round((end - start) * pageOffset);
    onLocation({ kind: 'pdf', viewMode: 'original', page, pageOffset, textOffset, absoluteOffset: start + textOffset, scrollY, progress: (page - 1 + pageOffset) / pdf.numPages, updatedAt: Date.now() });
  }, geometryKey);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const resize = new ResizeObserver(entries => { const rect = entries[0]?.contentRect; if (rect && rect.width > 0 && rect.height > 0) setBounds(current => current?.width === rect.width && current.height === rect.height ? current : { width: rect.width, height: rect.height }); });
    resize.observe(root); return () => resize.disconnect();
  }, [pdf, ready]);
  if (passwordRequired) return <form class="pdf-state" onSubmit={event => { event.preventDefault(); submitPassword(); }}><h2>Password-protected PDF</h2><label>Password<input type="password" value={password} onInput={event => setPassword(event.currentTarget.value)} autoFocus /></label>{passwordError && <p role="alert">{passwordError}</p>}<button class="primary-button" type="submit">Open PDF</button></form>;
  if (error || geometryError) return <div class="pdf-state" role="alert"><h2>PDF could not be opened</h2><p>{error ?? geometryError}</p></div>;
  if (!pdf || !ready) return <div class="pdf-state" role="status">Opening PDF…</div>;
  return <div class="pdf-viewer-wrap">
    <div ref={rootRef} class="pdf-scroll" tabIndex={0}>
      <div class="pdf-pages">
        {bounds && Array.from({ length: pdf.numPages }, (_, index) => index + 1).map(pageNumber => {
          const size = sizes[pageNumber] ?? DEFAULT_SIZE;
          const scale = scaleFor(size);
          return <div key={pageNumber} class="pdf-page-slot" data-pdf-page={pageNumber} style={{ width: `${size.width * scale}px`, height: `${size.height * scale}px` }}>
            {(pageNumber === visible || (!ocrBusy && Math.abs(pageNumber - visible) === 1)) && <PdfPage pdf={pdf} pageNumber={pageNumber} scale={scale} active renderPixels={pageNumber === visible ? MAX_CANVAS_PIXELS : NEIGHBOR_CANVAS_PIXELS} clickLookup={!desktop && clickLookup} desktopLookup={desktop} documentText={documentRecord.content} pageOffset={pdfOffsetForPage(documentRecord.pageOffsets, pageNumber)} onSize={() => {}} onNavigate={page => goTo(page)} pageEnd={documentRecord.pageOffsets?.[pageNumber] ?? documentRecord.content.length} highlights={documentRecord.highlights} activeMarkupTool={activeMarkupTool} activeMarkupColor={activeMarkupColor} onHighlight={onHighlight} onErase={onErase} onLookup={onLookup} onAddNote={onAddNote} />}
          </div>;
        })}
      </div>
    </div>
  </div>;
}
