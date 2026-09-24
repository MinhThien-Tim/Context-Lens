import type { PDFPageProxy } from 'pdfjs-dist';
import type { DocumentRecord, PdfOcrRecord } from '../../db/database';
import type { OcrLanguage } from './ocrStore';

/** Preflight uses import metadata. A tiny render later excludes white scans. */
export function ocrCandidate(document: DocumentRecord, page: number, language: OcrLanguage, cached: PdfOcrRecord[], hash?: string): boolean {
  const model = document.pdfPages?.[page - 1];
  if (model && (model.extractionQuality !== 'poor' || model.hasImage === false)) return false;
  return !cached.some(item => item.page === page && item.language === language && (!hash || item.documentHash === hash));
}

export async function pageHasInk(page: PDFPageProxy, signal: AbortSignal): Promise<boolean> {
  const unit = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(1, 128 / Math.max(unit.width, unit.height)) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  try {
    const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!context) throw new Error('Không thể kiểm tra ảnh trang PDF trên thiết bị này.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    const render = page.render({ canvas, canvasContext: context, viewport });
    const abort = () => render.cancel();
    signal.addEventListener('abort', abort, { once: true });
    try { await render.promise; } finally { signal.removeEventListener('abort', abort); }
    if (signal.aborted) throw new DOMException('OCR cancelled', 'AbortError');
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (Math.min(pixels[index], pixels[index + 1], pixels[index + 2]) < 238) ink++;
    }
    return ink >= Math.max(4, Math.ceil(canvas.width * canvas.height * .002));
  } finally { canvas.width = 1; canvas.height = 1; }
}
