export type LookupPopupPlacement = { mode: 'auto' } | { mode: 'pinned'; xRatio: number; yRatio: number };
export const DESKTOP_QUICK_WIDTH = 440;
export type PopupPoint = { left: number; top: number };
export type PopupBounds = { minLeft: number; minTop: number; availableX: number; availableY: number };
const clamp = (value: number, max = 1) => Math.max(0, Math.min(max, value));
export function normalizePopupPlacement(value: unknown): LookupPopupPlacement {
  const placement = value as Partial<Extract<LookupPopupPlacement, { mode: 'pinned' }>> | null;
  return placement?.mode === 'pinned' && typeof placement.xRatio === 'number' && Number.isFinite(placement.xRatio)
    && typeof placement.yRatio === 'number' && Number.isFinite(placement.yRatio)
    && placement.xRatio >= 0 && placement.xRatio <= 1 && placement.yRatio >= 0 && placement.yRatio <= 1
    ? { mode: 'pinned', xRatio: placement.xRatio, yRatio: placement.yRatio } : { mode: 'auto' };
}
export function popupBounds(width: number, height: number, popupWidth: number, popupHeight: number, headerBottom = 56): PopupBounds {
  const minLeft = 12;
  const minTop = Math.min(Math.max(72, headerBottom + 12), Math.max(12, height - 12));
  return { minLeft, minTop, availableX: Math.max(0, width - popupWidth - 24), availableY: Math.max(0, height - popupHeight - minTop - 12) };
}
export function clampPopup(point: PopupPoint, bounds: PopupBounds): PopupPoint {
  return { left: bounds.minLeft + clamp(point.left - bounds.minLeft, bounds.availableX), top: bounds.minTop + clamp(point.top - bounds.minTop, bounds.availableY) };
}
export function restorePopup(placement: Extract<LookupPopupPlacement, { mode: 'pinned' }>, bounds: PopupBounds): PopupPoint {
  return { left: bounds.minLeft + clamp(placement.xRatio) * bounds.availableX, top: bounds.minTop + clamp(placement.yRatio) * bounds.availableY };
}
export function pinPopup(point: PopupPoint, bounds: PopupBounds): LookupPopupPlacement {
  const safe = clampPopup(point, bounds);
  return { mode: 'pinned', xRatio: bounds.availableX > 0 ? (safe.left - bounds.minLeft) / bounds.availableX : 0,
    yRatio: bounds.availableY > 0 ? (safe.top - bounds.minTop) / bounds.availableY : 0 };
}
