import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/database';
import { PROMPT_VERSION } from '../ai/prompt';
import { defaultAiSettings } from '../settings/types';
import { createContextCacheKey } from './cache';
import { LookupService } from './service';
import type { LookupRequest } from './types';
import { validLookup } from '../test/fixtures';
import { defaultEngineSettings } from '../settings/engines';
import { getDiagnostics } from '../core/diagnostics';

const request: LookupRequest = {
  selection: 'maintain', selection_type: 'word', sentence: validLookup.context.sentence,
  previous_sentence: null, next_sentence: null, language_mode: 'bilingual',
  learner: { native_language: 'vi', english_level: 'B2-C1' },
  options: { include_ipa: true, include_contrast: true, include_grammar: true, include_sentence_translation: true }
};

describe('lookup service offline cache', () => {
  afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); await Promise.all([db.lookups.clear(), db.contexts.clear(), db.translations.clear(), db.sentenceAnalyses.clear()]); });
  it('reuses explicit browser sentence translations for later local selections', async () => {
    const translate = vi.fn().mockResolvedValue('Đào tạo là điều kiện tiên quyết.');
    vi.stubGlobal('Translator', { availability: vi.fn().mockResolvedValue('available'), create: vi.fn().mockResolvedValue({ translate, destroy: vi.fn() }) });
    const service = new LookupService();
    const sentenceRequest = { ...request, selection: 'prerequisite', sentence: 'Training is a prerequisite.' };
    await service.translateSentence(sentenceRequest);
    await service.translateSentence(sentenceRequest);
    expect(translate).toHaveBeenCalledTimes(1);
    const quick = await service.quick(sentenceRequest);
    expect(quick.deep.sentence_analysis.translation_vi).toBe('Đào tạo là điều kiện tiên quyết.');
  });
  it('uses a previously requested sentence translation to support a linked meaning', async () => {
    const translate = vi.fn().mockResolvedValue('Họ điều hành nó.');
    vi.stubGlobal('Translator', { availability: vi.fn().mockResolvedValue('available'), create: vi.fn().mockResolvedValue({ translate, destroy: vi.fn() }) });
    const service = new LookupService();
    const sentenceRequest = { ...request, selection: 'run', sentence: 'They run it.', selection_start: 5 };
    await service.translateSentence(sentenceRequest);
    const quick = await service.quick(sentenceRequest, { ...defaultEngineSettings, quickEngine: 'offline' });
    expect(quick.lens?.sense?.id).toBe('run.manage');
    expect(quick.dictionary?.senses.find(sense => sense.contextMatch)?.meaningsVi).toContain('điều hành');
    expect(quick.lens?.sense?.reasons.join(' ')).toContain('saved sentence translation');
    expect(translate).toHaveBeenCalledOnce();
  });
  it('honors the sentence-analysis cache opt-out', async () => {
    const put = vi.spyOn(db.sentenceAnalyses, 'put');
    await new LookupService().quick(request, { ...defaultEngineSettings, cacheSentenceAnalysis: false, quickEngine: 'offline' });
    expect(put).not.toHaveBeenCalled();
  });
  it('returns a local miss without invoking translation when all optional features are off', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const result = await new LookupService().quick({ ...request, selection: 'xyzzy' }, { ...defaultEngineSettings,
      offlineDictionary: false, browserTranslation: false, publicTranslation: false, googleProvider: false,
      bingProvider: false, managedTranslation: false });
    expect(result.quick).toMatchObject({ definition_en: '', meaning_vi: [] });
    expect(fetch.mock.calls.filter(([url]) => String(url).startsWith('http'))).toHaveLength(0);
  });
  it('does not invoke web lookup without explicit public translation opt-in', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await new LookupService().quick({ ...request, selection: 'xyzzy' }, { ...defaultEngineSettings,
      browserTranslation: false, publicTranslation: false, googleProvider: false,
      bingProvider: false, managedTranslation: false });
    expect(fetch.mock.calls.filter(([url]) => String(url).startsWith('http'))).toHaveLength(0);
  });
  it('publishes local English before a failing fallback and preserves the useful result', async () => {
    const service = new LookupService();
    const local = vi.fn();
    const result = await service.quick({ ...request, selection: 'run', sentence: 'They run.' }, defaultEngineSettings, undefined, local);
    expect(local).toHaveBeenCalledOnce();
    expect(result.quick.definition_en).toContain('move on foot');
  });
  it('returns a successful AI response even when cache reads and writes fail', async () => {
    const before = getDiagnostics().counters;
    vi.spyOn(db.contexts, 'get').mockRejectedValue(new Error('Storage unavailable'));
    vi.spyOn(db.contexts, 'put').mockRejectedValue(new Error('Storage full'));
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ grammar: { explanation: 'This verb uses a direct object.' }, confidence: 0.9 }) }] } }]
    })))));
    const result = await new LookupService().contextual({ ...request, context_mode: 'grammar' }, { ...defaultAiSettings, provider: 'gemini', apiKey: 'test' });
    expect(result).toMatchObject({ source: 'ai', engine: { provider: 'user-api' } });
    expect(getDiagnostics().counters.geminiAction - before.geminiAction).toBe(1);
    expect(getDiagnostics().counters.geminiRequest - before.geminiRequest).toBe(1);
  });
  it('keeps a recognized contextual phrase when a generic translation arrives', async () => {
    const result = await new LookupService().quick({ ...request, selection: 'accounts', sentence: 'The sector accounts for 40% of total output.' });
    expect(result.quick.meaning_vi.join()).toContain('chiếm');
    expect(result.quick.lexical_unit?.text).toBe('account for');
  });
  it('translates an ambiguous sentence once for repeated selections', async () => {
    const sentence = 'The sanctions severely constrained access to foreign capital.';
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ text: 'Các lệnh trừng phạt hạn chế nghiêm trọng khả năng tiếp cận vốn nước ngoài.' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    const service = new LookupService();
    const settings = { ...defaultEngineSettings, browserTranslation: false, publicTranslation: false, googleProvider: true,
      managedTranslation: false, translationEndpoint: 'https://example.test/translate' };
    const before = getDiagnostics().counters;
    const capital = await service.quick({ ...request, sentence, selection: 'capital', selection_start: sentence.indexOf('capital') }, settings);
    for (const selection of ['sanctions', 'constrained', 'access', 'severely']) {
      await service.quick({ ...request, sentence, selection, selection_start: sentence.indexOf(selection) }, settings);
    }
    const gatewayCalls = fetch.mock.calls.filter(([url]) => String(url) === 'https://example.test/translate');
    expect(gatewayCalls).toHaveLength(1);
    expect(JSON.parse(String(gatewayCalls[0][1].body)).text).toBe(sentence);
    expect(getDiagnostics().counters.googleFallback - before.googleFallback).toBe(1);
    expect(getDiagnostics().counters.translationCacheHit - before.translationCacheHit).toBe(4);
    expect(capital.quick.meaning_vi).toContain('vốn');
  });
  it('stops at a high-confidence local phrase without calling Google', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const sentence = 'This accounts for nearly half of the decline.';
    const result = await new LookupService().quick({ ...request, sentence, selection: 'accounts', selection_start: sentence.indexOf('accounts') }, {
      ...defaultEngineSettings, browserTranslation: false, publicTranslation: false, googleProvider: true,
      managedTranslation: false, translationEndpoint: 'https://example.test/translate'
    });
    expect(result.quick.lexical_unit?.text).toBe('account for');
    expect(fetch.mock.calls.filter(([url]) => String(url) === 'https://example.test/translate')).toHaveLength(0);
  });
  it('returns a provider-independent cached result when AI is disabled', async () => {
    const contextKey = await createContextCacheKey({ selection: request.selection, sentence: request.sentence, languageMode: request.language_mode, promptVersion: PROMPT_VERSION });
    await db.lookups.put({ key: `${contextKey}:gemini:flash`, contextKey, result: validLookup, createdAt: 1, accessedAt: 1 });
    const result = await new LookupService().contextual(request, defaultAiSettings);
    expect(result).toEqual(expect.objectContaining({ source: 'cache', engine: expect.objectContaining({ provider: 'legacy-cache' }) }));
  });
});
