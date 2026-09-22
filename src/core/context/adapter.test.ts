import { describe, expect, it } from 'vitest';
import { applyExplanation, explanationFromLookup } from './adapter';
import { validLookup } from '../../test/fixtures';

describe('Quick/Explain data contract', () => {
  it('keeps English, Vietnamese and local grammar in their own fields', () => {
    const base = { ...validLookup, quick: { ...validLookup.quick, definition_en: 'to keep', meaning_vi: ['duy trì'] } };
    const explanation = explanationFromLookup(base);
    expect(explanation).toMatchObject({ definitionEn: 'to keep', meaningVi: 'duy trì' });
    const result = applyExplanation(base, { meaningVi: 'giữ vững', whyHere: 'This sense fits the object.', confidence: 0.9 }, 'offline');
    expect(result.quick.definition_en).toBe('to keep');
    expect(result.quick.meaning_vi).toEqual(['giữ vững']);
    expect(result.deep.grammar).toEqual(base.deep.grammar);
    expect(result.deep.sentence_analysis.translation_vi).toBe(base.deep.sentence_analysis.translation_vi);
  });
});
