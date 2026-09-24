import { useEffect, useRef, useState } from 'preact/hooks';
import type { DocumentRecord, PdfOcrRecord } from '../../db/database';
import { db } from '../../db/database';
import { ocrCandidate, pageHasInk } from '../../documents/pdf/ocrEligibility';
import { clearOcrPages, saveOcrPage, type OcrLanguage } from '../../documents/pdf/ocrStore';
import { recognizePdfPage, terminateOcrWorker } from '../../documents/pdf/ocrWorker';

export interface OcrQueueStatus { state: 'preparing' | 'running' | 'paused' | 'done' | 'error'; completed: number; total: number; page?: number; progress: number; message?: string }

export function usePdfOcrQueue(documentRecord: DocumentRecord | null, language: OcrLanguage, cached: PdfOcrRecord[], onResult: (record: PdfOcrRecord) => void, onClear: () => void) {
  const [status, setStatus] = useState<OcrQueueStatus | null>(null);
  const controller = useRef<AbortController | null>(null);
  const paused = useRef(false);
  const resume = useRef<(() => void) | null>(null);
  const generation = useRef(0);
  const latest = useRef({ documentRecord, language, cached, onResult, onClear });
  latest.current = { documentRecord, language, cached, onResult, onClear };
  const cancel = () => { generation.current++; controller.current?.abort(); controller.current = null; paused.current = false; resume.current?.(); resume.current = null; setStatus(null); void terminateOcrWorker(); };
  useEffect(() => () => cancel(), [documentRecord?.id]);

  const start = async (firstPage: number, nextPages: 0 | 3 | 6 | 12) => {
    const { documentRecord: doc, language: selectedLanguage } = latest.current;
    if (!doc?.data || doc.kind !== 'pdf' || controller.current) return;
    const selected = nextPages === 0 ? [firstPage] : Array.from({ length: nextPages }, (_, index) => firstPage + index + 1).filter(page => page <= (doc.pageOffsets?.length ?? 0));
    if (!selected.length) return;
    const taskController = new AbortController(); controller.current = taskController;
    const run = ++generation.current;
    setStatus({ state: 'preparing', completed: 0, total: selected.length, progress: 0 });
    let loadingTask: ReturnType<typeof import('pdfjs-dist')['getDocument']> | undefined;
    try {
      const bytes = new Uint8Array(await doc.data.arrayBuffer());
      if (taskController.signal.aborted) return;
      const hash = doc.pdfHash ?? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
      if (!doc.pdfHash) void db.documents.update(doc.id, { pdfHash: hash });
      const storage = await navigator.storage?.estimate?.();
      if (storage?.quota !== undefined && storage.usage !== undefined && storage.quota - storage.usage < 1_000_000) throw new Error('Thiết bị sắp hết dung lượng lưu trữ. Hãy giải phóng dung lượng trước khi OCR.');
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      loadingTask = pdfjs.getDocument({ data: bytes });
      const pdf = await loadingTask.promise;
      const pending: number[] = [];
      for (const pageNumber of selected) {
        if (taskController.signal.aborted || run !== generation.current) return;
        if (nextPages === 12 && doc.pdfPages?.[pageNumber - 1]?.plainText.trim()) continue;
        if (nextPages !== 0 && !ocrCandidate(doc, pageNumber, selectedLanguage, latest.current.cached, hash)) continue;
        if (latest.current.cached.some(item => item.page === pageNumber && item.language === selectedLanguage && item.documentHash === hash)) continue;
        if (nextPages !== 0) {
          const page = await pdf.getPage(pageNumber);
          let hasInk: boolean;
          try { hasInk = await pageHasInk(page, taskController.signal); } finally { page.cleanup(); }
          if (!hasInk) continue;
        }
        pending.push(pageNumber);
      }
      if (!pending.length) { setStatus(nextPages === 12 ? null : { state: 'done', completed: 0, total: 0, progress: 100, message: 'Không có trang scan cần OCR trong phạm vi đã chọn.' }); return; }
      setStatus({ state: 'running', completed: 0, total: pending.length, progress: 0, message: `${pending.length} trang cần OCR` });
      let completed = 0;
      for (const pageNumber of pending) {
        if (taskController.signal.aborted || run !== generation.current) return;
        while (paused.current && !taskController.signal.aborted) await new Promise<void>(resolve => { resume.current = resolve; });
        if (taskController.signal.aborted) return;
        setStatus({ state: paused.current ? 'paused' : 'running', completed, total: pending.length, page: pageNumber, progress: 0 });
        const started = performance.now();
        const text = await recognizePdfPage(pdf, pageNumber, taskController.signal, (_message, progress) => {
          if (!taskController.signal.aborted && run === generation.current) setStatus({ state: paused.current ? 'paused' : 'running', completed, total: pending.length, page: pageNumber, progress: Math.round(progress * 100) });
        }, selectedLanguage);
        if (taskController.signal.aborted) return;
        if (!text.trim()) throw new Error(`Trang ${pageNumber} không nhận dạng được chữ.`);
        const record = await saveOcrPage(doc.id, pageNumber, text, selectedLanguage, hash);
        latest.current.onResult(record);
        completed++;
        setStatus({ state: paused.current ? 'paused' : 'running', completed, total: pending.length, progress: 100, message: `Trang ${pageNumber}: ${Math.round(performance.now() - started)} ms` });
      }
      if (run === generation.current) setStatus(null);
    } catch (error) {
      if (!taskController.signal.aborted && run === generation.current) setStatus({ state: 'error', completed: 0, total: selected.length, progress: 0, message: error instanceof DOMException && error.name === 'QuotaExceededError' ? 'Không đủ dung lượng để lưu kết quả OCR.' : error instanceof Error ? error.message : 'Không thể nhận dạng chữ. Hãy thử lại.' });
    } finally {
      if (controller.current === taskController) controller.current = null;
      await loadingTask?.destroy().catch(() => {});
      if (taskController.signal.aborted) await terminateOcrWorker();
    }
  };
  const pause = () => { paused.current = true; setStatus(value => value ? { ...value, state: 'paused' } : value); };
  const continueQueue = () => { paused.current = false; resume.current?.(); resume.current = null; setStatus(value => value ? { ...value, state: 'running' } : value); };
  const clear = async () => { const doc = latest.current.documentRecord; if (!doc) return; cancel(); await clearOcrPages(doc.id); latest.current.onClear(); };
  return { status, start, preloadFirstTwelve: () => start(0, 12), pause, continueQueue, cancel, clear };
}
