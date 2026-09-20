import { describe, expect, it } from 'vitest';
import { normalizeSelection, sentenceContextAt, sentenceContextForRange } from './context';

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
  it('keeps common titles and Latin abbreviations attached to their sentences', () => {
    const passage = 'Prof. Tran compared several cases, e.g. rural schools. The result held.';
    expect(sentenceContextAt(passage, passage.indexOf('rural')).current).toBe('Prof. Tran compared several cases, e.g. rural schools.');
    expect(sentenceContextAt(passage, passage.indexOf('result')).previous).toBe('Prof. Tran compared several cases, e.g. rural schools.');
  });
  it('handles Vietnamese and offsets at the end of a mobile selection', () => {
    const passage = 'Tôi đang đọc. Đây là điều kiện tiên quyết.';
    expect(sentenceContextAt(passage, passage.indexOf('điều kiện')).current).toBe('Đây là điều kiện tiên quyết.');
    expect(sentenceContextAt(passage, passage.length + 10).current).toBe('Đây là điều kiện tiên quyết.');
  });
  it('keeps every sentence covered by a multi-sentence selection and finds its paragraph', () => {
    const passage = 'Before. First selected sentence. Second selected sentence. After.\n\nA new paragraph.';
    const context = sentenceContextForRange(passage, passage.indexOf('First'), passage.indexOf('sentence. After'));
    expect(context.current).toBe('First selected sentence. Second selected sentence.');
    expect(context.previous).toBe('Before.'); expect(context.next).toBe('After.');
    expect(context.paragraph).toContain('Second selected sentence.');
  });
});

describe('phrase selection', () => {
  it('normalizes dragged selections without losing apostrophes', () => {
    expect(normalizeSelection('  made   up his own mind. ')).toBe('made up his own mind');
    expect(normalizeSelection(" one's ")).toBe("one's");
    expect(normalizeSelection(' accounts for 40% ')).toBe('accounts for 40%');
  });
});
