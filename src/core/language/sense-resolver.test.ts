import { describe, expect, it } from 'vitest';
import { LexicalEngine } from './lexicon';
import { SenseResolver } from './sense-resolver';
import { analyzeGrammar } from './grammar';
import type { SentenceAnalysis } from './types';
import { senseVietnameseMeanings } from './sense-meanings';

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
  it('keeps incompatible senses visible without selecting them', () => {
    const sentence = 'They zorp it.';
    const parsed = analysis(sentence);
    parsed.grammar = analyzeGrammar(parsed.tokens, sentence);
    const result = new SenseResolver().resolve({ selection: 'zorp', lemma: 'zorp', sentence,
      sentenceAnalysis: parsed, selectionStart: sentence.indexOf('zorp'), candidateSenses: [
        { id: 'conflict', pos: 'verb', definitionEn: 'take an infinitive', grammarPatterns: [{ complement: 'infinitive' }] },
        { id: 'compatible', pos: 'verb', definitionEn: 'act on an object' }
      ] });
    expect(result.selectedSense?.id).toBe('compatible');
    expect(result.alternatives.map(sense => sense.id)).toContain('conflict');
  });

  it('keeps distinct POS groups ambiguous without occurrence POS', () => {
    const result = new SenseResolver().resolve({ selection: 'zorp', lemma: 'zorp', sentence: 'Zorp.',
      candidateSenses: [{ id: 'noun', pos: 'noun', definitionEn: 'a physical object' },
        { id: 'verb', pos: 'verb', definitionEn: 'perform an action' }] });
    expect(result).toMatchObject({ status: 'ambiguous', contextMatch: false });
  });

  it('merges Vietnamese gloss fields without duplicates', () => {
    expect(senseVietnameseMeanings({ meaningVi: 'chạy / đi', meaningsVi: ['chạy', '  ĐI  ', 'giữ'] }))
      .toEqual(['chạy', 'ĐI', 'giữ']);
  });
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

  it('keeps translation-only evidence below the Context gate', () => {
    const sentence = 'They zorp it.';
    const base = { selection: 'zorp', lemma: 'zorp', sentence, sentenceAnalysis: analysis(sentence),
      selectionStart: sentence.indexOf('zorp'), pos: 'verb', candidateSenses: senses };
    const supported = new SenseResolver().resolve({ ...base, sentenceTranslationVi: 'Họ vẫn điều hành công ty.' });
    const uncertain = new SenseResolver().resolve({ ...base, sentenceTranslationVi: 'Họ vẫn làm việc ở đó.' });
    expect(supported).toMatchObject({ contextMatch: false, status: 'ambiguous' });
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

describe('grammar bounds cached translation evidence', () => {
  it.each([
    ['They zorp it.', 'Họ điều hành nó.', 5, true],
    ['They zorp it and she leaves.', 'Họ điều hành nó và cô ấy đi.', 5, false],
    ['They zorp it.', 'Họ điều hành nó; cô ấy đi.', 5, false],
    ['They zorp it, then zorp that.', 'Họ điều hành nó rồi làm việc kia.', 19, false],
    ['They zorp it, then zorp that.', 'Họ điều hành nó rồi làm việc kia.', undefined, false],
    ['They zorp it.', 'Họ điều hành nó.', 0, false]
  ])('uses safe strength for %s / %s at %s', (sentence, translation, offset, strong) => {
    const parsed = analysis(sentence);
    parsed.grammar = analyzeGrammar(parsed.tokens, sentence);
    const result = new SenseResolver().resolve({ selection: 'zorp', lemma: 'zorp', sentence, sentenceAnalysis: parsed,
      selectionStart: offset, candidateSenses: senses.map(sense => ({ ...sense, keywords: [] })), sentenceTranslationVi: translation });
    expect(result.contextMatch).toBe(false);
    const diagnostic = result.diagnostics!.find(item => item.senseId === 'zorp.manage')!;
    const translationReason = diagnostic.reasons.find(reason => reason.includes('saved sentence translation'));
    if (strong) expect(translationReason).toContain('Linked dictionary');
    else if (translationReason) expect(translationReason).toContain('Weak whole-sentence');
    if (offset === 0 || offset === undefined) expect(translationReason).toBeUndefined();
  });
  it('does not use a shared Vietnamese gloss to distinguish English senses', () => {
    const sentence = 'They zorp it.';
    const parsed = analysis(sentence); parsed.grammar = analyzeGrammar(parsed.tokens, sentence);
    const result = new SenseResolver().resolve({ selection: 'zorp', lemma: 'zorp', sentence, sentenceAnalysis: parsed,
      sentenceTranslationVi: 'Họ điều hành nó.', candidateSenses: senses.map(sense => ({ ...sense, keywords: [], meaningVi: 'điều hành' })) });
    expect(result.contextMatch).toBe(false);
    expect(result.diagnostics!.every(item => !item.reasons.some(reason => reason.includes('translation')))).toBe(true);
  });
});


describe('context ranking remains conservative', () => {
  it('rejects contrast evidence for an imperative verb and retains diagnostics', () => {
    const sentence = 'Turn the page.';
    const result = new SenseResolver().resolve({ selection: 'Turn', lemma: 'turn', sentence,
      sentenceAnalysis: analysis(sentence), candidateSenses: [
        { id: 'contrast', pos: 'verb', definitionEn: 'change to the contrary' },
        { id: 'rotate', pos: 'verb', definitionEn: 'move around an axis' }
      ] });
    expect(result.contextMatch).toBe(false);
    expect(result.reasons.join(' ')).toContain('Occurrence POS: verb');
    expect(result.diagnostics).toHaveLength(2);
  });
  it('accepts a detached concessive adverb', () => {
    const sentence = 'Still, we continued.';
    const result = new SenseResolver().resolve({ selection: 'Still', lemma: 'still', sentence,
      sentenceAnalysis: analysis(sentence), candidateSenses: [
        { id: 'contrast', pos: 'adverb', definitionEn: 'despite that; nevertheless' },
        { id: 'quiet', pos: 'adjective', definitionEn: 'without moving' }
      ] });
    expect(result).toMatchObject({ contextMatch: true, selectedSense: { id: 'contrast' } });
  });
  it.each([
    ['Think', 'Think about the consequences.', 'verb'],
    ['Think', 'Think twice before answering.', 'verb'],
    ['mean', 'What does this word mean?', 'verb'],
    ['plane', 'The plane landed at the airport.', 'noun']
  ])('keeps occurrence POS safe for %s in %s', (selection, sentence, pos) => {
    const lexical = new LexicalEngine([{ lemma: 'land', forms: ['landed'], pos: ['noun', 'verb'], senses: [] }]);
    const result = new SenseResolver(lexical).resolve({ selection, lemma: selection.toLowerCase(), sentence,
      sentenceAnalysis: analysis(sentence), candidateSenses: ['adjective', 'noun', 'verb'].map(pos => ({ id: pos, pos, definitionEn: 'undistinguished meaning' })) });
    expect(result.selectedSense?.pos).toBe(pos);
    expect(result.contextMatch).toBe(false);
  });
  it('recognizes an adverb between a subject and a predicate with multiple parts of speech', () => {
    const lexical = new LexicalEngine([{ lemma: 'question', pos: ['noun', 'verb'],
      senses: [{ id: 'question.verb', pos: 'verb', definitionEn: 'ask about something' }] }]);
    const sentence = 'You still question these beliefs.';
    const result = new SenseResolver(lexical).resolve({ selection: 'still', lemma: 'still', sentence,
      sentenceAnalysis: analysis(sentence), candidateSenses: [
        { id: 'verb', pos: 'verb', definitionEn: 'make quiet' },
        { id: 'adverb', pos: 'adverb', definitionEn: 'continuing up to this time without interruption' }
      ] });
    expect(result.selectedSense?.id).toBe('adverb');
    expect(result.contextMatch).toBe(true);
  });
  it.each([
    ['record', 'They record every meeting.', 'verb'],
    ['record', 'She broke the record.', 'noun'],
    ['present', 'a present problem', 'adjective'],
    ['present', 'present the results', 'verb'],
    ['present', 'the present', 'noun'],
    ['object', 'They object to it.', 'verb'],
    ['close', 'They close the door.', 'verb'],
    ['left', 'the left', 'noun'],
    ['found', 'They found a company.', 'verb']
  ])('narrows %s POS in %s without claiming a sense', (selection, sentence, pos) => {
    const candidateSenses = ['noun', 'adjective', 'verb'].map(pos => ({ id: pos, pos, definitionEn: 'a meaning without distinguishing evidence' }));
    const sentenceAnalysis = analysis(sentence);
    if (sentence.endsWith('problem')) sentenceAnalysis.tokens.at(-1)!.pos = 'noun';
    const result = new SenseResolver().resolve({ selection, lemma: selection, sentence, sentenceAnalysis, candidateSenses });
    expect(result.selectedSense?.pos).toBe(pos);
    expect(result.contextMatch).toBe(false);
    expect(result.alternatives).toHaveLength(2);
  });
  it.each([
    ['smart', 'We need smart decisions.', 'judgment'],
    ['smarter', 'We need smarter decisions.', 'judgment'],
    ['represent', 'They represent the company.', 'company'],
    ['represented', 'They represented the company.', 'company']
  ])('ranks a strong collocation for %s', (selection, sentence, keyword) => {
    const pos = selection.startsWith('smart') ? 'adjective' : 'verb';
    const candidateSenses = [
      { id: 'default', pos, definitionEn: 'another dictionary meaning' },
      { id: keyword, pos, definitionEn: 'the relevant dictionary meaning', collocations: [sentence] }
    ];
    const result = new SenseResolver().resolve({ selection, lemma: selection, sentence, sentenceAnalysis: analysis(sentence), candidateSenses });
    expect(result.selectedSense?.id).toBe(keyword);
    expect(result.contextMatch).toBe(true);
  });
  it('keeps default order when both senses share the strong evidence', () => {
    const result = new SenseResolver().resolve({ selection: 'smart', lemma: 'smart', sentence: 'smart decisions',
      candidateSenses: [{ id: 'first', definitionEn: 'one', collocations: ['smart decisions'] }, { id: 'second', definitionEn: 'two', collocations: ['smart decisions'] }] });
    expect(result.selectedSense?.id).toBe('first');
    expect(result.contextMatch).toBe(false);
  });
});

it('blocks dependent translated-definition evidence from self-confirming a sense', () => {
  const sentence = 'They zorp the company.';
  const candidateSenses = senses.map(sense => ({ ...sense, keywords: [], alignment: {
    kind: 'translated-definition' as const, confidence: 'low' as const, evidence: ['provider'], dependsOnSenseId: sense.id
  } }));
  const result = new SenseResolver().resolve({ selection: 'zorp', lemma: 'zorp', sentence,
    sentenceAnalysis: analysis(sentence), sentenceTranslationVi: 'H? ?i?u h?nh c?ng ty.', candidateSenses });
  expect(result.contextMatch).toBe(false);
  expect(result.diagnostics?.every(candidate => !candidate.reasons.some(reason => reason.includes('translation')))).toBe(true);
});

it('keeps shared construction evidence out of semantic ranking', () => {
  const sentence = 'They zorp to leave.';
  const result = new SenseResolver().resolve({ selection: 'zorp', lemma: 'zorp', sentence, sentenceAnalysis: analysis(sentence), pos: 'verb',
    candidateSenses: ['a', 'b', 'c'].map(id => ({ id, pos: 'verb', definitionEn: 'try attempting', verbFrames: [28], examples: ['They zorp to arrive.'] })) });
  expect(result.contextMatch).toBe(false);
  expect(result.diagnostics?.every(item => item.semanticScore === 0)).toBe(true);
});

it('uses unique construction evidence without penalizing incomplete frames', () => {
  const sentence = 'They zorp to leave.';
  const result = new SenseResolver().resolve({ selection: 'zorp', lemma: 'zorp', sentence, sentenceAnalysis: analysis(sentence), pos: 'verb',
    candidateSenses: [{ id: 'effort', pos: 'verb', definitionEn: 'try attempting', verbFrames: [1] }, { id: 'other', pos: 'verb', definitionEn: 'move quickly', verbFrames: [28] }] });
  expect(result.contextMatch).toBe(true);
  expect(result.selectedSense?.id).toBe('effort');
  expect(result.reasons.join(' ')).toContain('SOFT_CONFLICT');
});

it('rejects explicit complement contradictions before ranking but keeps dictionary alternatives', () => {
  const sentence = 'They zorp to leave.';
  const result = new SenseResolver().resolve({ selection: 'zorp', lemma: 'zorp', sentence, sentenceAnalysis: analysis(sentence), pos: 'verb',
    candidateSenses: [{ id: 'impossible', pos: 'verb', definitionEn: 'try attempting', grammarPatterns: [{ complement: 'gerund' }], keywords: ['leave'] },
      { id: 'possible', pos: 'verb', definitionEn: 'try attempting', grammarPatterns: [{ complement: 'infinitive' }], keywords: ['leave'] }] });
  expect(result.contextMatch).toBe(true);
  expect(result.selectedSense?.id).toBe('possible');
  expect(result.alternatives.map(sense => sense.id)).toContain('impossible');
});
