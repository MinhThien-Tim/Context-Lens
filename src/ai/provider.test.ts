import { describe, expect, it, vi } from 'vitest';
import { OpenAiCompatibleProvider } from './providers/openaiCompatible';
import { ProviderError } from './provider';
import { providerFetch } from './provider';
import { validLookup } from '../test/fixtures';
import type { LookupRequest } from '../lookup/types';

const request: LookupRequest = { selection: 'maintain', selection_type: 'word', sentence: validLookup.context.sentence, previous_sentence: null, next_sentence: null, language_mode: 'bilingual', learner: { native_language: 'vi', english_level: 'B2-C1' }, options: { include_ipa: true, include_contrast: true, include_grammar: true, include_sentence_translation: true } };

describe('provider abstraction', () => {
  it('validates compatible provider output', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(validLookup) } }] }), { status: 200 })));
    const provider = new OpenAiCompatibleProvider({ apiKey: 'not-a-real-key', baseUrl: 'https://provider.test/v1', model: 'small' });
    expect((await provider.lookup(request)).selection.lemma).toBe('maintain');
  });
  it('rejects malformed model output gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 })));
    const provider = new OpenAiCompatibleProvider({ apiKey: 'x', baseUrl: 'https://provider.test/v1', model: 'small' });
    await expect(provider.lookup(request)).rejects.toEqual(expect.objectContaining<Partial<ProviderError>>({ code: 'invalid_response' }));
  });
  it('normalizes rate-limit errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })));
    await expect(providerFetch('https://provider.test', {})).rejects.toEqual(expect.objectContaining<Partial<ProviderError>>({ code: 'rate_limit', status: 429 }));
  });
});
