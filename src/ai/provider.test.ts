import { describe, expect, it, vi } from 'vitest';
import { OpenAiCompatibleProvider } from './providers/openaiCompatible';
import { ProviderError } from './provider';
import { providerFetch } from './provider';
import { validLookup } from '../test/fixtures';
import type { ContextInput } from '../core/context/types';
import type { LookupRequest } from '../lookup/types';
import { GeminiProvider } from './providers/gemini';

const request: LookupRequest = { selection: 'maintain', selection_type: 'word', sentence: validLookup.context.sentence, previous_sentence: null, next_sentence: null, language_mode: 'bilingual', learner: { native_language: 'vi', english_level: 'B2-C1' }, options: { include_ipa: true, include_contrast: true, include_grammar: true, include_sentence_translation: true } };
const input: ContextInput = { request, mode: 'meaning-in-context', sourceLang: 'en', targetLang: 'vi' };

describe('provider abstraction', () => {
  it('normalizes the Gemini model ID and joins non-thought response parts', async () => {
    const json = JSON.stringify({ meaning: 'duy trì trong ngữ cảnh', confidence: 0.9 });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [
      { text: 'Internal reasoning', thought: true }, { text: json.slice(0, 80) }, { text: json.slice(80) }
    ] } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await new GeminiProvider(' test-key ', ' models/gemini-3-6-flash ').explain(input)).meaning).toContain('duy trì');
    expect(fetchMock.mock.calls[0][0]).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent');
    expect(fetchMock.mock.calls[0][1].headers['x-goog-api-key']).toBe('test-key');
  });
  it('reports a missing model separately from network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    await expect(providerFetch('https://provider.test', {})).rejects.toMatchObject({ code: 'unsupported', status: 404 });
  });
  it('recognizes Gemini invalid-key responses with HTTP 400', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { details: [{ reason: 'API_KEY_INVALID' }] } }), { status: 400 })));
    await expect(providerFetch('https://provider.test', {})).rejects.toMatchObject({ code: 'auth' });
  });
  it('validates compatible provider output', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ meaning: 'duy trì', confidence: 0.9 }) } }] }), { status: 200 })));
    const provider = new OpenAiCompatibleProvider({ apiKey: 'not-a-real-key', baseUrl: 'https://provider.test/v1', model: 'small' });
    expect((await provider.explain(input)).meaning).toBe('duy trì');
  });
  it('rejects malformed model output gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 })));
    const provider = new OpenAiCompatibleProvider({ apiKey: 'x', baseUrl: 'https://provider.test/v1', model: 'small' });
    await expect(provider.explain(input)).rejects.toEqual(expect.objectContaining<Partial<ProviderError>>({ code: 'invalid_response' }));
  });
  it('normalizes rate-limit errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })));
    await expect(providerFetch('https://provider.test', {})).rejects.toEqual(expect.objectContaining<Partial<ProviderError>>({ code: 'rate_limit', status: 429 }));
  });
});
