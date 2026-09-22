import { afterEach, expect, it, vi } from 'vitest';
import { BrowserTranslationProvider } from './browser';
import { DictionaryTranslationProvider, VocabularyTranslationProvider } from './dictionary';
import { GatewayTranslationProvider } from './gateway';
import { PublicTranslationProvider } from './public';
import { optionalTranslationEnabled } from '../provider-registry';
import { defaultEngineSettings } from '../../../settings/engines';
afterEach(() => vi.unstubAllGlobals());
it('does not enable optional translation when every corresponding feature is off', () => {
  expect(optionalTranslationEnabled({ ...defaultEngineSettings, browserTranslation: false, publicTranslation: false,
    googleProvider: false, bingProvider: false, managedTranslation: false })).toBe(false);
});
it('never presents Vietnamese saved vocabulary as an English definition or a composed sentence', async () => {
  expect(new VocabularyTranslationProvider().supports('en', 'en')).toBe(false);
  await expect(new DictionaryTranslationProvider().translate({ text: 'prerequisite', sourceLang: 'en', targetLang: 'vi', mode: 'sentence' })).rejects.toMatchObject({ code: 'UNSUPPORTED_LANGUAGE' });
});
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
  expect((await dictionary.translate({ text: 'lòng tin', sourceLang: 'vi', targetLang: 'en' })).text).toBe('confidence');
});
it('returns an English definition for EN to EN without replacing it with Vietnamese', async () => {
  const dictionary = new DictionaryTranslationProvider();
  const result = await dictionary.translate({ text: 'prerequisite', sourceLang: 'en', targetLang: 'en' });
  expect(result.text).toContain('required before');
  expect(result.dictionary?.definition).toBe(result.text);
  expect(result.text).not.toContain('tiên quyết');
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
