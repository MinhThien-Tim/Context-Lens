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
import { LexicalEngine } from '../core/language/lexicon';
import type { LexicalEntry } from '../core/language/types';
import * as providerRegistry from '../core/translation/provider-registry';
import type { TranslationInput } from '../core/translation/types';
import { EngineError } from '../core/errors';

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
  it('keeps a cached translation from confirming a meaning without independent evidence', async () => {
    const translate = vi.fn().mockResolvedValue('Họ điều hành nó.');
    vi.stubGlobal('Translator', { availability: vi.fn().mockResolvedValue('available'), create: vi.fn().mockResolvedValue({ translate, destroy: vi.fn() }) });
    const service = new LookupService();
    const sentenceRequest = { ...request, selection: 'run', sentence: 'They run it.', selection_start: 5 };
    await service.translateSentence(sentenceRequest);
    const quick = await service.quick(sentenceRequest, { ...defaultEngineSettings, quickEngine: 'offline' });
    expect(quick.dictionary?.senseStatus).toBe('ambiguous');
    expect(quick.dictionary?.senses.some(sense => sense.contextMatch)).toBe(false);
    expect(quick.lens?.sense?.reasons.join(' ')).toContain('No evidence');
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
    expect(local).toHaveBeenCalled();
    expect(local.mock.calls.at(-1)?.[0].quick.definition_en).toContain('move on foot');
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
    expect(fetch.mock.calls.filter(([url]) => String(url) === 'https://example.test/translate')).toHaveLength(0);
    await service.quick({ ...request, sentence, selection: 'sanctions', selection_start: sentence.indexOf('sanctions') }, settings);
    for (const selection of ['capital', 'constrained', 'access', 'severely']) {
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

describe('selected English sense fallback', () => {
  const gloss = 'an item used to verify a translation';
  const settings = { ...defaultEngineSettings, browserTranslation: true, publicTranslation: false,
    googleProvider: false, bingProvider: false, managedTranslation: false };
  const selection = { ...request, selection: 'fallbackfixture', sentence: 'A fallbackfixture.' };
  function setup(extra: Partial<LexicalEntry> = {}, translate = vi.fn(async (input: TranslationInput) => ({
    text: 'một mục dùng để kiểm tra bản dịch', sourceText: input.text, targetLang: 'vi', provider: 'fixture'
  })), timeoutMs = 1000) {
    const entry: LexicalEntry = { lemma: 'fallbackfixture', pos: ['noun'],
      senses: [{ id: 'fixture.only', pos: 'noun', definitionEn: gloss }], ...extra };
    vi.spyOn(LexicalEngine.prototype, 'lookup').mockImplementation(text => text === 'fallbackfixture' ? entry : undefined);
    vi.spyOn(providerRegistry, 'translationProviders').mockReturnValue([{ id: 'fixture', network: true,
      priority: 1, tier: 'optional', timeoutMs, supports: () => true, isAvailable: () => true, translate }]);
    const fetch = vi.fn().mockRejectedValue(new Error('No network in tests'));
    vi.stubGlobal('fetch', fetch);
    return { service: new LookupService(), translate, fetch };
  }
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllGlobals();
    await Promise.all([db.translations.clear(), db.sentenceAnalyses.clear()]);
  });
  it('translates only the selected gloss, publishes English first and reuses the cache', async () => {
    const { service, translate, fetch } = setup();
    const local = vi.fn();
    const first = await service.quick(selection, settings, undefined, local);
    const englishReady = local.mock.calls.find(([result]) => result.quick.definition_en === gloss)?.[0];
    expect(englishReady?.dictionary.senses[0].meaningsVi).toEqual([]);
    expect(englishReady?.quick.definition_en).toBe(gloss);
    expect(translate.mock.calls[0][0]).toMatchObject({ text: gloss, mode: 'sentence' });
    expect(first.dictionary?.senses[0]).toMatchObject({ definitionEn: gloss, pairingState: 'paired', meaningsVi: ['một mục dùng để kiểm tra bản dịch'] });
    const second = await service.quick(selection, settings);
    expect(first.dictionary?.senses[0].alignment).toMatchObject({ kind: 'translated-definition', confidence: 'low', dependsOnSenseId: 'fixture.only' });
    expect(second.source).toBe('cache');
    expect(translate).toHaveBeenCalledOnce();
    expect(fetch.mock.calls.filter(([url]) => /^https?:/.test(String(url)))).toHaveLength(0);
  });
  it('does not translate when useful aggregate VI remains beside an unresolved reference', async () => {
    const { service, translate } = setup({ meaningsVi: ['nghĩa hữu ích', 'Xem absentfixture'],
      vietnameseReferences: [{ text: 'Xem absentfixture', target: 'absentfixture', status: 'unresolved', reason: 'missing' }] });
    const result = await service.quick(selection, settings);
    expect(result.dictionary?.unpairedMeaningsVi).toContain('nghĩa hữu ích');
    expect(translate).not.toHaveBeenCalled();
  });
  it('fills a missing sense when the only aggregate VI is an unresolved reference', async () => {
    const { service, translate } = setup({ meaningsVi: ['Xem absentfixture'],
      vietnameseReferences: [{ text: 'Xem absentfixture', target: 'absentfixture', status: 'unresolved', reason: 'missing' }] });
    const result = await service.quick(selection, settings);
    expect(result.dictionary?.senses[0].meaningsVi).toEqual(['một mục dùng để kiểm tra bản dịch']);
    expect(result.dictionary?.unpairedMeaningsVi).toEqual(['Xem absentfixture']);
    expect(translate).toHaveBeenCalledOnce();
  });
  it.each(['offline-mode', 'offline-browser', 'disabled'] as const)('preserves English without provider calls: %s', async mode => {
    const { service, translate } = setup();
    if (mode === 'offline-browser') vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const result = await service.quick(selection, { ...settings,
      quickEngine: mode === 'offline-mode' ? 'offline' : 'auto', browserTranslation: mode !== 'disabled' });
    expect(result.dictionary?.senses[0].definitionEn).toBe(gloss);
    expect(result.dictionary?.senses[0].meaningsVi).toEqual([]);
    expect(translate).not.toHaveBeenCalled();
  });
  it.each(['network', 'timeout', 'unchanged'] as const)('preserves English after %s', async failure => {
    const translate = vi.fn<(input: TranslationInput) => Promise<{ text: string; sourceText: string; targetLang: string; provider: string }>>();
    if (failure === 'network') translate.mockRejectedValue(new EngineError('NETWORK'));
    else if (failure === 'timeout') translate.mockImplementation(() => new Promise(() => {}));
    else translate.mockImplementation(async input => ({ text: input.text, sourceText: input.text, targetLang: 'vi', provider: 'fixture' }));
    const { service } = setup({}, translate, 10);
    const result = await service.quick(selection, settings);
    expect(result.dictionary?.senses[0]).toMatchObject({ definitionEn: gloss, meaningsVi: [], pairingState: 'missing' });
  });
  it('propagates cancellation while a gloss translation is pending', async () => {
    const controller = new AbortController();
    const translate = vi.fn(async () => { controller.abort(); throw new EngineError('ABORTED'); });
    const { service } = setup({}, translate);
    await expect(service.quick(selection, settings, controller.signal)).rejects.toMatchObject({ code: 'ABORTED' });
    expect(translate).toHaveBeenCalledOnce();
  });
});
