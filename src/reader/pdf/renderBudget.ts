export const MAX_CANVAS_PIXELS = 2_000_000;
export const MAX_CANVAS_EDGE = 4096;
export function canvasBackingSize(width: number, height: number, dpr: number) {
  const ratio = Math.min(Math.max(1, dpr), 2, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)), MAX_CANVAS_EDGE / width, MAX_CANVAS_EDGE / height);
  return { ratio, width: Math.max(1, Math.floor(width * ratio)), height: Math.max(1, Math.floor(height * ratio)) };
}
