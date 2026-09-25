import { useEffect, useRef, useState } from 'preact/hooks';
import type { OcrLanguage } from '../../documents/pdf/ocrStore';
import type { OcrQueueStatus } from './usePdfOcrQueue';
import type { GuideLanguage } from '../../onboarding/store';

interface Props {
  mode: 'original' | 'reading'; uiLanguage: GuideLanguage; canRead: boolean; hasPdfText: boolean; hasOcr: boolean; language: OcrLanguage;
  onOriginal: () => void; onReading: () => void; onSource: (source: 'pdf' | 'ocr') => void; onLanguage: (language: OcrLanguage) => void;
  onRecognizeCurrent: () => void; onRecognizeNext: () => void; queueStatus: OcrQueueStatus | null;
  onPause: () => void; onContinue: () => void; onCancel: () => void; hasAnyOcr: boolean; onClear: () => void;
}

export function PdfModeSwitch({ mode, uiLanguage, canRead, hasPdfText, hasOcr, language, onOriginal, onReading, onSource, onLanguage, onRecognizeCurrent, onRecognizeNext, queueStatus, onPause, onContinue, onCancel, hasAnyOcr, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [open]);
  const choose = (source: 'pdf' | 'ocr') => { onSource(source); setOpen(false); };
  const busy = Boolean(queueStatus && ['preparing', 'running', 'paused'].includes(queueStatus.state));
  const done = queueStatus?.state === 'done' && queueStatus.message === 'Không còn trang cần OCR.';
  return <div class="pdf-mode-switch" role="group" aria-label="PDF view mode" ref={root}>
    <button aria-pressed={mode === 'original'} onClick={onOriginal}>{uiLanguage === 'vi' ? 'Trang gốc' : 'Original'}</button>
    <button aria-pressed={mode === 'reading'} disabled={!canRead} onClick={onReading}>{uiLanguage === 'vi' ? 'Đọc chữ' : 'Reading'}</button>
    <button class="pdf-reading-options-toggle" aria-label={uiLanguage === 'vi' ? 'Tùy chọn Đọc chữ' : 'Reading options'} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(value => !value)}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 9 7 7 7-7" /></svg></button>
    <button class="pdf-ocr-next" aria-label={uiLanguage === 'vi' ? 'Tìm và OCR tối đa 6 trang scan tiếp theo chưa được xử lý' : 'Find and OCR the next 6 unprocessed scanned pages'} disabled={busy || done} onClick={onRecognizeNext}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 3h10l4 4v14H5zM15 3v5h5M8 12h8M8 16h8" /></svg>{busy ? `OCR ${queueStatus?.completed ?? 0}/${queueStatus?.total ?? 6}` : done ? (uiLanguage === 'vi' ? 'OCR xong' : 'OCR done') : (uiLanguage === 'vi' ? 'OCR tiếp' : 'OCR next')}</button>
    {open && <div class="pdf-reading-options" role="menu" aria-label={uiLanguage === 'vi' ? 'Tùy chọn Đọc chữ' : 'Reading options'}>
      <button role="menuitem" disabled={!hasPdfText} onClick={() => choose('pdf')}>Chữ PDF</button>
      <button role="menuitem" disabled={!hasOcr} onClick={() => choose('ocr')}>Chữ OCR{hasOcr ? '' : ' · chưa có'}</button>
      <div class="pdf-reading-options-divider" />
      <label>Ngôn ngữ OCR <select aria-label="OCR language" value={language} onChange={event => onLanguage(event.currentTarget.value as OcrLanguage)}><option value="eng">English</option><option value="eng+vie">English + Vietnamese</option></select></label>
      <button role="menuitem" disabled={hasOcr || busy} onClick={() => { setOpen(false); onRecognizeCurrent(); }}>Nhận dạng chữ trang này</button>
      {queueStatus?.state === 'running' && <button role="menuitem" onClick={onPause}>Tạm dừng OCR</button>}
      {queueStatus?.state === 'paused' && <button role="menuitem" onClick={onContinue}>Tiếp tục OCR</button>}
      {queueStatus && <button role="menuitem" onClick={onCancel}>Hủy OCR</button>}
      {queueStatus?.message && <p role="status">{queueStatus.message}</p>}
      {hasAnyOcr && <button role="menuitem" disabled={busy} onClick={() => { setOpen(false); onClear(); }}>Xóa kết quả OCR của tài liệu</button>}
      <p>OCR chạy trên thiết bị. Lần đầu tải khoảng 5–10 MB. Chữ nhận dạng có thể sai.</p>
    </div>}
  </div>;
}
