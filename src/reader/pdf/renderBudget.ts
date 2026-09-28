// One visible page and two neighbors use at most 24M backing pixels in total.
export const MAX_CANVAS_PIXELS = 20_000_000;
export const NEIGHBOR_CANVAS_PIXELS = 2_000_000;
export const MAX_CANVAS_EDGE = 8192;
export function canvasBackingSize(width: number, height: number, dpr: number, pixelBudget = MAX_CANVAS_PIXELS) {
  const ratio = Math.min(Math.max(1, dpr), 2, Math.sqrt(pixelBudget / (width * height)), MAX_CANVAS_EDGE / width, MAX_CANVAS_EDGE / height);
  return { ratio, width: Math.max(1, Math.floor(width * ratio)), height: Math.max(1, Math.floor(height * ratio)) };
}
