import { describe, expect, it } from 'vitest';
import { estimateComplexity } from './complexity-estimator';

describe('complexity estimator', () => {
  it('keeps exact common dictionary words simple', () => {
    expect(estimateComplexity('prerequisite', 'Training is a prerequisite.')).toMatchObject({ level: 'simple', reasons: expect.arrayContaining(['exact-dictionary-match']) });
  });
  it('recognizes a known collocation as locally resolvable', () => {
    expect(estimateComplexity('maintain public confidence', 'The policy may maintain public confidence.')).toMatchObject({ level: 'simple', reasons: expect.arrayContaining(['known-collocation']) });
  });
  it('marks abstract nested academic language complex with concrete reasons', () => {
    const result = estimateComplexity('institutional ambiguity', 'It was precisely this institutional ambiguity that enabled the arrangement, which officials had defended, to persist, whereas prior rules would have prevented it.');
    expect(result.level).toBe('complex');
    expect(result.reasons).toEqual(expect.arrayContaining(['abstract-language', 'nested-syntax']));
  });
  it('marks discourse function and unresolved polysemy for contextual help', () => {
    expect(estimateComplexity('while', 'While the proposal appears efficient, its consequences remain uncertain.').reasons).toContain('discourse-marker');
    expect(estimateComplexity('account for', 'Several factors account for the decline.').reasons).toContain('polysemous-expression');
  });
});
