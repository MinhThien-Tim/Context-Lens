import { describe, expect, it } from 'vitest';
import { calculatePdfScale, pdfOffsetForPage, pdfPageForOffset, stepPdfScale } from './navigation';

describe('PDF navigation', () => {
  it('steps from the displayed fit scale on narrow phones', () => {
    const fitted = calculatePdfScale('fit-width', 1, 320, 700, 612, 792);
    expect(stepPdfScale(fitted, -1)).toBeLessThan(fitted);
    expect(stepPdfScale(fitted, 1)).toBeCloseTo(fitted + .15);
    expect(calculatePdfScale('custom', stepPdfScale(fitted, -1), 320, 700, 612, 792)).toBeLessThan(fitted);
  });
  it('maps pages and text offsets in both directions, including blank pages', () => {
    const offsets = [0, 12, 12, 40];
    expect(pdfOffsetForPage(offsets, 3)).toBe(12);
    expect(pdfPageForOffset(offsets, 11)).toBe(1);
    expect(pdfPageForOffset(offsets, 12)).toBe(3);
    expect(pdfPageForOffset(offsets, 99)).toBe(4);
  });

  it('calculates bounded custom, fit-width and fit-page scales', () => {
    expect(calculatePdfScale('fit-width', 1, 632, 900, 600, 800)).toBe(1);
    expect(calculatePdfScale('fit-page', 1, 1000, 432, 600, 800)).toBe(.5);
    expect(calculatePdfScale('custom', 9, 1000, 1000, 600, 800)).toBe(3);
  });
  it('uses a 932px natural desktop page with gutters and preserves explicit modes', () => {
    const width = (mode: Parameters<typeof calculatePdfScale>[0], containerWidth: number, containerHeight = 900) =>
      612 * calculatePdfScale(mode, 1.25, containerWidth, containerHeight, 612, 792);
    expect(width('natural', 1728)).toBe(932);
    expect(width('natural', 1366)).toBe(932);
    expect(width('natural', 1024)).toBe(932);
    expect(width('natural', 800)).toBe(736);
    expect(width('fit-width', 1366)).toBeCloseTo(1334);
    expect(width('fit-page', 1366, 700)).toBeCloseTo(612 * 668 / 792);
    expect(width('custom', 1366)).toBe(765);
  });
});
