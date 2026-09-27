import { expect, it } from 'vitest';
import { clampPopup, normalizePopupPlacement, pinPopup, popupBounds, restorePopup } from './lookupPopupPlacement';
it.each([undefined, null, {}, { mode: 'pinned', xRatio: NaN, yRatio: 0 }, { mode: 'pinned', xRatio: 2, yRatio: 0 }])('falls back to Auto for invalid preferences %j', value => {
  expect(normalizePopupPlacement(value)).toEqual({ mode: 'auto' });
});
it.each([1024, 1280, 1366, 1440])('clamps all edges and round trips relative placement at %s', width => {
  const bounds = popupBounds(width, 900, 340, 520);
  expect(clampPopup({ left: -1000, top: -1000 }, bounds)).toEqual({ left: 12, top: 72 });
  expect(clampPopup({ left: 9999, top: 9999 }, bounds)).toEqual({ left: width - 352, top: 368 });
  const point = { left: 200, top: 150 };
  const pinned = pinPopup(point, bounds);
  if (pinned.mode !== 'pinned') throw new Error('Expected pinned');
  expect(restorePopup(pinned, bounds)).toEqual(point);
  const smaller = popupBounds(1024, 650, 340, 520);
  expect(clampPopup(restorePopup(pinned, smaller), smaller)).toEqual(restorePopup(pinned, smaller));
});
it('keeps the header reachable when content exceeds available height', () => {
  const bounds = popupBounds(1024, 400, 340, 800, 80);
  expect(bounds.availableY).toBe(0);
  expect(pinPopup({ left: 100, top: 1000 }, bounds)).toMatchObject({ yRatio: 0 });
  expect(clampPopup({ left: 100, top: 1000 }, bounds).top).toBe(92);
});
