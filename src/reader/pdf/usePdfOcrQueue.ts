import { useEffect, useRef, useState } from 'preact/hooks';
import type { DocumentRecord, PdfOcrRecord } from '../../db/database';
import { db } from '../../db/database';
import { ocrCandidate, pageHasInk } from '../../documents/pdf/ocrEligibility';
import { clearOcrPages, saveOcrPage, type OcrLanguage } from '../../documents/pdf/ocrStore';
import { recognizePdfPage, terminateOcrWorker } from '../../documents/pdf/ocrWorker';

export interface OcrQueueStatus {
  state: 'preparing' | 'running' | 'paused' | 'done' | 'error';
  completed: number; total: number; page?: number; progress: number; message?: string;
  /**
   * Structural "no work left" flag — the replacement for the removed localized-string probe.
   * True ONLY when an explicit run walked the whole document and found zero OCR candidates.
   * Initial preload never sets it: a preload run scans at most one 12-page window, so a finished
   * preload must leave `OCR Next` enabled for the pages it never looked at.
   */
  exhausted: boolean;
}

/** Logical batch size: consecutive PDF pages examined per window. One run processes every window in order. */
export const OCR_AUTO_BATCH_SIZE = 12;

/** Eligibility reuse: the page is an OCR candidate and has no cached result for this language and hash. */
async function shouldOcrPage(doc: DocumentRecord, pageNumber: number, language: OcrLanguage, cached: PdfOcrRecord[], hash: string): Promise<boolean> {
  if (!ocrCandidate(doc, pageNumber, language, cached, hash)) return false;
  return !cached.some(item => item.page === pageNumber && item.language === language && item.documentHash === hash);
}

export async function findNextOcrCandidates(doc: DocumentRecord, language: OcrLanguage, cached: PdfOcrRecord[], hash: string, limit: number, hasInk: (page: number) => Promise<boolean>, fromPage = 1, toPage = doc.pageOffsets?.length ?? 0): Promise<number[]> {
  const result: number[] = [];
  const lastPage = Math.min(toPage, doc.pageOffsets?.length ?? 0);
  for (let page = Math.max(1, fromPage); page <= lastPage && result.length < limit; page++) {
    if (!ocrCandidate(doc, page, language, cached, hash)) continue;
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

  const start = async (firstPage: number, mode: 'current' | 'next' | 'preload') => {
    const { documentRecord: doc, language: selectedLanguage } = latest.current;
    if (!doc?.data || doc.kind !== 'pdf' || controller.current) return;
    const pageCount = doc.pageOffsets?.length ?? 0;
    if (!pageCount) return;
    const taskController = new AbortController(); controller.current = taskController;
    const run = ++generation.current;
    const isCurrent = () => !taskController.signal.aborted && run === generation.current && latest.current.documentRecord?.id === doc.id;
    let plannedTotal = 0;
    setStatus({ state: 'preparing', completed: 0, total: 0, progress: 0, exhausted: false });
    let loadingTask: ReturnType<typeof import('pdfjs-dist')['getDocument']> | undefined;
    try {
      const bytes = new Uint8Array(await doc.data.arrayBuffer());
      if (taskController.signal.aborted) return;
      const hash = doc.pdfHash ?? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
      if (!doc.pdfHash) void db.documents.update(doc.id, { pdfHash: hash });
      const storage = await navigator.storage?.estimate?.();
      if (!isCurrent()) return;
      if (storage?.quota !== undefined && storage.usage !== undefined && storage.quota - storage.usage < 1_000_000) throw new Error('Thiết bị sắp hết dung lượng lưu trữ. Hãy giải phóng dung lượng trước khi OCR.');
      const pdfjs = await import('pdfjs-dist');
      if (!isCurrent()) return;
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      loadingTask = pdfjs.getDocument({ data: bytes });
      const pdf = await loadingTask.promise;
      const hasInkOnPage = async (pageNumber: number) => {
        if (taskController.signal.aborted || run !== generation.current) return false;
        const page = await pdf.getPage(pageNumber);
        try { return await pageHasInk(page, taskController.signal); } finally { page.cleanup(); }
      };
      let pending: number[] = [];
      if (mode === 'preload') {
        for (let pageNumber = 1; pageNumber <= Math.min(12, pageCount); pageNumber++) {
          if (taskController.signal.aborted || run !== generation.current) return;
          if (doc.pdfPages?.[pageNumber - 1]?.plainText.trim()) continue;
          if (!(await shouldOcrPage(doc, pageNumber, selectedLanguage, latest.current.cached, hash))) continue;
          if (!(await hasInkOnPage(pageNumber))) continue;
          pending.push(pageNumber);
          if (pending.length >= OCR_AUTO_BATCH_SIZE) break;
        }
      } else {
        // An explicit run walks the whole document once in consecutive 12-page windows, so no window needs another click.
        if (mode === 'current') {
          if (await shouldOcrPage(doc, firstPage, selectedLanguage, latest.current.cached, hash) && await hasInkOnPage(firstPage)) pending.push(firstPage);
        }
        for (let windowStart = mode === 'current' ? firstPage + 1 : 1; windowStart <= pageCount; windowStart += OCR_AUTO_BATCH_SIZE) {
          if (taskController.signal.aborted || run !== generation.current) return;
          const windowEnd = Math.min(pageCount, windowStart + OCR_AUTO_BATCH_SIZE - 1);
          setStatus({ state: 'preparing', completed: 0, total: 0, progress: 0, exhausted: false, message: `Trang ${windowStart}/${pageCount}` });
          pending = pending.concat(await findNextOcrCandidates(doc, selectedLanguage, latest.current.cached, hash, OCR_AUTO_BATCH_SIZE, hasInkOnPage, windowStart, windowEnd));
        }
      }
      if (!isCurrent()) return;
      if (!pending.length) {
        // Structural exhaustion: only an explicit run walks every window, so only it can prove the
        // document has no OCR work left. A preload stop is a bounded window, never exhaustion.
        setStatus({ state: 'done', completed: 0, total: 0, progress: 100, exhausted: mode !== 'preload', message: 'Không còn trang cần OCR.' });
        return;
      }
      plannedTotal = pending.length;
      setStatus({ state: 'running', completed: 0, total: pending.length, progress: 0, exhausted: false, message: `${pending.length} trang cần OCR` });
      let completed = 0;
      for (const pageNumber of pending) {
        if (taskController.signal.aborted || run !== generation.current) return;
        while (paused.current && !taskController.signal.aborted) await new Promise<void>(resolve => { resume.current = resolve; });
        if (taskController.signal.aborted) return;
        setStatus({ state: paused.current ? 'paused' : 'running', completed, total: pending.length, page: pageNumber, progress: 0, exhausted: false });
        const started = performance.now();
        const text = await recognizePdfPage(pdf, pageNumber, taskController.signal, (_message, progress) => {
          if (!taskController.signal.aborted && run === generation.current) setStatus({ state: paused.current ? 'paused' : 'running', completed, total: pending.length, page: pageNumber, progress: Math.round(progress * 100), exhausted: false });
        }, selectedLanguage);
        if (taskController.signal.aborted) return;
        // An ink-free or unreadable page produces no record and never fails the run; the queue moves on.
        if (!text.trim()) continue;
        const record = await saveOcrPage(doc.id, pageNumber, text, selectedLanguage, hash);
        if (!isCurrent()) return;
        latest.current.onResult(record);
        completed++;
        setStatus({ state: paused.current ? 'paused' : 'running', completed, total: pending.length, progress: 100, exhausted: false, message: `Trang ${pageNumber}: ${Math.round(performance.now() - started)} ms` });
      }
      // An explicit run already walked every 12-page window of the whole document and processed every
      // candidate it found, so finishing it structurally means no work remains. A preload stop is a
      // single bounded window and must leave the remaining pages reachable through `OCR Next`.
      if (run === generation.current) setStatus({ state: 'done', completed, total: pending.length, progress: 100, exhausted: mode !== 'preload', message: `${completed}/${pending.length} trang đã OCR` });
    } catch (error) {
      if (!taskController.signal.aborted && run === generation.current) setStatus({ state: 'error', completed: 0, total: plannedTotal, progress: 0, exhausted: false, message: error instanceof DOMException && error.name === 'QuotaExceededError' ? 'Không đủ dung lượng để lưu kết quả OCR.' : error instanceof Error ? error.message : 'Không thể nhận dạng chữ. Hãy thử lại.' });
    } finally {
      if (controller.current === taskController) controller.current = null;
      await loadingTask?.destroy().catch(() => {});
      // cancel() owns worker termination. A late finally must not stop a newer run.
    }
  };
  const pause = () => { paused.current = true; setStatus(value => value ? { ...value, state: 'paused' } : value); };
  const continueQueue = () => { paused.current = false; resume.current?.(); resume.current = null; setStatus(value => value ? { ...value, state: 'running' } : value); };
  const clear = async () => { const doc = latest.current.documentRecord; if (!doc) return; cancel(); await clearOcrPages(doc.id); latest.current.onClear(); };
  return { status, startCurrent: (page: number) => start(page, 'current'), startNextUnprocessed: (fromPage = 1) => start(fromPage, 'next'), preloadFirstTwelve: () => start(0, 'preload'), pause, continueQueue, cancel, clear };
}
