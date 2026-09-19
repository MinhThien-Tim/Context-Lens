import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/database';
import { PROMPT_VERSION } from '../ai/prompt';
import { defaultAiSettings } from '../settings/types';
import { createContextCacheKey } from './cache';
import { LookupService } from './service';
import type { LookupRequest } from './types';
import { validLookup } from '../test/fixtures';

const request: LookupRequest = {
  selection: 'maintain', selection_type: 'word', sentence: validLookup.context.sentence,
  previous_sentence: null, next_sentence: null, language_mode: 'bilingual',
  learner: { native_language: 'vi', english_level: 'B2-C1' },
  options: { include_ipa: true, include_contrast: true, include_grammar: true, include_sentence_translation: true }
};

describe('lookup service offline cache', () => {
  afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); await Promise.all([db.lookups.clear(), db.contexts.clear(), db.translations.clear()]); });
  it('returns a successful AI response even when cache reads and writes fail', async () => {
    vi.spyOn(db.contexts, 'get').mockRejectedValue(new Error('Storage unavailable'));
    vi.spyOn(db.contexts, 'put').mockRejectedValue(new Error('Storage full'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ meaning: 'duy trì trong ngữ cảnh', confidence: 0.9 }) }] } }] }))));
    const result = await new LookupService().contextual({ ...request, context_mode: 'grammar' }, { ...defaultAiSettings, provider: 'gemini', apiKey: 'test' });
    expect(result).toMatchObject({ source: 'ai', engine: { provider: 'user-api' } });
  });
  it('keeps a recognized contextual phrase when a generic translation arrives', async () => {
    const result = await new LookupService().quick({ ...request, selection: 'accounts', sentence: 'The sector accounts for 40% of total output.' });
    expect(result.quick.meaning_vi.join()).toContain('chiếm');
    expect(result.quick.lexical_unit?.text).toBe('account for');
  });
  it('returns a provider-independent cached result when AI is disabled', async () => {
    const contextKey = await createContextCacheKey({ selection: request.selection, sentence: request.sentence, languageMode: request.language_mode, promptVersion: PROMPT_VERSION });
    await db.lookups.put({ key: `${contextKey}:gemini:flash`, contextKey, result: validLookup, createdAt: 1, accessedAt: 1 });
    const result = await new LookupService().contextual(request, defaultAiSettings);
    expect(result).toEqual(expect.objectContaining({ source: 'cache', engine: expect.objectContaining({ provider: 'legacy-cache' }) }));
  });
});
