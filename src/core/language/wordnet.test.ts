import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { loadWordNet, lookupWordNet, wordNetStatus } from './wordnet';
import { loadBundledDictionary } from '../../lookup/dictionary/packs';
import { LookupService } from '../../lookup/service';
import { defaultEngineSettings } from '../../settings/engines';
import { db } from '../../db/database';
import type { LookupRequest } from '../../lookup/types';
import { LexicalEngine } from './lexicon';

const request = (word: string, sentence: string): LookupRequest => ({ selection: word, sentence, selection_type: 'word', previous_sentence: null, next_sentence: null,
  language_mode: 'bilingual', learner: { native_language: 'vi', english_level: 'B2' }, options: { include_ipa: true, include_contrast: true, include_grammar: true, include_sentence_translation: true } });
beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const wordnet = url.match(/wordnet-(noun|verb|adj|adv)/)?.[1];
    const path = wordnet ? `release/wordnet/wordnet-${wordnet}.json`
      : url.includes('wiktionary') ? 'release/dictionary/context-lens-wiktionary-en-vi-reviewed-2026.09.2.json'
        : 'release/dictionary/context-lens-en-vi-2026.09.1.json';
    return new Response(readFileSync(path, 'utf8'));
  }));
  await Promise.all([loadWordNet(), loadWordNet(), loadBundledDictionary()]);
}, 20_000);
afterAll(async () => { vi.unstubAllGlobals(); await db.sentenceAnalyses.clear(); });
it('ships reproducible WordNet packs and the required license', () => {
  const manifest = JSON.parse(readFileSync('release/wordnet/manifest.json', 'utf8'));
  for (const file of manifest.files) {
    const data = readFileSync(`release/wordnet/${file.file}`);
    expect(createHash('sha256').update(data).digest('hex')).toBe(file.sha256);
    expect(data.length).toBeLessThan(20 * 1024 * 1024);
  }
  expect(readFileSync('release/wordnet/WORDNET-LICENSE.md', 'utf8')).toContain('Princeton');
  expect(wordNetStatus()).toBe('ready');
  expect(lookupWordNet('bank')?.senses.length).toBeGreaterThan(2);
});
it('delivers English definitions and Vietnamese meanings through the actual service offline', async () => {
  const fetch = vi.fn().mockRejectedValue(new Error('offline')); vi.stubGlobal('fetch', fetch);
  const service = new LookupService();
  for (const [word, sentence] of [['happened', 'It happened yesterday.'], ['investment', 'The policy limits investment.'], ['expansion', 'The expansion of credit continued.']]) {
    const result = await service.quick(request(word, sentence), { ...defaultEngineSettings, quickEngine: 'offline' });
    expect(result.quick.definition_en.length).toBeGreaterThan(5);
    expect(result.quick.meaning_vi.length).toBeGreaterThan(0);
    expect(result.lens?.vietnamese?.senseAligned).toBe(false);
  }
  expect(fetch).not.toHaveBeenCalled();
});
it('keeps every POS while prioritizing the modal-driven verb sense', async () => {
  const result = await new LookupService().quick(request('guarantee', 'No teaching tool can guarantee that students learn.'), { ...defaultEngineSettings, quickEngine: 'offline' });
  expect(result.selection.lemma).toBe('guarantee');
  expect(result.dictionary?.contextPos).toBe('verb');
  expect(result.dictionary?.senses[0]).toMatchObject({ pos: 'verb', contextMatch: true });
  expect(result.dictionary?.senses.some(sense => sense.pos === 'noun')).toBe(true);
});
it.each([
  ['delivered', 'deliver'], ['indicated', 'indicate'], ['guaranteed', 'guarantee'], ['children', 'child'], ['better', 'good']
])('keeps surface %s and resolves the full lemma %s', async (surface, lemma) => {
  const result = await new LookupService().quick(request(surface, `They ${surface} the result.`), { ...defaultEngineSettings, quickEngine: 'offline' });
  expect(result.selection.surface).toBe(surface);
  expect(result.selection.lemma).toBe(lemma);
  expect(result.dictionary?.senses.length).toBeGreaterThan(0);
  expect(result.quick.meaning_vi.join(' ')).not.toMatch(/^(Quá khứ|Dạng phân từ)/i);
});
it.each([
  ['indicated', 'indicate', 'The arrow indicated the correct route.'],
  ['delivered', 'deliver', 'The courier delivered the parcel yesterday.'],
  ['written', 'write', 'She had written a short note.'],
  ['went', 'go', 'They went home early.']
])('resolves %s consistently through immediate, lexical, and quick lookup', async (surface, lemma, sentence) => {
  const service = new LookupService();
  const input = request(surface, sentence);
  expect(service.immediate(input).selection.lemma).toBe(lemma);
  expect(new LexicalEngine().lookup(surface)?.lemma).toBe(lemma);
  const quick = await service.quick(input, { ...defaultEngineSettings, quickEngine: 'offline' });
  expect(quick.selection.lemma).toBe(lemma);
  expect(quick.quick.definition_en.length).toBeGreaterThan(5);
  expect(quick.quick.meaning_vi.join(' ')).not.toMatch(/^(Quá khứ|Dạng phân từ)/i);
  expect(quick.deep.grammar?.pattern).toContain('of');
});

it.each(['studied', 'interested', 'tired', 'better'])('retains lexicalized senses for %s', word => {
  const entry = new LexicalEngine().lookup(word);
  expect(entry?.senses.length).toBeGreaterThan(1);
});
it('resolves attended as the finite verb in subject-verb-object context', async () => {
  const result = await new LookupService().quick(request('attended', 'Not long ago we attended a talk at an academic conference.'),
    { ...defaultEngineSettings, quickEngine: 'offline' });
  expect(result.selection.lemma).toBe('attend');
  expect(result.selection.part_of_speech).toContain('verb');
  expect(result.quick.meaning_vi.join(' ')).toMatch(/Dự|có mặt/i);
  expect(result.quick.meaning_vi.join(' ')).not.toMatch(/station|đài|trạm/i);
  expect(result.quick.definition_en).not.toMatch(/singing|instrumental|accompaniment/i);
  expect(result.deep.grammar?.pattern).toContain('attend');
});
it.each([
  ['counterargument', 'counterargument'],
  ['counterarguments', 'counterargument'],
  ['lowest-common-denominator', 'common denominator'],
  ['lowest-commondenominator', 'common denominator'],
  ['lowest common denominator', 'common denominator'],
  ['summarizing', 'summarize'],
  ['attempted', 'attempt'],
  ['maintaining', 'maintain'],
  ['constraints', 'constraint']
])('provides a usable local result for %s', async (surface, lemma) => {
  const result = await new LookupService().quick(request(surface, `We selected ${surface} here.`), { ...defaultEngineSettings, quickEngine: 'offline' });
  expect(result.selection.lemma).toBe(lemma);
  expect(result.quick.definition_en || result.quick.meaning_vi.join(' ')).toBeTruthy();
});
it.each(['institutional constraints', 'account for', "make up one's mind"])('resolves the local phrase %s', async phrase => {
  const result = await new LookupService().quick(request(phrase, `They use ${phrase} in context.`), { ...defaultEngineSettings, quickEngine: 'offline' });
  expect(result.quick.lexical_unit?.text).toBeTruthy();
  expect(result.quick.definition_en).toBeTruthy();
  expect(result.quick.meaning_vi.length).toBeGreaterThan(0);
});
it('uses the provisional sense-aligned Vietnamese entry for counterargument', async () => {
  const result = await new LookupService().quick(request('counterargument', 'She offered a counterargument.'), { ...defaultEngineSettings, quickEngine: 'offline' });
  expect(result.quick.definition_en).toBeTruthy();
  expect(result.quick.meaning_vi).toEqual(['lập luận phản biện']);
  expect(result.lens?.selection.status).toBe('complete');
  expect(result.lens?.vietnamese?.senseAligned).toBe(true);
  expect(result.lens?.providers.lexical).toBe('local-dictionary');
});
it('keeps contextual phrase results local and does not reuse the wrong sentence sense', async () => {
  const fetch = vi.fn().mockRejectedValue(new Error('must not fetch')); vi.stubGlobal('fetch', fetch);
  const service = new LookupService();
  const proportion = await service.quick(request('accounts for', 'The sector accounts for 45% of employment.'));
  const cause = await service.quick(request('accounted for', 'Several factors accounted for the decline.'));
  expect(proportion.lens?.sense?.id).toBe('account-for.proportion');
  expect(cause.lens?.sense?.id).toBe('account-for.explain');
  expect(fetch).not.toHaveBeenCalled();
});
it('does not return a stale result after cancellation', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(new LookupService().quick(request('investment', 'Investment grew.'), defaultEngineSettings, controller.signal)).rejects.toMatchObject({ code: 'ABORTED' });
});
it('measures local warm latency with the full offline dictionaries loaded', async () => {
  const service = new LookupService();
  const input = request('investment', 'The policy limits investment.');
  const settings = { ...defaultEngineSettings, quickEngine: 'offline' as const };
  await service.quick(input, settings);
  const times: number[] = [];
  for (let i = 0; i < 100; i++) {
    const start = performance.now(); await service.quick(input, settings); times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  process.stderr.write(`[performance] full local engine n=100 p50=${times[50].toFixed(2)}ms p95=${times[95].toFixed(2)}ms\n`);
});
