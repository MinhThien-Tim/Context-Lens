import { describe, expect, it } from 'vitest';
import { compoundCandidates, normalizeSelection, reconstructToken } from '.';

describe('lookup normalization', () => {
  it('normalizes punctuation and whitespace while preserving the surface', () => {
    expect(normalizeSelection('  Make\u2011up  one\u2019s mind ')).toEqual({ surface: '  Make\u2011up  one\u2019s mind ', normalized: "make-up one's mind" });
  });
  it('splits glued compound segments only with lexical evidence', () => {
    const known = new Set(['lowest', 'common', 'denominator']);
    expect(compoundCandidates('lowest-commondenominator', value => known.has(value))).toContain('lowest common denominator');
  });
  it('repairs a fragment only from adjacent sentence text', () => {
    expect(reconstructToken('marizing', 'We are summarizing the result.', 10)?.token).toBe('summarizing');
    expect(reconstructToken('marizing', 'This marizing example is isolated.')).toBeUndefined();
  });
});
