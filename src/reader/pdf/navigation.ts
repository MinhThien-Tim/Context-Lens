export type PdfZoomMode = 'natural' | 'fit-width' | 'fit-page' | 'custom';

export function stepPdfScale(currentScale: number, direction: -1 | 1): number {
  return Math.min(3, Math.max(.1, currentScale + direction * .15));
}

/** docs/desktop-reader.md §3.1: snapping to `fitWidthScale * 1.25` happens only on the first step
 *  out of an automatic mode. In `custom` every step is the fixed symmetric factor `fitWidthScale * .25`,
 *  so stepping out and back in returns to the scale it started from. */
export function stepDesktopPdfScale(currentScale: number, fitWidthScale: number, direction: -1 | 1, mode: PdfZoomMode = 'custom'): number {
  const step = fitWidthScale * .25;
  const automatic = mode === 'natural' || mode === 'fit-width' || mode === 'fit-page';
  const next = direction === 1 && automatic && currentScale < fitWidthScale * 1.25
    ? fitWidthScale * 1.25
    : currentScale + direction * step;
  return Math.min(6, Math.max(.1, next));
}

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

export function calculatePdfScale(mode: PdfZoomMode, customScale: number, containerWidth: number, containerHeight: number, pageWidth: number, pageHeight: number, maxCustomScale = 3): number {
  if (mode === 'custom') return Math.min(maxCustomScale, Math.max(.1, customScale));
  const widthScale = Math.max(.1, (containerWidth - 32) / pageWidth);
  if (mode === 'fit-width') return widthScale;
  if (mode === 'natural') return Math.max(.1, Math.min(932, Math.max(1, containerWidth - 64)) / pageWidth);
  return Math.max(.1, Math.min(widthScale, (containerHeight - 32) / pageHeight));
}
