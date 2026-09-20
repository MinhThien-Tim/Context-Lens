import { describe, expect, it } from 'vitest';
import { calculatePdfScale, pdfOffsetForPage, pdfPageForOffset } from './navigation';

describe('PDF navigation', () => {
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
});
