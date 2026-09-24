import { describe, expect, it } from 'vitest';
import { eraseHighlights, upsertHighlight } from './highlights';

describe('reading highlights', () => {
  it('keeps OCR annotations separate from PDF text and other OCR pages', () => {
    const pdf = { id: 'pdf', startOffset: 0, endOffset: 5, color: 'yellow' as const, createdAt: 1 };
    const ocr = { ...pdf, id: 'ocr', ocrPage: 2, ocrLanguage: 'eng' as const };
    const saved = upsertHighlight([pdf], ocr);
    expect(saved).toHaveLength(2);
    expect(eraseHighlights(saved, 0, 5, 2, 'eng')).toEqual([pdf]);
    expect(eraseHighlights(saved, 0, 5, 3, 'eng')).toEqual(saved);
  });
  it('keeps every distinct highlight when selections are saved in sequence', () => {
    const first = { id: 'one', startOffset: 1, endOffset: 4, color: 'yellow' as const, createdAt: 1 };
    const second = { id: 'two', startOffset: 8, endOffset: 12, color: 'blue' as const, createdAt: 2 };
    const third = { id: 'three', startOffset: 20, endOffset: 25, color: 'pink' as const, createdAt: 3 };
    expect(upsertHighlight(upsertHighlight(upsertHighlight([], first), second), third)).toEqual([first, second, third]);
  });

  it('changes the color of an existing range without removing other highlights', () => {
    const first = { id: 'one', startOffset: 1, endOffset: 4, color: 'yellow' as const, createdAt: 1 };
    const second = { id: 'two', startOffset: 8, endOffset: 12, color: 'blue' as const, createdAt: 2 };
    const updated = upsertHighlight([first, second], { ...first, id: 'replacement', color: 'pink' });
    expect(updated).toHaveLength(2);
    expect(updated[0]).toMatchObject({ id: 'one', color: 'pink' });
    expect(updated[1]).toEqual(second);
  });

  it('erases only annotations intersecting the selected range', () => {
    const first = { id: 'one', startOffset: 1, endOffset: 4, color: 'yellow' as const, createdAt: 1 };
    const second = { id: 'two', startOffset: 8, endOffset: 12, color: 'blue' as const, style: 'underline' as const, createdAt: 2 };
    const third = { id: 'three', startOffset: 20, endOffset: 25, color: 'pink' as const, createdAt: 3 };
    expect(eraseHighlights([first, second, third], 9, 10)).toEqual([first, third]);
  });
});
