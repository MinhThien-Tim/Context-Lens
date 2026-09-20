import { afterEach, expect, it, vi } from 'vitest';
import { ManagedTranslationProvider } from './managed';
import { TranslationRouter } from '../router';
import type { TranslationResult } from '../types';
afterEach(() => vi.unstubAllGlobals());
it('uses device cache before the managed gateway and sends only the selection', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: 'xin chào' }))); vi.stubGlobal('fetch', fetchMock);
  const values = new Map<string, TranslationResult>();
  const router = new TranslationRouter([new ManagedTranslationProvider('/api/translate')], {
    get: async key => values.get(key) ?? null, put: async (key, result) => { values.set(key, result); }
  });
  const input = { text: 'hello', sourceLang: 'en', targetLang: 'vi', mode: 'word' as const };
  await router.translate(input); expect((await router.translate(input)).cached).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const init = (fetchMock.mock.calls as unknown as [URL, RequestInit][])[0][1];
  expect(JSON.parse(String(init.body))).toEqual(input);
});
it('maps quota and timeout and never sends same-language or oversized requests through routing', async () => {
  const p = new ManagedTranslationProvider('/api/translate');
  expect(p.supports('en', 'en')).toBe(false);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })));
  await expect(p.translate({ text: 'hello', sourceLang: 'en', targetLang: 'vi' })).rejects.toMatchObject({ code: 'QUOTA' });
  await expect(p.translate({ text: 'a'.repeat(1001), sourceLang: 'en', targetLang: 'vi' })).rejects.toMatchObject({ code: 'UNSUPPORTED_LANGUAGE' });
});
