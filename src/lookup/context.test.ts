import { describe, expect, it } from 'vitest';
import { normalizeSelection, sentenceContextAt } from './context';

describe('sentence extraction', () => {
  const text = 'The decision surprised voters. The government struggled to maintain public confidence. Several ministers responded.';
  it('returns current sentence and one neighbor each side', () => {
    const context = sentenceContextAt(text, text.indexOf('maintain'));
    expect(context.current).toBe('The government struggled to maintain public confidence.');
    expect(context.previous).toBe('The decision surprised voters.');
    expect(context.next).toBe('Several ministers responded.');
  });
  it('handles first and last sentence boundaries', () => {
    expect(sentenceContextAt(text, 2).previous).toBeNull();
    expect(sentenceContextAt(text, text.length - 2).next).toBeNull();
  });
  it('keeps abbreviations, quotations and academic sentences intact', () => {
    const passage = 'Dr. Nguyen said, “Training is a prerequisite.” It was precisely this institutional ambiguity that enabled the arrangement to persist.';
    expect(sentenceContextAt(passage, passage.indexOf('Training')).current).toBe('Dr. Nguyen said, “Training is a prerequisite.”');
    expect(sentenceContextAt(passage, passage.indexOf('ambiguity')).current).toContain('It was precisely');
  });
  it('handles Vietnamese and offsets at the end of a mobile selection', () => {
    const passage = 'Tôi đang đọc. Đây là điều kiện tiên quyết.';
    expect(sentenceContextAt(passage, passage.indexOf('điều kiện')).current).toBe('Đây là điều kiện tiên quyết.');
    expect(sentenceContextAt(passage, passage.length + 10).current).toBe('Đây là điều kiện tiên quyết.');
  });
});

describe('phrase selection', () => {
  it('normalizes dragged selections without losing apostrophes', () => {
    expect(normalizeSelection('  made   up his own mind. ')).toBe('made up his own mind');
    expect(normalizeSelection(" one's ")).toBe("one's");
  });
});
