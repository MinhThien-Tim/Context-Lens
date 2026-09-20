import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { DocumentRecord } from '../../db/database';
import type { PdfDocumentLocation } from '../../documents/location';
import type { ReaderSelection } from '../TextReader';
import { calculatePdfScale, pdfOffsetForPage, type PdfZoomMode } from './navigation';
import { PdfPage, type PdfPageSize } from './PdfPage';
import { usePdfDocument } from './usePdfDocument';
import { useDesktop } from '../../components/useDesktop';

const DEFAULT_SIZE = { width: 612, height: 792 };

export function PdfViewer({ documentRecord, location, zoomMode, onZoomMode, onViewMode, onLocation, onLookup, onAddNote }: { documentRecord: DocumentRecord; location: PdfDocumentLocation; zoomMode: PdfZoomMode; onZoomMode: (mode: PdfZoomMode) => void; onViewMode: () => void; onLocation: (location: PdfDocumentLocation) => void; onLookup: (selection: ReaderSelection) => void; onAddNote?: (selection: ReaderSelection) => void }) {
  const desktop = useDesktop();
  const [moreOpen, setMoreOpen] = useState(false);
  const { pdf, error, passwordRequired, password, setPassword, submitPassword } = usePdfDocument(documentRecord.data);
  const rootRef = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState<Record<number, PdfPageSize>>({});
  const [visible, setVisible] = useState(() => new Set([location.page]));
  const [customScale, setCustomScale] = useState(1);
  const [bounds, setBounds] = useState({ width: window.innerWidth, height: window.innerHeight - 110 });
  const currentSize = sizes[location.page] ?? DEFAULT_SIZE;
  const scale = calculatePdfScale(zoomMode, customScale, bounds.width, bounds.height, currentSize.width, currentSize.height);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !pdf) return;
    const observer = new IntersectionObserver(entries => {
      setVisible(previous => {
        const next = new Set(previous);
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.pdfPage);
          if (entry.isIntersecting) next.add(page); else next.delete(page);
        }
        return next;
      });
      const best = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (best) {
        const page = Number((best.target as HTMLElement).dataset.pdfPage);
        const pageElement = best.target as HTMLElement;
        const pageOffset = Math.max(0, -pageElement.getBoundingClientRect().top) / Math.max(1, pageElement.offsetHeight);
        onLocation({ kind: 'pdf', page, pageOffset, textOffset: 0, absoluteOffset: pdfOffsetForPage(documentRecord.pageOffsets, page), scrollY: root.scrollTop, progress: (page - 1 + pageOffset) / pdf.numPages, updatedAt: Date.now() });
      }
    }, { root, rootMargin: '1200px 0px', threshold: [0, .1, .5, 1] });
    root.querySelectorAll('[data-pdf-page]').forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [pdf, documentRecord.pageOffsets]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const resize = new ResizeObserver(entries => { const rect = entries[0]?.contentRect; if (rect) setBounds({ width: rect.width, height: rect.height }); });
    resize.observe(root); return () => resize.disconnect();
  }, []);
  useEffect(() => {
    if (!pdf || !rootRef.current) return;
    requestAnimationFrame(() => rootRef.current?.querySelector(`[data-pdf-page="${location.page}"]`)?.scrollIntoView({ block: 'start' }));
  }, [pdf]);

  const activePages = useMemo(() => { const result = new Set<number>(); for (const page of visible) for (let value = page - 2; value <= page + 2; value++) if (pdf && value >= 1 && value <= pdf.numPages) result.add(value); return result; }, [visible, pdf]);
  if (passwordRequired) return <form class="pdf-state" onSubmit={event => { event.preventDefault(); submitPassword(); }}><h2>Password-protected PDF</h2><label>Password<input type="password" value={password} onInput={event => setPassword(event.currentTarget.value)} autoFocus /></label><button class="primary-button" type="submit">Open PDF</button></form>;
  if (error) return <div class="pdf-state" role="alert"><h2>PDF could not be opened</h2><p>{error}</p></div>;
  if (!pdf) return <div class="pdf-state" role="status">Opening PDF…</div>;
  return <div class="pdf-viewer-wrap">
    <div class="pdf-toolbar" aria-label="PDF controls">
      <button aria-label="Previous page" disabled={location.page <= 1} onClick={() => rootRef.current?.querySelector(`[data-pdf-page="${location.page - 1}"]`)?.scrollIntoView()}>‹</button>
      <span aria-label="Current PDF page">{location.page} / {pdf.numPages}</span>
      <button aria-label="Next page" disabled={location.page >= pdf.numPages} onClick={() => rootRef.current?.querySelector(`[data-pdf-page="${location.page + 1}"]`)?.scrollIntoView()}>›</button>
      {desktop ? <><button aria-label="Zoom out" onClick={() => { onZoomMode('custom'); setCustomScale(value => Math.max(.5, value - .15)); }}>−</button><button aria-label="Zoom in" onClick={() => { onZoomMode('custom'); setCustomScale(value => Math.min(3, value + .15)); }}>+</button><button aria-pressed={zoomMode === 'fit-width'} onClick={() => onZoomMode('fit-width')}>Fit width</button><button aria-pressed={zoomMode === 'fit-page'} onClick={() => onZoomMode('fit-page')}>Fit page</button></> : <div class="pdf-more"><button aria-label="PDF options" aria-expanded={moreOpen} onClick={() => setMoreOpen(value => !value)}>•••</button>{moreOpen && <div class="pdf-more-menu"><button onClick={onViewMode}>Reading mode</button><button onClick={() => { onZoomMode('custom'); setCustomScale(value => Math.max(.5, value - .15)); }}>Zoom out</button><button onClick={() => { onZoomMode('custom'); setCustomScale(value => Math.min(3, value + .15)); }}>Zoom in</button><button onClick={() => onZoomMode('fit-width')}>Fit width</button><button onClick={() => onZoomMode('fit-page')}>Fit page</button></div>}</div>}
    </div>
    <div ref={rootRef} class="pdf-scroll" tabIndex={0}>
      {Array.from({ length: pdf.numPages }, (_, index) => index + 1).map(pageNumber => {
        const size = sizes[pageNumber] ?? DEFAULT_SIZE;
        return <div class="pdf-page-slot" data-pdf-page={pageNumber} style={{ width: `${size.width * scale}px`, height: `${size.height * scale}px` }}>
          {activePages.has(pageNumber) && <PdfPage pdf={pdf} pageNumber={pageNumber} scale={scale} active documentText={documentRecord.content} pageOffset={pdfOffsetForPage(documentRecord.pageOffsets, pageNumber)} onSize={size => setSizes(current => ({ ...current, [pageNumber]: size }))} onNavigate={page => rootRef.current?.querySelector(`[data-pdf-page="${page}"]`)?.scrollIntoView()} onLookup={onLookup} onAddNote={onAddNote} />}
        </div>;
      })}
    </div>
  </div>;
}
