import { describe, expect, it } from 'vitest';
import { clampProgress, getRestoreScrollY, getScrollProgress } from './location';

describe('text document location', () => {
  it('calculates and clamps reading progress', () => {
    expect(getScrollProgress(500, 2000, 1000)).toBe(0.5);
    expect(getScrollProgress(4000, 2000, 1000)).toBe(1);
    expect(clampProgress(Number.NaN)).toBe(0);
  });
  it('uses proportional restoration after a major layout change', () => {
    const location = { kind: 'text' as const, scrollY: 500, progress: 0.5, updatedAt: 1 };
    expect(getRestoreScrollY(location, 5000, 1000)).toBe(2000);
  });
});
