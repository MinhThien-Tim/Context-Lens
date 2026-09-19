import { afterEach, expect, it, vi } from 'vitest';
import { BrowserTranslationProvider } from './browser';
import { DictionaryTranslationProvider } from './dictionary';
import { GatewayTranslationProvider } from './gateway';
import { PublicTranslationProvider } from './public';
afterEach(() => vi.unstubAllGlobals());
it('feature detects browser translation and destroys the translator after use', async () => {
  vi.stubGlobal('Translator', undefined);
  const browser = new BrowserTranslationProvider(); expect(browser.isAvailable()).toBe(false);
  const destroy = vi.fn();
  vi.stubGlobal('Translator', { availability: vi.fn().mockResolvedValue('available'), create: vi.fn().mockResolvedValue({ translate: vi.fn().mockResolvedValue('điều kiện'), destroy }) });
  expect((await browser.translate({ text: 'condition', sourceLang: 'en', targetLang: 'vi' })).text).toBe('điều kiện');
  expect(destroy).toHaveBeenCalledOnce();
});
it('does not start model downloads during selection lookup', async () => {
  const create = vi.fn(); vi.stubGlobal('Translator', { availability: vi.fn().mockResolvedValue('downloadable'), create });
  await expect(new BrowserTranslationProvider().translate({ text: 'word', sourceLang: 'en', targetLang: 'vi' })).rejects.toMatchObject({ code: 'UNSUPPORTED_LANGUAGE' });
  expect(create).not.toHaveBeenCalled();
});
it('supports the minimum local EN/VI and VI/EN pairs', async () => {
  const dictionary = new DictionaryTranslationProvider();
  expect((await dictionary.translate({ text: 'prerequisite', sourceLang: 'en', targetLang: 'vi' })).text).toBe('điều kiện tiên quyết');
  expect((await dictionary.translate({ text: 'điều kiện tiên quyết', sourceLang: 'vi', targetLang: 'en' })).text).toBe('prerequisite');
});
it('validates gateway output and sends only selected text and language codes', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'translated' })));
  vi.stubGlobal('fetch', fetch);
  const provider = new GatewayTranslationProvider('google', 30, 'https://example.com/translate');
  await provider.translate({ text: 'selected', sourceLang: 'en', targetLang: 'vi' });
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ provider: 'google', text: 'selected', sourceLang: 'en', targetLang: 'vi' });
  fetch.mockResolvedValue(new Response(JSON.stringify({ wrong: true })));
  await expect(provider.translate({ text: 'selected', sourceLang: 'en', targetLang: 'vi' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('handles public provider quota and does not send oversized text', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ responseStatus: 200, quotaFinished: true, responseData: { translatedText: 'quota exhausted' } })));
  vi.stubGlobal('fetch', fetch);
  const provider = new PublicTranslationProvider();
  await expect(provider.translate({ text: 'hello', sourceLang: 'en', targetLang: 'vi' })).rejects.toMatchObject({ code: 'QUOTA' });
  await expect(provider.translate({ text: 'x'.repeat(501), sourceLang: 'en', targetLang: 'vi' })).rejects.toMatchObject({ code: 'UNSUPPORTED_LANGUAGE' });
  expect(fetch).toHaveBeenCalledTimes(1);
});
