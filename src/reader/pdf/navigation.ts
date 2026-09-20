export type PdfZoomMode = 'fit-width' | 'fit-page' | 'custom';

export function pdfPageForOffset(pageOffsets: number[] | undefined, offset: number): number {
  if (!pageOffsets?.length) return 1;
  let low = 0, high = pageOffsets.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    if (pageOffsets[middle] <= offset) low = middle + 1;
    else high = middle - 1;
  }
  return Math.max(1, high + 1);
}

export function pdfOffsetForPage(pageOffsets: number[] | undefined, page: number): number {
  if (!pageOffsets?.length) return 0;
  return pageOffsets[Math.max(0, Math.min(pageOffsets.length - 1, page - 1))];
}

export function calculatePdfScale(mode: PdfZoomMode, customScale: number, containerWidth: number, containerHeight: number, pageWidth: number, pageHeight: number): number {
  if (mode === 'custom') return Math.min(3, Math.max(.5, customScale));
  const widthScale = Math.max(.1, (containerWidth - 32) / pageWidth);
  if (mode === 'fit-width') return widthScale;
  return Math.max(.1, Math.min(widthScale, (containerHeight - 32) / pageHeight));
}
