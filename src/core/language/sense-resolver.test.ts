import { describe, expect, it } from 'vitest';
import { LexicalEngine } from './lexicon';
import { SenseResolver } from './sense-resolver';
import type { SentenceAnalysis } from './types';

const senses = [
  { id: 'zorp.manage', pos: 'verb', definitionEn: 'to manage an organization', meaningVi: 'điều hành', keywords: ['company'] },
  { id: 'zorp.race', pos: 'verb', definitionEn: 'to move quickly in a race', meaningVi: 'chạy', keywords: ['race'] }
];

function analysis(sentence: string): SentenceAnalysis {
  const lexical = new LexicalEngine();
  const tokens = lexical.tokenize(sentence);
  return { id: sentence, sourceText: sentence, normalizedText: sentence, sourceLang: 'en', tokens,
    lemmas: tokens.map(token => token.lemma), phrases: [], semanticHints: [], provider: 'test', createdAt: 0, lastUsedAt: 0, analysisVersion: 1 };
}

describe('sense evidence is independent from part-of-speech evidence', () => {
  it('uses same-POS semantic keywords when the sentence distinguishes the meanings', () => {
    const sentence = 'They zorp the company.';
    const result = new SenseResolver().resolve({ selection: 'zorp', lemma: 'zorp', sentence,
      sentenceAnalysis: analysis(sentence), selectionStart: sentence.indexOf('zorp'), pos: 'verb', candidateSenses: senses });
    expect(result.selectedSense?.id).toBe('zorp.manage');
    expect(result.contextMatch).toBe(true);
    expect(result.senseConfidence).toBeGreaterThan(result.posConfidence / 2);
  });

  it('does not confirm a meaning when only the shared part of speech is known', () => {
    const sentence = 'They zorp it.';
    const result = new SenseResolver().resolve({ selection: 'zorp', lemma: 'zorp', sentence,
      sentenceAnalysis: analysis(sentence), selectionStart: sentence.indexOf('zorp'), pos: 'verb', candidateSenses: senses });
    expect(result.contextMatch).toBe(false);
    expect(result.senseConfidence).toBeLessThan(result.posConfidence);
    expect(result.status).toBe('ambiguous');
  });

  it('treats overlapping definitions as one meaning group without claiming contextual evidence', () => {
    const sentence = 'They zorp it.';
    const related = [
      { id: 'one', pos: 'verb', definitionEn: 'make a strenuous effort to achieve something' },
      { id: 'two', pos: 'verb', definitionEn: 'exert strenuous effort to achieve a goal' }
    ];
    const result = new SenseResolver().resolve({ selection: 'zorp', lemma: 'zorp', sentence,
      sentenceAnalysis: analysis(sentence), selectionStart: sentence.indexOf('zorp'), pos: 'verb', candidateSenses: related });
    expect(result).toMatchObject({ status: 'common', contextMatch: false });
  });

  it('uses a saved whole-sentence translation only when it supports a linked dictionary meaning', () => {
    const sentence = 'They zorp it.';
    const base = { selection: 'zorp', lemma: 'zorp', sentence, sentenceAnalysis: analysis(sentence),
      selectionStart: sentence.indexOf('zorp'), pos: 'verb', candidateSenses: senses };
    const supported = new SenseResolver().resolve({ ...base, sentenceTranslationVi: 'Họ vẫn điều hành công ty.' });
    const uncertain = new SenseResolver().resolve({ ...base, sentenceTranslationVi: 'Họ vẫn làm việc ở đó.' });
    expect(supported).toMatchObject({ contextMatch: true, selectedSense: { id: 'zorp.manage' } });
    expect(supported.reasons.join(' ')).toContain('saved sentence translation');
    expect(uncertain.contextMatch).toBe(false);
  });
  it('leaves a translated gloss in another clause or a repeated selection unaligned', () => {
    const sentence = 'They zorp it, but she handles everything.';
    const result = new SenseResolver().resolve({ selection: 'zorp', lemma: 'zorp', sentence,
      sentenceAnalysis: analysis(sentence), selectionStart: sentence.indexOf('zorp'), pos: 'verb', candidateSenses: senses,
      sentenceTranslationVi: 'Họ làm việc đó, nhưng cô ấy điều hành công ty.' });
    expect(result.contextMatch).toBe(false);
    const repeated = 'They zorp it, then zorp that.';
    const repeatedResult = new SenseResolver().resolve({ selection: 'zorp', lemma: 'zorp', sentence: repeated,
      sentenceAnalysis: analysis(repeated), selectionStart: repeated.lastIndexOf('zorp'), pos: 'verb', candidateSenses: senses,
      sentenceTranslationVi: 'Họ điều hành việc đó, rồi làm việc kia.' });
    expect(repeatedResult.contextMatch).toBe(false);
  });
});
