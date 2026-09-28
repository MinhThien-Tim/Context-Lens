import { expect, it } from 'vitest';
import { LexicalEngine } from './lexicon';
import { analyzeGrammar } from './grammar';
import { occurrenceConstruction, frameEvidence, patternEvidence } from './constructions';
const lexical = new LexicalEngine();
it.each(['apply', 'reply', 'rely', 'supply', 'comply', 'multiply'])('recognizes %s as a predicate despite -ly', word => {
 const entries = new LexicalEngine([{ lemma: word, pos: ['verb'], senses: [{ id: word, pos: 'verb', definitionEn: 'verb' }] }]);
 const sentence = `They ${word} now.`;
 const tokens = entries.tokenize(sentence);
 expect(analyzeGrammar(tokens, sentence).predicates.some(predicate => predicate.tokenIndex === 1)).toBe(true);
});
it('does not promote a known adverb between subject and predicate', () => {
 const entries = new LexicalEngine([
  { lemma: 'increasingly', pos: ['adverb'], senses: [{ id: 'adv', pos: 'adverb', definitionEn: 'more and more' }] },
  { lemma: 'rely', pos: ['verb'], senses: [{ id: 'verb', pos: 'verb', definitionEn: 'depend' }] }
 ]);
 const sentence = 'They increasingly rely on evidence.';
 const tokens = entries.tokenize(sentence);
 const predicates = analyzeGrammar(tokens, sentence).predicates;
 expect(predicates.some(predicate => predicate.tokenIndex === 1)).toBe(false);
 expect(predicates.some(predicate => predicate.tokenIndex === 2)).toBe(true);
});
it.each([
 ['He runs.', 'runs', 'simple', 'present', false],
 ['He is running.', 'running', 'progressive', 'present', false],
 ['He has run.', 'run', 'perfect', 'present', false],
 ['He had been running.', 'running', 'perfect-progressive', 'past', false],
 ['He will run.', 'run', 'simple', 'modal', false],
 ['He did not agree.', 'agree', 'simple', 'past', true],
 ['She never considered leaving.', 'considered', 'simple', 'past', true]
])('extracts chain for %s', (text, word, aspect, tense, negated) => {
 const tokens = lexical.tokenize(text);
 const predicate = analyzeGrammar(tokens, text).predicates.find(p => tokens[p.tokenIndex].normalized === word);
 expect(predicate).toMatchObject({ aspect, tense, negated });
});
it('keeps adjectival participles uncertain and explicit agents passive', () => {
 const text = 'The door was opened by the guard.';
 const tokens = lexical.tokenize(text);
 expect(analyzeGrammar(tokens, text).predicates.find(p => tokens[p.tokenIndex].normalized === 'opened')?.voice).toBe('passive');
 const tired = lexical.tokenize('He was tired.');
 expect(analyzeGrammar(tired, 'He was tired.').predicates.every(p => p.voice !== 'passive')).toBe(true);
});
it.each(['remember', 'stop', 'mean', 'consider'])('distinguishes %s complements', lemma => {
 for (const [tail, complement] of [['meeting her', 'gerund'], ['to leave', 'infinitive']]) {
 const tokens = lexical.tokenize(`I ${lemma} ${tail}.`);
 expect(occurrenceConstruction(tokens, 1).complement).toBe(complement);
 }
});
it('maps occurrences into bounded clauses without translation alignment', () => {
 const text = 'They run because he runs.';
 const tokens = lexical.tokenize(text), grammar = analyzeGrammar(tokens, text);
 expect(grammar.clauses).toHaveLength(2);
 expect(grammar.tokenClauses[1]).not.toBe(grammar.tokenClauses.at(-1));
});
it('separates particle and prepositional argument', () => {
 expect(occurrenceConstruction(lexical.tokenize('They take off.'), 1).particle).toBe('off');
 expect(occurrenceConstruction(lexical.tokenize('They look at the door.'), 1)).toMatchObject({ preposition: 'at', complement: 'prepositional', objectHead: 4 });
});

it('extracts argument candidates and modifier provenance', () => {
 const tokens = lexical.tokenize('They gave him a book.');
 const grammar = analyzeGrammar(tokens, 'They gave him a book.');
 expect(grammar.predicates.find(p => p.tokenIndex === 1)).toMatchObject({ subjectHead: 0, indirectObjectHead: 2, objectHead: 4, complement: 'double-object' });
 const modified = lexical.tokenize('They only considered leaving.');
 expect(analyzeGrammar(modified, 'They only considered leaving.').predicates.find(p => p.tokenIndex === 2)?.modifiers).toContainEqual({ tokenIndex: 1, kind: 'focus' });
});

it('reuses versioned sentence grammar and exposes diagnostic evidence', async () => {
 const { SentenceEngine, ANALYSIS_VERSION } = await import('./sentence-engine');
 const { SenseResolver } = await import('./sense-resolver');
 const engine = new SentenceEngine();
 const text = 'They did not run the company.';
 const first = await engine.analyze(text);
 const second = await engine.analyze(text);
 expect(first.analysis.analysisVersion).toBe(ANALYSIS_VERSION);
 expect(second.cached).toBe(true);
 expect(second.analysis.grammar).toEqual(first.analysis.grammar);
 const result = new SenseResolver().resolve({ selection: 'run', lemma: 'run', sentence: text, sentenceAnalysis: first.analysis,
 candidateSenses: ['a', 'b'].map(id => ({ id, pos: 'verb', definitionEn: id, verbFrames: [8] })) });
 expect(result.contextMatch).toBe(false);
 expect(result.reasons.join(' ')).toContain('negated true');
});

it('separates incomplete frames from controlled structural contradictions', () => {
 const features = occurrenceConstruction(lexical.tokenize('They consider to leave.'), 1);
 expect(frameEvidence(features, [])).toBe('UNKNOWN');
 expect(frameEvidence(features, [28])).toBe('MATCH');
 expect(frameEvidence(features, [26])).toBe('SOFT_CONFLICT');
 expect(patternEvidence({ complement: 'clause' }, { complement: 'infinitive' })).toBe('HARD_CONFLICT');
});
