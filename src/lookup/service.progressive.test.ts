import { afterEach, expect, it, vi } from 'vitest';
import { LookupService } from './service';
import * as assets from './localAssets';
import * as web from './webDictionary';
import * as providers from '../core/translation/provider-registry';
import { LocalLanguageEngine } from '../core/language/local-language-engine';
import { defaultEngineSettings } from '../settings/engines';
import { db } from '../db/database';
import { clearEngineMemory } from '../core/cache';
import { translationKey, TRANSLATION_VERSION } from '../core/translation/router';
import type { TranslationResult } from '../core/translation/types';
import type { LookupRequest, LookupResponse } from './types';

const request: LookupRequest = { selection: 'maintain', selection_type: 'word', sentence: 'They maintain it.', previous_sentence: null, next_sentence: null,
  language_mode: 'bilingual', learner: { native_language: 'vi', english_level: 'B2' },
  options: { include_ipa: true, include_contrast: true, include_grammar: true, include_sentence_translation: true } };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
afterEach(async () => { vi.restoreAllMocks(); clearEngineMemory(); await db.translations.clear(); });

it('publishes synchronous local content before assets or context finish', async () => {
  const gate = deferred<void>(); vi.spyOn(assets, 'ensureLocalDictionaryAssets').mockReturnValue(gate.promise);
  const service = new LookupService(); const updates = vi.fn();
  const initial = service.immediate(request); const immediate = vi.spyOn(service, 'immediate');
  const pending = service.quick(request, { ...defaultEngineSettings, quickEngine: 'offline' }, undefined, updates, initial);
  expect(updates).toHaveBeenCalledWith(initial);
  expect(initial.quick.definition_en).toBeTruthy();
  expect(immediate).not.toHaveBeenCalled();
  gate.resolve(); await pending;
});

it('exposes a valid cached meaning while assets remain blocked, with no provider call', async () => {
  const gate = deferred<void>(); vi.spyOn(assets, 'ensureLocalDictionaryAssets').mockReturnValue(gate.promise);
  const translate = vi.fn(); vi.spyOn(providers, 'translationProviders').mockReturnValue([{ id: 'test', tier: 'optional', priority: 1, network: true, timeoutMs: 100,
    supports: () => true, isAvailable: async () => true, translate }]);
  const input = { text: 'xyzzy', sourceLang: 'en', targetLang: 'vi', mode: 'word' as const };
  await db.translations.put({ key: translationKey(input), version: TRANSLATION_VERSION, provider: 'test', languagePair: 'en>vi', createdAt: 1, lastUsedAt: 1, hits: 1,
    result: { text: 'cached meaning', sourceText: 'xyzzy', sourceLang: 'en', targetLang: 'vi', provider: 'test', offline: false, dictionary: { definition: 'Cached English', meanings: ['cached meaning'] } } });
  vi.spyOn(web, 'lookupWebDictionary').mockResolvedValue(null);
  const updates: LookupResponse[] = []; const ready = deferred<void>();
  const pending = new LookupService().quick({ ...request, selection: 'xyzzy' }, defaultEngineSettings, undefined, result => {
    updates.push(result); if (result.quick.meaning_vi.includes('cached meaning')) ready.resolve();
  });
  await ready.promise;
  expect(updates.at(-1)?.engine?.cached).toBe(true); expect(translate).not.toHaveBeenCalled();
  gate.resolve(); await pending; expect(translate).not.toHaveBeenCalled(); expect(web.lookupWebDictionary).not.toHaveBeenCalled();
});

it.each([false, true])('publishes web English before slow translation; guards cancellation=%s', async cancelled => {
  vi.spyOn(assets, 'ensureLocalDictionaryAssets').mockResolvedValue();
  vi.spyOn(LocalLanguageEngine.prototype, 'analyzeSelection').mockImplementation(async input => ({ selection: { surface: input.selectedText, normalized: input.selectedText, lemma: input.selectedText },
    context: { sentence: input.sentence, needsPreviousSentence: false }, confidence: 0, providers: {}, cached: false, offline: true }));
  const gate = deferred<NonNullable<LookupResponse['dictionary']>>();
  vi.spyOn(web, 'lookupWebDictionary').mockReturnValue(gate.promise);
  const translation = deferred<TranslationResult>(); const started = deferred<void>();
  const translate = vi.fn(() => { started.resolve(); return translation.promise; });
  vi.spyOn(providers, 'translationProviders').mockReturnValue([{ id: 'test', tier: 'optional', priority: 1, network: true, timeoutMs: 2000,
    supports: () => true, isAvailable: async () => true, translate }]);
  const service = new LookupService(); const controller = new AbortController(); const updates = vi.fn();
  const pending = service.quick({ ...request, selection: 'xyzzy' }, defaultEngineSettings, controller.signal, updates);
  gate.resolve({ word: 'xyzzy', surfaceForm: 'xyzzy', lemma: 'xyzzy', pronunciation: null, contextConfidence: 0,
    senses: [{ id: 'web', pos: 'noun', definitionEn: 'Web English meaning', meaningsVi: [], source: 'web', contextScore: 0, contextMatch: false }] });
  await started.promise;
  expect(updates.mock.calls.at(-1)?.[0].quick.definition_en).toBe('Web English meaning');
  const count = updates.mock.calls.length; if (cancelled) controller.abort();
  translation.resolve({ text: 'late A', sourceText: 'xyzzy', sourceLang: 'en', targetLang: 'vi', provider: 'test', offline: false });
  if (cancelled) { await expect(pending).rejects.toThrow(); expect(updates).toHaveBeenCalledTimes(count); }
  else { const final = await pending; expect(final.quick.definition_en).toBe('Web English meaning'); expect(final.quick.meaning_vi).toEqual(['late A']); expect(translate).toHaveBeenCalledOnce(); }
});
