import { useEffect, useRef, useState } from 'preact/hooks';
import type { DocumentRecord, PdfOcrRecord } from '../../db/database';
import { db } from '../../db/database';
import { ocrCandidate, pageHasInk } from '../../documents/pdf/ocrEligibility';
import { clearOcrPages, saveOcrPage, type OcrLanguage } from '../../documents/pdf/ocrStore';
import { recognizePdfPage, terminateOcrWorker } from '../../documents/pdf/ocrWorker';

export interface OcrQueueStatus { state: 'preparing' | 'running' | 'paused' | 'done' | 'error'; completed: number; total: number; page?: number; progress: number; message?: string }

export async function findNextOcrCandidates(doc: DocumentRecord, language: OcrLanguage, cached: PdfOcrRecord[], hash: string, limit: number, hasInk: (page: number) => Promise<boolean>): Promise<number[]> {
  const result: number[] = [];
  for (let page = 1; page <= (doc.pageOffsets?.length ?? 0) && result.length < limit; page++) {
    if (doc.pdfPages?.[page - 1]?.plainText.trim() || !ocrCandidate(doc, page, language, cached, hash)) continue;
    if (cached.some(item => item.page === page && item.language === language && item.documentHash === hash)) continue;
    if (await hasInk(page)) result.push(page);
  }
  return result;
}

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

  const start = async (firstPage: number, mode: 'current' | 'next' | 'preload', batchLimit = 6) => {
    const { documentRecord: doc, language: selectedLanguage } = latest.current;
    if (!doc?.data || doc.kind !== 'pdf' || controller.current) return;
    const selected = mode === 'current' ? [firstPage] : Array.from({ length: doc.pageOffsets?.length ?? 0 }, (_, index) => index + 1);
    if (!selected.length) return;
    const taskController = new AbortController(); controller.current = taskController;
    const run = ++generation.current;
    setStatus({ state: 'preparing', completed: 0, total: mode === 'next' ? batchLimit : selected.length, progress: 0 });
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
      let pending: number[];
      if (mode === 'next') pending = await findNextOcrCandidates(doc, selectedLanguage, latest.current.cached, hash, batchLimit, async pageNumber => {
        if (taskController.signal.aborted || run !== generation.current) return false;
        const page = await pdf.getPage(pageNumber);
        try { return await pageHasInk(page, taskController.signal); } finally { page.cleanup(); }
      });
      else {
        pending = [];
        for (const pageNumber of selected) {
          if (taskController.signal.aborted || run !== generation.current) return;
          if (mode === 'preload' && doc.pdfPages?.[pageNumber - 1]?.plainText.trim()) continue;
          if (!ocrCandidate(doc, pageNumber, selectedLanguage, latest.current.cached, hash)) continue;
          if (latest.current.cached.some(item => item.page === pageNumber && item.language === selectedLanguage && item.documentHash === hash)) continue;
          if (mode !== 'current') {
            const page = await pdf.getPage(pageNumber);
            let ink: boolean;
            try { ink = await pageHasInk(page, taskController.signal); } finally { page.cleanup(); }
            if (!ink) continue;
          }
          pending.push(pageNumber);
          if (mode === 'preload' && pending.length >= 12) break;
        }
      }
      if (!pending.length) { setStatus({ state: 'done', completed: 0, total: 0, progress: 100, message: 'Không còn trang cần OCR.' }); return; }
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
      if (!taskController.signal.aborted && run === generation.current) setStatus({ state: 'error', completed: 0, total: mode === 'next' ? batchLimit : selected.length, progress: 0, message: error instanceof DOMException && error.name === 'QuotaExceededError' ? 'Không đủ dung lượng để lưu kết quả OCR.' : error instanceof Error ? error.message : 'Không thể nhận dạng chữ. Hãy thử lại.' });
    } finally {
      if (controller.current === taskController) controller.current = null;
      await loadingTask?.destroy().catch(() => {});
      if (taskController.signal.aborted) await terminateOcrWorker();
    }
  };
  const pause = () => { paused.current = true; setStatus(value => value ? { ...value, state: 'paused' } : value); };
  const continueQueue = () => { paused.current = false; resume.current?.(); resume.current = null; setStatus(value => value ? { ...value, state: 'running' } : value); };
  const clear = async () => { const doc = latest.current.documentRecord; if (!doc) return; cancel(); await clearOcrPages(doc.id); latest.current.onClear(); };
  return { status, startCurrent: (page: number) => start(page, 'current'), startNextUnprocessed: (limit = 6) => start(0, 'next', Math.min(6, Math.max(1, limit))), preloadFirstTwelve: () => start(0, 'preload'), pause, continueQueue, cancel, clear };
}
