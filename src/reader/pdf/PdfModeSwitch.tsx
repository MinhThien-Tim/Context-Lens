import { useEffect } from 'preact/hooks';
import { useDesktop } from '../../components/useDesktop';
import { useDialog } from '../../components/useDialog';
import type { OcrLanguage } from '../../documents/pdf/ocrStore';
import type { OcrQueueStatus } from './usePdfOcrQueue';
import type { GuideLanguage } from '../../onboarding/store';

interface ModeProps {
  mode: 'original' | 'reading'; uiLanguage: GuideLanguage; canRead: boolean;
  onOriginal: () => void; onReading: () => void;
}

// Contract §7.1/§7.4/§10.1: Original/Reading is the single PDF presentation control and the only
// presentation control the Header is allowed to own. Nothing else renders here.
export function PdfModeSwitch({ mode, uiLanguage, canRead, onOriginal, onReading }: ModeProps) {
  return <div class="pdf-mode-switch" role="group" aria-label="PDF view mode">
    <button aria-pressed={mode === 'original'} onClick={onOriginal}>{uiLanguage === 'vi' ? 'Trang gốc' : 'Original'}</button>
    <button aria-pressed={mode === 'reading'} disabled={!canRead} onClick={onReading}>{uiLanguage === 'vi' ? 'Đọc chữ' : 'Reading'}</button>
  </div>;
}

interface ToolsProps {
  open: boolean; onClose: () => void; uiLanguage: GuideLanguage;
  hasPdfText: boolean; hasOcr: boolean; language: OcrLanguage; onSource: (source: 'pdf' | 'ocr') => void;
  onLanguage: (language: OcrLanguage) => void; onRecognizeCurrent: () => void; onRecognizeNext: () => void;
  queueStatus: OcrQueueStatus | null; onPause: () => void; onContinue: () => void; onCancel: () => void;
  hasAnyOcr: boolean; onClear: () => void;
}

// Contract §9.7/§12.11: document tools and OCR controls are ONE surface reached from More. This is the
// only place any OCR action lives; the Header exposes no OCR control of its own.
export function PdfDocumentTools({ open, onClose, uiLanguage, hasPdfText, hasOcr, language, onSource, onLanguage, onRecognizeCurrent, onRecognizeNext, queueStatus, onPause, onContinue, onCancel, hasAnyOcr, onClear }: ToolsProps) {
  const desktop = useDesktop();
  const dialog = useDialog(onClose, open, !desktop);
  useEffect(() => {
    if (!open) return;
    if (desktop) dialog.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [open, desktop]);
  const choose = (source: 'pdf' | 'ocr') => { onSource(source); onClose(); };
  const busy = Boolean(queueStatus && ['preparing', 'running', 'paused'].includes(queueStatus.state));
  // Only a structurally exhausted run disables the action. A finished preload window leaves later
  // pages untouched, so `OCR Next` must stay available for them.
  const exhausted = queueStatus?.state === 'done' && queueStatus.exhausted;
  if (!open) return null;
  return <>
    {!desktop && <button class="pdf-tools-backdrop" tabIndex={-1} aria-hidden="true" onClick={onClose} />}
    <section ref={dialog} tabIndex={-1} class="pdf-reading-options" role="dialog" aria-modal={desktop ? undefined : true} aria-label={uiLanguage === 'vi' ? 'Công cụ tài liệu' : 'Document tools'}>
    <header><strong>{uiLanguage === 'vi' ? 'Công cụ tài liệu' : 'Document tools'}</strong><button class="icon-button" aria-label="Close document tools" onClick={onClose}>×</button></header>
    <button disabled={!hasPdfText} onClick={() => choose('pdf')}>Chữ PDF</button>
    <button disabled={!hasOcr} onClick={() => choose('ocr')}>Chữ OCR{hasOcr ? '' : ' · chưa có'}</button>
    <div class="pdf-reading-options-divider" />
    <label>Ngôn ngữ OCR <select aria-label="OCR language" value={language} onChange={event => onLanguage(event.currentTarget.value as OcrLanguage)}><option value="eng">English</option><option value="eng+vie">English + Vietnamese</option></select></label>
    <button disabled={hasOcr || busy} onClick={() => { onClose(); onRecognizeCurrent(); }}>Nhận dạng chữ trang này</button>
    <button aria-label="OCR next" title="Find and OCR the remaining scanned pages, continuing to the end" disabled={busy || exhausted} onClick={() => { onClose(); onRecognizeNext(); }}>{uiLanguage === 'vi' ? 'Tìm và OCR các trang scan còn lại, tiếp tục đến hết tài liệu' : 'Find and OCR the remaining scanned pages, continuing to the end'}</button>
    {queueStatus?.state === 'running' && <button onClick={onPause}>Tạm dừng OCR</button>}
    {queueStatus?.state === 'paused' && <button onClick={onContinue}>Tiếp tục OCR</button>}
    {queueStatus && <button onClick={onCancel}>Hủy OCR</button>}
    {queueStatus && <p role="status">
      {queueStatus.state === 'preparing' ? (uiLanguage === 'vi' ? 'Đang kiểm tra trang cần OCR…' : 'Checking pages for OCR…') : <>
        {queueStatus.state === 'paused' && (uiLanguage === 'vi' ? 'Tạm dừng trước trang tiếp theo. ' : 'Paused before the next page. ')}
        {uiLanguage === 'vi' ? 'Đã xong' : 'Completed'} {queueStatus.completed}/{queueStatus.total}
        {queueStatus.page !== undefined && <> · {uiLanguage === 'vi' ? 'Trang' : 'Page'} {queueStatus.page}: {queueStatus.progress}%</>}
      </>}
      {queueStatus.message && <> · {queueStatus.message}</>}
    </p>}
    {hasAnyOcr && <button disabled={busy} onClick={() => { onClose(); onClear(); }}>Xóa kết quả OCR của tài liệu</button>}
    <p>OCR chạy trên thiết bị. Lần đầu tải khoảng 5–10 MB. Chữ nhận dạng có thể sai.</p>
    </section></>;
}