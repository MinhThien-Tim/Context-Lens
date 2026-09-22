import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/database';
import { translationProviders } from '../core/translation/provider-registry';
import { contextProviders } from '../core/context/providers';
import { defaultAiSettings } from './types';
import { defaultEngineSettings, loadEngineSettings } from './engines';

describe('engine settings', () => {
  afterEach(() => { vi.unstubAllEnvs(); return db.settings.clear(); });
  it('enables optional Wiktionary and Vietnamese web fallback by default', () => {
    expect(defaultEngineSettings.publicTranslation).toBe(true);
    expect(translationProviders(defaultEngineSettings).some(provider => provider.id === 'mymemory')).toBe(true);
  });
  it('enables managed online only in pilot builds, after local engines, with an offline opt-out', () => {
    vi.stubEnv('VITE_MANAGED_TRANSLATION', 'true');
    const providers = translationProviders(defaultEngineSettings).sort((a, b) => a.priority - b.priority);
    const managedIndex = providers.findIndex(provider => provider.id === 'online-auto');
    expect(managedIndex).toBeGreaterThan(providers.findIndex(provider => provider.id === 'vocabulary'));
    expect(managedIndex).toBeLessThan(providers.findIndex(provider => provider.id === 'mymemory'));
    expect(translationProviders({ ...defaultEngineSettings, managedTranslation: false }).some(p => p.id === 'online-auto')).toBe(false);
    expect(translationProviders({ ...defaultEngineSettings, onlineTranslationProvider: 'bing-web' }).some(p => p.id === 'bing-web')).toBe(true);
    expect(translationProviders({ ...defaultEngineSettings, quickEngine: 'offline' }).every(p => !p.network)).toBe(true);
  });
  it('merges missing provider ids when loading older settings', async () => {
    await db.settings.put({ key: 'language-engines', value: { publicTranslation: false, translationProviderOrder: ['dictionary'], contextProviderOrder: ['local'] } });
    const loaded = await loadEngineSettings();
    expect(loaded.publicTranslation).toBe(true);
    expect(loaded.webLookupDefaultsVersion).toBe(1);
    expect(loaded.translationProviderOrder[0]).toBe('dictionary');
    expect(loaded.translationProviderOrder).toContain('browser');
    expect(loaded.contextProviderOrder).toEqual(['local', 'user-api', 'hosted-lite']);
  });
  it('preserves a web lookup opt-out saved after the defaults migration', async () => {
    await db.settings.put({ key: 'language-engines', value: { ...defaultEngineSettings, publicTranslation: false } });
    expect((await loadEngineSettings()).publicTranslation).toBe(false);
  });
  it('keeps local context isolated from all network AI even with automatic fallback', () => {
    const providers = contextProviders({ ...defaultEngineSettings, contextEngine: 'local', hostedAiLite: true, hostedEndpoint: 'https://example.com' }, { ...defaultAiSettings, provider: 'gemini', apiKey: 'test' });
    expect(providers.every(provider => !provider.network)).toBe(true);
  });
  it('applies custom quick and context provider order', () => {
    const settings = { ...defaultEngineSettings, publicTranslation: true, translationProviderOrder: ['mymemory', 'dictionary', 'vocabulary', 'browser', 'google', 'bing'] as typeof defaultEngineSettings.translationProviderOrder,
      hostedAiLite: true, hostedEndpoint: 'https://example.com/context', localLlm: true, localModel: 'small', contextProviderOrder: ['local', 'hosted-lite', 'user-api'] as typeof defaultEngineSettings.contextProviderOrder };
    expect(translationProviders(settings).map(provider => provider.id).slice(0, 2)).toEqual(['mymemory', 'dictionary']);
    expect(contextProviders(settings, defaultAiSettings).map(provider => provider.id)).toEqual(['local', 'hosted-lite']);
  });
});
