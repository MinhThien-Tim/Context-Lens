import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { loadWordNet, lookupWordNet, wordNetStatus } from './wordnet';
import { loadBundledDictionary } from '../../lookup/dictionary/packs';
import { LookupService } from '../../lookup/service';
import { defaultEngineSettings } from '../../settings/engines';
import { db } from '../../db/database';
import type { LookupRequest } from '../../lookup/types';

const request = (word: string, sentence: string): LookupRequest => ({ selection: word, sentence, selection_type: 'word', previous_sentence: null, next_sentence: null,
  language_mode: 'bilingual', learner: { native_language: 'vi', english_level: 'B2' }, options: { include_ipa: true, include_contrast: true, include_grammar: true, include_sentence_translation: true } });
beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const wordnet = url.match(/wordnet-(noun|verb|adj|adv)/)?.[1];
    const path = wordnet ? `release/wordnet/wordnet-${wordnet}.json` : 'release/dictionary/context-lens-en-vi-2026.09.json';
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
