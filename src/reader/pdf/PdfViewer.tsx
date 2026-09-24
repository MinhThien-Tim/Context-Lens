import { useEffect, useRef, useState } from 'preact/hooks';
import type { DocumentRecord } from '../../db/database';
import type { PdfDocumentLocation } from '../../documents/location';
import type { ReaderSelection } from '../TextReader';
import { calculatePdfScale, pdfOffsetForPage, type PdfZoomMode } from './navigation';
import { PdfPage, type PdfPageSize } from './PdfPage';
import { usePdfDocument } from './usePdfDocument';
import { usePdfScroll } from './usePdfScroll';
import { useDesktop } from '../../components/useDesktop';
import type { MarkupTool } from '../MarkupPalette';

const DEFAULT_SIZE = { width: 612, height: 792 };

export function PdfViewer({ documentRecord, location, zoomMode, onZoomMode, activeMarkupTool, activeMarkupColor = 'yellow', onLocation, onLookup, onAddNote, navigationToken = 0, onHighlight, onErase, ocrBusy = false }: { navigationToken?: number; activeMarkupTool?: MarkupTool | null; activeMarkupColor?: import('../../db/database').ReaderHighlight['color']; onHighlight?: (highlight: import('../../db/database').ReaderHighlight) => void; onErase?: (startOffset: number, endOffset: number) => void; documentRecord: DocumentRecord; location: PdfDocumentLocation; zoomMode: PdfZoomMode; onZoomMode: (mode: PdfZoomMode) => void; onLocation: (location: PdfDocumentLocation) => void; onLookup: (selection: ReaderSelection) => void; onAddNote?: (selection: ReaderSelection) => void; ocrBusy?: boolean }) {
  const desktop = useDesktop();
  const [mobileZoom, setMobileZoom] = useState<PdfZoomMode>('fit-width');
  const effectiveZoom = desktop ? zoomMode : mobileZoom;
  const changeZoom = (mode: PdfZoomMode) => { if (desktop) onZoomMode(mode); else setMobileZoom(mode); };
  const [moreOpen, setMoreOpen] = useState(false);
  const { pdf, error, passwordRequired, password, setPassword, submitPassword } = usePdfDocument(documentRecord.data);
  const rootRef = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState<Record<number, PdfPageSize>>({});
  const [geometryError, setGeometryError] = useState<string | null>(null);
  const [visible, setVisible] = useState(location.page);
  const [customScale, setCustomScale] = useState(1);
  const [bounds, setBounds] = useState({ width: window.innerWidth, height: window.innerHeight - 110 });
  const scaleFor = (size: PdfPageSize) => calculatePdfScale(effectiveZoom, customScale, bounds.width, bounds.height, size.width, size.height);
  const geometryKey = `${effectiveZoom}:${customScale}:${bounds.width}:${bounds.height}`;
  // Keep the current page and one page ahead (or behind at the end) mounted.
  const neighbor = visible < (pdf?.numPages ?? 1) ? visible + 1 : visible - 1;

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
  const ready = Boolean(pdf && Object.keys(sizes).length === pdf.numPages);
  const lastPosition = useRef('');
  const goTo = usePdfScroll(rootRef, '.pdf-page-slot', ready, location, navigationToken, (page, pageOffset, scrollY) => {
    setVisible(page);
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
    const resize = new ResizeObserver(entries => { const rect = entries[0]?.contentRect; if (rect) setBounds(current => current.width === rect.width && current.height === rect.height ? current : { width: rect.width, height: rect.height }); });
    resize.observe(root); return () => resize.disconnect();
  }, [pdf, ready]);
  if (passwordRequired) return <form class="pdf-state" onSubmit={event => { event.preventDefault(); submitPassword(); }}><h2>Password-protected PDF</h2><label>Password<input type="password" value={password} onInput={event => setPassword(event.currentTarget.value)} autoFocus /></label><button class="primary-button" type="submit">Open PDF</button></form>;
  if (error || geometryError) return <div class="pdf-state" role="alert"><h2>PDF could not be opened</h2><p>{error ?? geometryError}</p></div>;
  if (!pdf || !ready) return <div class="pdf-state" role="status">Opening PDF…</div>;
  return <div class="pdf-viewer-wrap">
    <div class="pdf-toolbar" aria-label="PDF controls">
      {desktop ? <><button aria-label="Zoom out" onClick={() => { changeZoom('custom'); setCustomScale(value => Math.max(.5, value - .15)); }}>−</button><button aria-label="Zoom in" onClick={() => { changeZoom('custom'); setCustomScale(value => Math.min(3, value + .15)); }}>+</button><select aria-label="PDF zoom" value={effectiveZoom} onChange={event => changeZoom(event.currentTarget.value as PdfZoomMode)}><option value="fit-width">Vừa chiều ngang</option><option value="fit-page">Vừa trang</option><option value="custom">Tùy chỉnh</option></select></> : <div class="pdf-more"><button aria-label="PDF options" aria-expanded={moreOpen} onClick={() => setMoreOpen(value => !value)}>•••</button>{moreOpen && <div class="pdf-more-menu"><button onClick={() => { changeZoom('custom'); setCustomScale(value => Math.max(.5, value - .15)); }}>Zoom out</button><button onClick={() => { changeZoom('custom'); setCustomScale(value => Math.min(3, value + .15)); }}>Zoom in</button><button onClick={() => changeZoom('fit-width')}>Fit width</button><button onClick={() => changeZoom('fit-page')}>Fit page</button></div>}</div>}
    </div>
    <div ref={rootRef} class="pdf-scroll" tabIndex={0}>
      {Array.from({ length: pdf.numPages }, (_, index) => index + 1).map(pageNumber => {
        const size = sizes[pageNumber] ?? DEFAULT_SIZE;
        const scale = scaleFor(size);
        return <div key={pageNumber} class="pdf-page-slot" data-pdf-page={pageNumber} style={{ width: `${size.width * scale}px`, height: `${size.height * scale}px` }}>
          {(pageNumber === visible || (!ocrBusy && pageNumber === neighbor)) && <PdfPage pdf={pdf} pageNumber={pageNumber} scale={scale} active documentText={documentRecord.content} pageOffset={pdfOffsetForPage(documentRecord.pageOffsets, pageNumber)} onSize={() => {}} onNavigate={page => goTo(page)} pageEnd={documentRecord.pageOffsets?.[pageNumber] ?? documentRecord.content.length} highlights={documentRecord.highlights} activeMarkupTool={activeMarkupTool} activeMarkupColor={activeMarkupColor} onHighlight={onHighlight} onErase={onErase} onLookup={onLookup} onAddNote={onAddNote} />}
        </div>;
      })}
    </div>
  </div>;
}
