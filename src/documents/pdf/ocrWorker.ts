import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type { Worker as TesseractWorker } from 'tesseract.js';
import { OCR_RENDER_PIXELS, type OcrLanguage } from './ocrStore';

let workerPromise: Promise<TesseractWorker> | null = null;
let terminating: Promise<unknown> = Promise.resolve();
let progressListener: ((status: string, progress: number) => void) | null = null;
let busy = false;
let workerLanguage: OcrLanguage | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

export async function terminateOcrWorker(): Promise<void> {
  clearTimeout(idleTimer);
  const old = workerPromise;
  workerPromise = null;
  workerLanguage = null;
  if (old) terminating = old.then(worker => worker.terminate()).catch(() => {});
  await terminating;
}

function scheduleIdleTermination(): void {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (!busy) void terminateOcrWorker(); }, 60_000);
}

async function getWorker(language: OcrLanguage): Promise<TesseractWorker> {
  clearTimeout(idleTimer);
  await terminating;
  if (workerPromise && workerLanguage !== language) {
    const previous = workerPromise;
    workerPromise = null;
    workerLanguage = null;
    await previous.then(worker => worker.terminate()).catch(() => {});
  }
  if (!workerPromise) {
    workerLanguage = language;
    const assetPath = new URL(`${import.meta.env.BASE_URL}ocr/`, location.origin).href;
    workerPromise = import('tesseract.js').then(({ createWorker }) => createWorker(language.split('+'), undefined, {
      logger: message => progressListener?.(message.status, message.progress),
      workerPath: `${assetPath}worker.min.js`, corePath: assetPath, langPath: assetPath, workerBlobURL: false,
    })).catch(error => { workerPromise = null; workerLanguage = null; throw error; });
  }
  return workerPromise;
}

function abortError(): DOMException { return new DOMException('OCR cancelled', 'AbortError'); }

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const abort = () => reject(abortError());
    signal.addEventListener('abort', abort, { once: true });
    void promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export async function recognizePdfPage(pdf: PDFDocumentProxy, pageNumber: number, signal: AbortSignal, onProgress: (status: string, progress: number) => void, language: OcrLanguage = 'eng'): Promise<string> {
  if (busy) throw new Error('Another page is being recognized.');
  if (signal.aborted) throw abortError();
  busy = true;
  let canvas: HTMLCanvasElement | undefined;
  let renderTask: RenderTask | undefined;
  const cancel = () => {
    renderTask?.cancel();
    const old = workerPromise;
    workerPromise = null;
    workerLanguage = null;
    if (old) terminating = old.then(worker => worker.terminate()).catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
  progressListener = onProgress;
  try {
    onProgress('Rendering PDF page', 0);
    const page = await abortable(pdf.getPage(pageNumber), signal);
    try {
      if (signal.aborted) throw abortError();
      const unit = page.getViewport({ scale: 1 });
      const scale = Math.min(2.5, Math.sqrt(OCR_RENDER_PIXELS / (unit.width * unit.height)), 4096 / unit.width, 4096 / unit.height);
      const viewport = page.getViewport({ scale });
      canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Thiết bị không đủ bộ nhớ để tạo ảnh OCR. Hãy đóng bớt ứng dụng rồi thử lại.');
      renderTask = page.render({ canvas, canvasContext: context, viewport });
      await abortable(renderTask.promise, signal);
      if (signal.aborted) throw abortError();
      onProgress('Loading OCR language data', 0);
      const worker = await abortable(getWorker(language), signal);
      if (signal.aborted) throw abortError();
      const result = await abortable(worker.recognize(canvas), signal);
      if (signal.aborted) throw abortError();
      return result.data.text.trim();
    } finally { page.cleanup(); }
  } finally {
    signal.removeEventListener('abort', cancel);
    progressListener = null;
    if (canvas) { canvas.width = 1; canvas.height = 1; }
    busy = false;
    scheduleIdleTermination();
  }
}
