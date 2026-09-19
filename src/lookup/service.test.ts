import { afterEach, describe, expect, it } from 'vitest';
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
  afterEach(async () => db.lookups.clear());
  it('returns a provider-independent cached result when AI is disabled', async () => {
    const contextKey = await createContextCacheKey({ selection: request.selection, sentence: request.sentence, languageMode: request.language_mode, promptVersion: PROMPT_VERSION });
    await db.lookups.put({ key: `${contextKey}:gemini:flash`, contextKey, result: validLookup, createdAt: 1, accessedAt: 1 });
    const result = await new LookupService().contextual(request, defaultAiSettings);
    expect(result).toEqual(expect.objectContaining({ source: 'cache', request_id: 'lookup_test' }));
  });
});
