import { useEffect, useRef, useState } from 'preact/hooks';
import { useDesktop } from '../../components/useDesktop';
import { useDialog } from '../../components/useDialog';
import type { OcrLanguage } from '../../documents/pdf/ocrStore';
import type { OcrQueueStatus } from './usePdfOcrQueue';
import type { GuideLanguage } from '../../onboarding/store';

interface Props {
  showNext?: boolean; mode: 'original' | 'reading'; uiLanguage: GuideLanguage; canRead: boolean; hasPdfText: boolean; hasOcr: boolean; language: OcrLanguage;
  onOriginal: () => void; onReading: () => void; onSource: (source: 'pdf' | 'ocr') => void; onLanguage: (language: OcrLanguage) => void;
  onRecognizeCurrent: () => void; onRecognizeNext: () => void; queueStatus: OcrQueueStatus | null;
  onPause: () => void; onContinue: () => void; onCancel: () => void; hasAnyOcr: boolean; onClear: () => void;
}

export function PdfModeSwitch({ showNext = true, mode, uiLanguage, canRead, hasPdfText, hasOcr, language, onOriginal, onReading, onSource, onLanguage, onRecognizeCurrent, onRecognizeNext, queueStatus, onPause, onContinue, onCancel, hasAnyOcr, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const desktop = useDesktop();
  const dialog = useDialog(() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); }, open, !desktop);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    if (desktop) dialog.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open, desktop]);
  const choose = (source: 'pdf' | 'ocr') => { onSource(source); setOpen(false); };
  const busy = Boolean(queueStatus && ['preparing', 'running', 'paused'].includes(queueStatus.state));
  const done = queueStatus?.state === 'done' && queueStatus.message === 'Không còn trang cần OCR.';
  return <div class="pdf-mode-controls" ref={root}>
    <div class="pdf-mode-switch" role="group" aria-label="PDF view mode">
      <button aria-pressed={mode === 'original'} onClick={() => { setOpen(false); onOriginal(); }}>{uiLanguage === 'vi' ? 'Trang gốc' : 'Original'}</button>
      <button aria-pressed={mode === 'reading'} disabled={!canRead} onClick={() => { setOpen(false); onReading(); }}>{uiLanguage === 'vi' ? 'Đọc chữ' : 'Reading'}</button>
    </div>
    {showNext && <button class="toolbar-button ocr-next-button" aria-label="OCR next" title="Find and OCR the next 6 unprocessed scanned pages" disabled={busy || done} onClick={onRecognizeNext}><span aria-hidden="true">✧</span> OCR next</button>}
    <div class="pdf-tools">
      <button ref={trigger} class="icon-button pdf-reading-options-toggle" aria-label={uiLanguage === 'vi' ? 'Công cụ tài liệu' : 'Document tools'} title={uiLanguage === 'vi' ? 'Chữ PDF, OCR và nguồn văn bản' : 'PDF text, OCR and text sources'} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(value => !value)}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 3h10l4 4v14H5zM15 3v5h5M8 12h8M8 16h8" /></svg>{busy && <span class="pdf-tools-busy" />}</button>
      {open && <>
      {!desktop && <button class="pdf-tools-backdrop" tabIndex={-1} aria-label="Close document tools" onClick={() => setOpen(false)} />}
      <section ref={dialog} tabIndex={-1} class="pdf-reading-options" role="dialog" aria-modal={desktop ? undefined : true} aria-label={uiLanguage === 'vi' ? 'Công cụ tài liệu' : 'Document tools'}>
      <header><strong>{uiLanguage === 'vi' ? 'Công cụ tài liệu' : 'Document tools'}</strong><button class="icon-button" aria-label="Close document tools" onClick={() => setOpen(false)}>×</button></header>
      <button disabled={!hasPdfText} onClick={() => choose('pdf')}>Chữ PDF</button>
      <button disabled={!hasOcr} onClick={() => choose('ocr')}>Chữ OCR{hasOcr ? '' : ' · chưa có'}</button>
      <div class="pdf-reading-options-divider" />
      <label>Ngôn ngữ OCR <select aria-label="OCR language" value={language} onChange={event => onLanguage(event.currentTarget.value as OcrLanguage)}><option value="eng">English</option><option value="eng+vie">English + Vietnamese</option></select></label>
      <button disabled={hasOcr || busy} onClick={() => { setOpen(false); onRecognizeCurrent(); }}>Nhận dạng chữ trang này</button>
      <button disabled={busy || done} onClick={() => { setOpen(false); onRecognizeNext(); }}>{uiLanguage === 'vi' ? 'Tìm và OCR tối đa 6 trang scan tiếp theo chưa được xử lý' : 'Find and OCR the next 6 unprocessed scanned pages'}</button>
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
      {hasAnyOcr && <button disabled={busy} onClick={() => { setOpen(false); onClear(); }}>Xóa kết quả OCR của tài liệu</button>}
      <p>OCR chạy trên thiết bị. Lần đầu tải khoảng 5–10 MB. Chữ nhận dạng có thể sai.</p>
      </section></>}
    </div>
  </div>;
}
