import { afterEach, describe, expect, it, vi } from 'vitest';
import { db, type DocumentRecord } from '../db/database';
import { LookupService } from '../lookup/service';
import type { LookupRequest } from '../lookup/types';
import { defaultAiSettings } from '../settings/types';
import { defaultEngineSettings } from '../settings/engines';
import { saveVocabulary } from '../vocabulary/store';
import { saveNote } from '../notes/store';
import { EngineCache } from '../core/cache';
import { TranslationRouter, TRANSLATION_VERSION } from '../core/translation/router';
import type { TranslationProvider, TranslationResult } from '../core/translation/types';
import { ContextRouter, CONTEXT_VERSION } from '../core/context/context-router';
import type { ContextProvider, ContextResult } from '../core/context/types';

const request = (selection: string, sentence: string): LookupRequest => ({ selection, selection_type: selection.includes(' ') ? 'phrase' : 'word', sentence, previous_sentence: null, next_sentence: null, language_mode: 'bilingual', learner: { native_language: 'vi', english_level: 'B2' }, options: { include_ipa: true, include_contrast: true, include_grammar: true, include_sentence_translation: true } });
const documentRecord: DocumentRecord = { id: 'flow-doc', title: 'Flow', content: 'The sector accounts for 40%.', kind: 'text', createdAt: 1, updatedAt: 1, location: { kind: 'text', scrollY: 0, progress: 0.4, updatedAt: 1 } };

describe('language engine integration', () => {
  afterEach(async () => { vi.restoreAllMocks(); await Promise.all([db.translations.clear(), db.contexts.clear(), db.vocabulary.clear(), db.notes.clear(), db.documents.clear()]); });
  it('keeps quick local, explicit context, vocabulary, and notes in one offline reading flow', async () => {
    const service = new LookupService();
    const quickRequest = request('prerequisite', 'Training is a prerequisite.');
    const immediate = service.immediate(quickRequest);
    expect(immediate.quick.meaning_vi).toContain('điều kiện tiên quyết');
    const quick = await service.quick(quickRequest, { ...defaultEngineSettings, browserTranslation: false });
    expect(quick.quick.meaning_vi).toContain('điều kiện tiên quyết');

    const contextRequest = request('account for', 'The sector accounts for 40% of total output.');
    const context = await service.explain(contextRequest, defaultAiSettings, defaultEngineSettings);
    expect(context.provider).toBe('heuristic'); expect(context.result.deep.context_explanation_vi).toContain('chiếm');

    await db.documents.put(documentRecord);
    await saveVocabulary(documentRecord, context.result);
    await saveNote({ documentId: documentRecord.id, documentTitle: documentRecord.title, text: 'Remember the percentage sense.', selectedText: contextRequest.selection, sentence: contextRequest.sentence, location: '40%' });
    expect(await db.vocabulary.count()).toBe(1); expect(await db.notes.count()).toBe(1);
  });

  it('reopens translation and AI context from Dexie while offline without calling providers', async () => {
    const translated: TranslationResult = { text: 'điều kiện tiên quyết', sourceText: 'prerequisite', sourceLang: 'en', targetLang: 'vi', provider: 'network' };
    const network: TranslationProvider = { id: 'network', priority: 1, tier: 'optional', network: true, timeoutMs: 500, isAvailable: () => true, supports: () => true, translate: vi.fn().mockResolvedValue(translated) };
    const translationCache = new EngineCache<TranslationResult>(db.translations, TRANSLATION_VERSION, 50);
    await new TranslationRouter([network], translationCache, undefined, true, () => true).translate({ text: 'prerequisite', sourceLang: 'en', targetLang: 'vi' });
    const offlineTranslation = await new TranslationRouter([network], new EngineCache(db.translations, TRANSLATION_VERSION, 50), undefined, true, () => false).translate({ text: 'prerequisite', sourceLang: 'en', targetLang: 'vi' });
    expect(offlineTranslation).toMatchObject({ text: translated.text, cached: true }); expect(network.translate).toHaveBeenCalledTimes(1);

    const contextProvider: ContextProvider = { id: 'user-api', family: 'test', model: 'small', network: true, explain: vi.fn().mockResolvedValue({ meaning: 'chiếm một phần', confidence: 0.9 }) };
    const input = { request: request('account for', 'The sector accounts for much of the output.'), mode: 'word-sense' as const, sourceLang: 'en', targetLang: 'vi' };
    await new ContextRouter([contextProvider], new EngineCache<ContextResult>(db.contexts, CONTEXT_VERSION, 50), true, () => true).explain(input);
    const offlineContext = await new ContextRouter([], new EngineCache<ContextResult>(db.contexts, CONTEXT_VERSION, 50), true, () => false).explain(input);
    expect(offlineContext).toMatchObject({ cached: true, provider: 'user-api', explanation: { meaning: 'chiếm một phần' } });
    expect(contextProvider.explain).toHaveBeenCalledTimes(1);
  });
});
