import { afterEach, describe, expect, it } from 'vitest';
import { ContextLensDatabase } from '../db/database';
import { localLookup } from '../lookup/localDictionary';
import { EngineCache } from './cache';
import type { TranslationResult } from './translation/types';
import type { LookupRequest } from '../lookup/types';

const databases: ContextLensDatabase[] = [];
const request: LookupRequest = { selection: 'prerequisite', selection_type: 'word', sentence: 'Training is a prerequisite.', previous_sentence: null, next_sentence: null, language_mode: 'bilingual', learner: { native_language: 'vi', english_level: 'B2' }, options: { include_ipa: true, include_contrast: true, include_grammar: true, include_sentence_translation: true } };
const result: TranslationResult = { text: 'điều kiện tiên quyết', sourceText: 'prerequisite', sourceLang: 'en', targetLang: 'vi', provider: 'dictionary' };
function p95(values: number[]): number { return [...values].sort((a, b) => a - b)[Math.floor(values.length * 0.95)]; }
function p50(values: number[]): number { return [...values].sort((a, b) => a - b)[Math.floor(values.length * 0.5)]; }

describe('local performance budgets', () => {
  afterEach(async () => Promise.all(databases.splice(0).map(database => database.delete())));
  it('keeps local dictionary lookup under the 100 ms p95 budget', () => {
    const samples = Array.from({ length: 250 }, () => { const start = performance.now(); localLookup(request); return performance.now() - start; });
    const measured = p95(samples); process.stderr.write(`[performance] local dictionary n=${samples.length} p50=${p50(samples).toFixed(3)} ms p95=${measured.toFixed(3)} ms\n`);
    expect(measured).toBeLessThan(100);
  });
  it('keeps warm memory-cache reads under the 50 ms p95 budget', async () => {
    const database = new ContextLensDatabase(`perf-${crypto.randomUUID()}`); databases.push(database);
    const cache = new EngineCache<TranslationResult>(database.translations, 'perf-v1', 50);
    await cache.put('key', result, 'dictionary', 'en>vi');
    const samples: number[] = [];
    for (let index = 0; index < 100; index++) { const start = performance.now(); await cache.get('key'); samples.push(performance.now() - start); }
    const measured = p95(samples); process.stderr.write(`[performance] warm memory cache n=${samples.length} p50=${p50(samples).toFixed(3)} ms p95=${measured.toFixed(3)} ms\n`);
    expect(measured).toBeLessThan(50);
  });
});
