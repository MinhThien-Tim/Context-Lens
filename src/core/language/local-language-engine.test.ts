import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContextLensDatabase } from '../../db/database';
import { LocalLanguageEngine } from './local-language-engine';
import { LexicalEngine } from './lexicon';
import { PhraseDetector, PhraseNormalizer } from './phrases';
import { buildSentenceIndex, ContextWindowBuilder, SentenceAnalysisCache, SentenceEngine } from './sentence-engine';
import type { SelectionInput } from './types';
import { dictionaryRegistry } from '../../lookup/dictionary/registry';

const databases: ContextLensDatabase[] = [];
function setup() {
  const database = new ContextLensDatabase(`language-test-${crypto.randomUUID()}`);
  databases.push(database);
  const lexical = new LexicalEngine();
  const phrases = new PhraseDetector(undefined, lexical);
  const cache = new SentenceAnalysisCache(database, 2);
  const sentences = new SentenceEngine(lexical, phrases, cache);
  return { database, lexical, cache, sentences, engine: new LocalLanguageEngine(lexical, phrases, sentences) };
}
function input(selectedText: string, sentence = selectedText): SelectionInput { return { selectedText, sentence, sourceLang: 'en', targetLang: 'vi' }; }
afterEach(async () => { await Promise.all(databases.splice(0).map(database => database.delete())); });

describe('local language foundation', () => {
  it('returns shared EN/VI results offline, including inflection and unknown words', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const { engine } = setup();
    const result = await engine.analyzeSelection(input('prerequisite'));
    expect(result.english?.definition).toContain('required');
    expect(result.vietnamese?.meaning).toContain('tiên quyết');
    expect((await engine.analyzeSelection(input('constrained'))).selection.lemma).toBe('constrain');
    expect((await engine.analyzeSelection(input('running'))).selection.lemma).toBe('run');
    expect((await engine.analyzeSelection(input('better'))).selection.lemma).toBe('good');
    expect((await engine.analyzeSelection(input('xyzzy'))).confidence).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    ['accounts for', 'The sector accounts for 45% of total employment.', 'account-for.proportion', 'chiếm'],
    ['account for', 'Several factors account for the decline.', 'account-for.explain', 'giải thích'],
    ['accounted for', 'The rapid expansion of credit accounted for much of the increase in asset prices.', 'account-for.explain', 'nguyên nhân']
  ])('resolves %s in its containing sentence', async (selection, sentence, sense, meaning) => {
    const { engine } = setup();
    const result = await engine.analyzeSelection(input(selection, sentence));
    expect(result.sense?.id).toBe(sense);
    expect(result.vietnamese?.meaning).toContain(meaning);
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });
  it('normalizes inflected and possessive idioms with longest matches', () => {
    const normalizer = new PhraseNormalizer();
    for (const text of ['made up her mind', 'makes up his mind', 'making up my mind', 'make up his own mind']) expect(normalizer.normalize(text)).toBe("make up one's mind");
    for (const text of ['accounted for', 'accounts for', 'accounting for']) expect(normalizer.normalize(text)).toBe('account for');
    expect(new PhraseDetector().detect('She made up her own mind.')[0].canonical).toBe("make up one's mind");
    expect(new PhraseDetector().detect('They account. For this reason.')).toEqual([]);
  });
  it('expands only the selected occurrence into a containing phrase', async () => {
    const { engine } = setup();
    expect((await engine.analyzeSelection(input('constraints', 'We face institutional constraints.'))).phrase?.canonical).toBe('institutional constraints');
    const sentence = 'Her mind wandered before she made up her mind.';
    expect((await engine.analyzeSelection({ ...input('mind', sentence), selectionStart: 4 })).phrase).toBeUndefined();
    expect((await engine.analyzeSelection({ ...input('mind', sentence), selectionStart: sentence.lastIndexOf('mind') })).phrase?.canonical).toBe("make up one's mind");
  });
  it('reuses one analysis across selections, target modes, concurrent calls, and cache instances', async () => {
    const { engine, database, cache } = setup();
    const put = vi.spyOn(cache, 'put');
    const sentence = 'The sector accounts for 45% of total employment.';
    await Promise.all(['sector', 'accounts for', 'employment'].map(word => engine.analyzeSelection(input(word, sentence))));
    expect(put).toHaveBeenCalledTimes(1);
    expect((await engine.analyzeSelection({ ...input('accounts for', sentence), targetLang: 'en' })).cached).toBe(true);
    const fresh = new SentenceEngine(undefined, undefined, new SentenceAnalysisCache(database));
    const reused = await fresh.analyze(sentence);
    expect(reused.cached).toBe(true);
    reused.analysis.tokens.length = 0;
    expect((await fresh.analyze(sentence)).analysis.tokens.length).toBeGreaterThan(0);
    expect(await database.sentenceAnalyses.count()).toBe(1);
  });
  it('bounds persistent cache and tolerates unavailable persistence', async () => {
    const { sentences, cache, database } = setup();
    await sentences.analyze('One.'); await sentences.analyze('Two.'); await sentences.analyze('Three.');
    await cache.cleanup();
    expect(await database.sentenceAnalyses.count()).toBeLessThanOrEqual(2);
    vi.spyOn(database.sentenceAnalyses, 'get').mockRejectedValue(new Error('storage unavailable'));
    vi.spyOn(database.sentenceAnalyses, 'put').mockRejectedValue(new Error('quota'));
    expect((await sentences.analyze('Still useful offline.')).analysis.tokens).not.toHaveLength(0);
  });
  it('segments without translation and identifies missing discourse context', () => {
    expect(buildSentenceIndex('Dr. Smith left. This was enough.')).toHaveLength(2);
    expect(new ContextWindowBuilder().build(input('This', 'This, however, was not enough.')).needsPreviousSentence).toBe(true);
  });
  it('provides a conservative local simplification without fabricating translation', async () => {
    const { engine } = setup();
    const result = await engine.analyzeSelection(input('notwithstanding', 'Notwithstanding the constraints, they continued.'));
    expect(result.context.simpleEnglish).toBe('Despite the constraints, they continued.');
    expect(result.context.sentenceTranslation).toBeUndefined();
  });
  it('invalidates sentence analyses when installed dictionary versions change', async () => {
    const { sentences } = setup();
    await sentences.analyze('A customword.');
    const unregister = dictionaryRegistry.register({ id: 'test-local', version: '2', lookup: surface => surface === 'customword' ? {
      surface, entry: { lemma: 'customword', partOfSpeech: 'noun', ipa: null, definitionEn: 'a custom entry', meaningsVi: ['mục từ'] }
    } : null });
    try {
      const result = await sentences.analyze('A customword.');
      expect(result.cached).toBe(false);
      expect(result.analysis.tokens[1].pos).toBe('noun');
    } finally { unregister(); }
  });
  it('measures warm sentence reuse without a brittle timing assertion', async () => {
    const { engine } = setup();
    const request = input('accounted for', 'Credit expansion accounted for the increase in asset prices.');
    await engine.analyzeSelection(request);
    const samples: number[] = [];
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      expect((await engine.analyzeSelection(request)).cached).toBe(true);
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    process.stderr.write(`[performance] local language warm n=100 p50=${samples[50].toFixed(3)} ms p95=${samples[95].toFixed(3)} ms\n`);
  });
  it('upgrades an existing v8 database without losing records', async () => {
    const name = `language-migration-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(8).stores({ settings: 'key' });
    await old.table('settings').put({ key: 'retained', value: true });
    old.close();
    const upgraded = new ContextLensDatabase(name); databases.push(upgraded);
    expect(await upgraded.settings.get('retained')).toEqual({ key: 'retained', value: true });
    expect(await upgraded.sentenceAnalyses.count()).toBe(0);
    expect(upgraded.verno).toBe(10);
  });
});
