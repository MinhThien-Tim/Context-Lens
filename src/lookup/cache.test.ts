import { describe, expect, it } from 'vitest';
import { createCacheKey, createContextCacheKey } from './cache';

describe('cache keys', () => {
  it('separates identical words in different contexts', async () => {
    const base = { selection: 'accounts', languageMode: 'bilingual' as const, promptVersion: 'v1', provider: 'gemini', model: 'flash' };
    const noun = await createCacheKey({ ...base, sentence: 'Accounts of what happened to the ship vary.' });
    const verb = await createCacheKey({ ...base, sentence: 'Several factors account for the decline.' });
    expect(noun).not.toBe(verb);
  });
  it('keeps a provider-independent identity for offline cache recovery', async () => {
    const input = { selection: 'maintain', sentence: 'They maintain public confidence.', languageMode: 'bilingual' as const, promptVersion: 'v2' };
    const contextKey = await createContextCacheKey(input);
    const providerKey = await createCacheKey({ ...input, provider: 'gemini', model: 'flash' });
    expect(providerKey.startsWith(`${contextKey}:`)).toBe(true);
  });
});
