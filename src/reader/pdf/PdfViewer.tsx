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
import type { PdfOcrRecord } from '../../db/database';
import { recognizePdfPage } from '../../documents/pdf/ocrWorker';
import { saveOcrPage } from '../../documents/pdf/ocrStore';

const DEFAULT_SIZE = { width: 612, height: 792 };

export function PdfViewer({ documentRecord, location, zoomMode, onZoomMode, activeMarkupTool, activeMarkupColor = 'yellow', onLocation, onLookup, onAddNote, navigationToken = 0, onHighlight, onErase, ocrPages = [], onOcrResult, onOpenReading }: { navigationToken?: number; activeMarkupTool?: MarkupTool | null; activeMarkupColor?: import('../../db/database').ReaderHighlight['color']; onHighlight?: (highlight: import('../../db/database').ReaderHighlight) => void; onErase?: (startOffset: number, endOffset: number) => void; documentRecord: DocumentRecord; location: PdfDocumentLocation; zoomMode: PdfZoomMode; onZoomMode: (mode: PdfZoomMode) => void; onLocation: (location: PdfDocumentLocation) => void; onLookup: (selection: ReaderSelection) => void; onAddNote?: (selection: ReaderSelection) => void; ocrPages?: PdfOcrRecord[]; onOcrResult?: (record: PdfOcrRecord) => void; onOpenReading?: () => void }) {
  const desktop = useDesktop();
  const [mobileZoom, setMobileZoom] = useState<PdfZoomMode>('fit-width');
  const effectiveZoom = desktop ? zoomMode : mobileZoom;
  const changeZoom = (mode: PdfZoomMode) => { if (desktop) onZoomMode(mode); else setMobileZoom(mode); };
  const [moreOpen, setMoreOpen] = useState(false);
  const { pdf, error, passwordRequired, password, setPassword, submitPassword } = usePdfDocument(documentRecord.data);
  const rootRef = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState<Record<number, PdfPageSize>>({});
  const [geometryError, setGeometryError] = useState<string | null>(null);
  const [ocrStatus, setOcrStatus] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const ocrController = useRef<AbortController | null>(null);
  const [visible, setVisible] = useState(location.page);
  const [customScale, setCustomScale] = useState(1);
  const [bounds, setBounds] = useState({ width: window.innerWidth, height: window.innerHeight - 110 });
  const scaleFor = (size: PdfPageSize) => calculatePdfScale(effectiveZoom, customScale, bounds.width, bounds.height, size.width, size.height);
  const geometryKey = `${effectiveZoom}:${customScale}:${bounds.width}:${bounds.height}`;
  // Keep the current page and one page ahead (or behind at the end) mounted.
  const neighbor = visible < (pdf?.numPages ?? 1) ? visible + 1 : visible - 1;
  const recognized = ocrPages.some(record => record.page === visible);
  const extractedText = documentRecord.pdfPages?.[visible - 1]?.plainText ?? documentRecord.content.slice(pdfOffsetForPage(documentRecord.pageOffsets, visible), documentRecord.pageOffsets?.[visible] ?? documentRecord.content.length);
  const needsOcr = extractedText.trim().length < 40;
  useEffect(() => () => ocrController.current?.abort(), []);
  const startOcr = async () => {
    if (!pdf || ocrController.current || recognized || !needsOcr) return;
    const controller = new AbortController(); ocrController.current = controller;
    setOcrError(null); setOcrStatus('Đang chuẩn bị OCR'); setOcrProgress(0);
    const pageNumber = visible;
    try {
      const text = await recognizePdfPage(pdf, pageNumber, controller.signal, (status, progress) => {
        if (!controller.signal.aborted) { setOcrStatus(ocrStatusLabel(status)); setOcrProgress(Math.round(progress * 100)); }
      });
      if (controller.signal.aborted) return;
      if (!text) throw new Error('Không nhận dạng được chữ trên trang này. Hãy thử bản scan rõ hơn.');
      const record = await saveOcrPage(documentRecord.id, pageNumber, text);
      onOcrResult?.(record);
      setOcrStatus(null);
    } catch (error) {
      if (!controller.signal.aborted) setOcrError(error instanceof DOMException && error.name === 'QuotaExceededError' ? 'Thiết bị không đủ dung lượng để lưu chữ nhận dạng.' : 'Không thể nhận dạng trang này. Kiểm tra kết nối tải dữ liệu OCR rồi thử lại.');
    } finally {
      if (ocrController.current === controller) ocrController.current = null;
      if (controller.signal.aborted) setOcrStatus(null);
    }
  };

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
      {needsOcr && !recognized && <button disabled={Boolean(ocrStatus)} onClick={() => void startOcr()}>Nhận dạng chữ trang này</button>}
      {recognized && <button onClick={onOpenReading}>Đọc chữ đã nhận dạng</button>}
      {ocrStatus && <><span role="status">{ocrStatus} {ocrProgress}%</span><button onClick={() => ocrController.current?.abort()}>Hủy OCR</button></>}
      {desktop ? <><button aria-label="Zoom out" onClick={() => { changeZoom('custom'); setCustomScale(value => Math.max(.5, value - .15)); }}>−</button><button aria-label="Zoom in" onClick={() => { changeZoom('custom'); setCustomScale(value => Math.min(3, value + .15)); }}>+</button><button aria-pressed={effectiveZoom === 'fit-width'} onClick={() => changeZoom('fit-width')}>Fit width</button><button aria-pressed={effectiveZoom === 'fit-page'} onClick={() => changeZoom('fit-page')}>Fit page</button></> : <div class="pdf-more"><button aria-label="PDF options" aria-expanded={moreOpen} onClick={() => setMoreOpen(value => !value)}>•••</button>{moreOpen && <div class="pdf-more-menu"><button onClick={() => { changeZoom('custom'); setCustomScale(value => Math.max(.5, value - .15)); }}>Zoom out</button><button onClick={() => { changeZoom('custom'); setCustomScale(value => Math.min(3, value + .15)); }}>Zoom in</button><button onClick={() => changeZoom('fit-width')}>Fit width</button><button onClick={() => changeZoom('fit-page')}>Fit page</button></div>}</div>}
    </div>
    {needsOcr && !recognized && !ocrStatus && <p class="pdf-ocr-notice">OCR tiếng Anh chạy trên thiết bị. Lần đầu cần tải thư viện, WebAssembly và dữ liệu ngôn ngữ (ước tính 5–10 MB, tùy trình duyệt). Chữ nhận dạng có thể sai.</p>}
    {ocrError && <p class="pdf-ocr-error" role="alert">{ocrError} <button onClick={() => void startOcr()}>Thử lại</button></p>}
    <div ref={rootRef} class="pdf-scroll" tabIndex={0}>
      {Array.from({ length: pdf.numPages }, (_, index) => index + 1).map(pageNumber => {
        const size = sizes[pageNumber] ?? DEFAULT_SIZE;
        const scale = scaleFor(size);
        return <div key={pageNumber} class="pdf-page-slot" data-pdf-page={pageNumber} style={{ width: `${size.width * scale}px`, height: `${size.height * scale}px` }}>
          {(pageNumber === visible || (!ocrStatus && pageNumber === neighbor)) && <PdfPage pdf={pdf} pageNumber={pageNumber} scale={scale} active documentText={documentRecord.content} pageOffset={pdfOffsetForPage(documentRecord.pageOffsets, pageNumber)} onSize={() => {}} onNavigate={page => goTo(page)} pageEnd={documentRecord.pageOffsets?.[pageNumber] ?? documentRecord.content.length} highlights={documentRecord.highlights} activeMarkupTool={activeMarkupTool} activeMarkupColor={activeMarkupColor} onHighlight={onHighlight} onErase={onErase} onLookup={onLookup} onAddNote={onAddNote} />}
        </div>;
      })}
    </div>
  </div>;
}

function ocrStatusLabel(status: string): string {
  if (/render/i.test(status)) return 'Đang tạo ảnh trang PDF';
  if (/recogniz/i.test(status)) return 'Đang nhận dạng chữ';
  if (/load|initializ/i.test(status)) return 'Đang tải dữ liệu OCR tiếng Anh';
  return 'Đang xử lý OCR';
}
