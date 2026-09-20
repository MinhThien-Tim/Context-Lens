import { afterEach, expect, it, vi } from 'vitest';
import { ManagedTranslationProvider } from './managed';
import { TranslationRouter } from '../router';
import type { TranslationResult } from '../types';
afterEach(() => vi.unstubAllGlobals());
it('uses device cache before the managed gateway and sends only the selection', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ version: 1, provider: 'google-web', text: 'xin chào' }))); vi.stubGlobal('fetch', fetchMock);
  const values = new Map<string, TranslationResult>();
  const router = new TranslationRouter([new ManagedTranslationProvider('/api/translate')], {
    get: async key => values.get(key) ?? null, put: async (key, result) => { values.set(key, result); }
  });
  const input = { text: 'hello', sourceLang: 'en', targetLang: 'vi', mode: 'word' as const };
  await router.translate(input); expect((await router.translate(input)).cached).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const init = (fetchMock.mock.calls as unknown as [URL, RequestInit][])[0][1];
  expect(JSON.parse(String(init.body))).toEqual({ version: 1, provider: 'auto', ...input });
});
it('sends an explicit provider selection without client-side fan-out', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ version: 1, provider: 'bing-web', text: 'xin chào' })));
  vi.stubGlobal('fetch', fetchMock);
  const result = await new ManagedTranslationProvider('/api/translate', 'bing-web').translate({ text: 'hello', sourceLang: 'en', targetLang: 'vi', mode: 'word' });
  expect(result.provider).toBe('bing-web');
  expect(JSON.parse(String((fetchMock.mock.calls as unknown as [URL, RequestInit][])[0][1].body)).provider).toBe('bing-web');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('maps quota and timeout and never sends same-language or oversized requests through routing', async () => {
  const p = new ManagedTranslationProvider('/api/translate');
  expect(p.supports('en', 'en')).toBe(false);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })));
  await expect(p.translate({ text: 'hello', sourceLang: 'en', targetLang: 'vi' })).rejects.toMatchObject({ code: 'QUOTA' });
  await expect(p.translate({ text: 'a'.repeat(1001), sourceLang: 'en', targetLang: 'vi' })).rejects.toMatchObject({ code: 'UNSUPPORTED_LANGUAGE' });
});
it('rejects malformed and provider-less normalized responses', async () => {
  const p = new ManagedTranslationProvider('/api/translate');
  for (const body of [{ text: 'xin chào' }, { version: 1, provider: 'unknown', text: 'xin chào' }, { version: 1, provider: 'google-web', text: '' }]) {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body))));
    await expect(p.translate({ text: 'hello', sourceLang: 'en', targetLang: 'vi' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  }
});
