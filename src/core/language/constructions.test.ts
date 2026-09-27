import { expect, it } from 'vitest';
import { LexicalEngine } from './lexicon';
import { occurrenceConstruction, frameCompatibility } from './constructions';
import { SenseResolver } from './sense-resolver';
import type { SentenceAnalysis } from './types';

it.each([
  ['I think that he will arrive.', 'think', 'clause'],
  ["I think he'll arrive tomorrow.", 'think', 'clause'],
  ['They think him foolish.', 'think', 'object-adjective'],
  ['I think him to be honest.', 'think', 'object-infinitive'],
  ['They make him happy.', 'make', 'object-adjective'],
  ['They take the train.', 'take', 'object'],
  ['They get him to work.', 'get', 'object-infinitive'],
  ['They hold the line.', 'hold', 'object'],
  ['They run the company.', 'run', 'object'],
  ['I need time to think.', 'think', 'none']
])('extracts %s independently of dictionary senses', (sentence, selection, complement) => {
  const tokens = new LexicalEngine().tokenize(sentence);
  const features = occurrenceConstruction(tokens, tokens.findIndex(token => token.normalized === selection));
  expect(features.complement).toBe(complement);
});

it('does not turn a shared generic verb frame into Context', () => {
  const sentence = 'They run the company.';
  const tokens = new LexicalEngine().tokenize(sentence);
  const sentenceAnalysis: SentenceAnalysis = { id: 'test', sourceText: sentence, normalizedText: sentence, sourceLang: 'en', tokens,
    lemmas: [], phrases: [], semanticHints: [], provider: 'local', createdAt: 0, lastUsedAt: 0, analysisVersion: 2 };
  expect(frameCompatibility(occurrenceConstruction(tokens, 1), [8])).toBe(1);
  expect(new SenseResolver().resolve({ selection: 'run', lemma: 'run', sentence, sentenceAnalysis,
    candidateSenses: ['first', 'second'].map(id => ({ id, pos: 'verb', definitionEn: id, verbFrames: [8] })) }).contextMatch).toBe(false);
});

it('matches a collocation only around the selected occurrence', () => {
  const sentence = 'They run the race, then run the company.';
  const tokens = new LexicalEngine().tokenize(sentence);
  const sentenceAnalysis: SentenceAnalysis = { id: 'test', sourceText: sentence, normalizedText: sentence, sourceLang: 'en', tokens,
    lemmas: [], phrases: [], semanticHints: [], provider: 'local', createdAt: 0, lastUsedAt: 0, analysisVersion: 2 };
  const result = new SenseResolver().resolve({ selection: 'run', lemma: 'run', sentence, sentenceAnalysis, selectionStart: sentence.lastIndexOf('run'),
    candidateSenses: [{ id: 'race', pos: 'verb', definitionEn: 'race', collocations: ['run the race'] }, { id: 'company', pos: 'verb', definitionEn: 'company', collocations: ['run the company'] }] });
  expect(result.selectedSense?.id).toBe('company');
});

it.each([['make', 'happy'], ['get', 'ready'], ['hold', 'responsible'], ['take', 'prisoner'], ['run', 'ragged']])('uses example constructions to distinguish %s without word-specific rules', (lemma, adjective) => {
  const sentence = `They ${lemma} him ${adjective}.`;
  const lexical = new LexicalEngine();
  const tokens = lexical.tokenize(sentence);
  const sentenceAnalysis: SentenceAnalysis = { id: 'test', sourceText: sentence, normalizedText: sentence, sourceLang: 'en', tokens,
    lemmas: [], phrases: [], semanticHints: [], provider: 'local', createdAt: 0, lastUsedAt: 0, analysisVersion: 2 };
  const result = new SenseResolver().resolve({ selection: lemma, lemma, sentence, sentenceAnalysis,
    candidateSenses: [{ id: 'other', pos: 'verb', definitionEn: 'another meaning', verbFrames: [2] },
      { id: 'complement', pos: 'verb', definitionEn: 'cause a condition', verbFrames: [9], examples: [`They ${lemma} her ${adjective}.`] }] });
  expect(result).toMatchObject({ contextMatch: true, selectedSense: { id: 'complement' } });
});
