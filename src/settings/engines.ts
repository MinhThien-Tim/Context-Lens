import { db } from '../db/database';
export interface EngineSettings {
  sourceLang: 'en' | 'vi';
  targetLang: 'en' | 'vi';
  quickEngine: 'auto' | 'browser' | 'google' | 'bing' | 'offline';
  contextEngine: 'auto' | 'user-api' | 'hosted-lite' | 'local';
  automaticFallback: boolean;
  cacheTranslations: boolean;
  cacheContext: boolean;
  browserTranslation: boolean;
  offlineDictionary: boolean;
  googleProvider: boolean;
  bingProvider: boolean;
  publicTranslation: boolean;
  experimentalProviders: boolean;
  hostedAiLite: boolean;
  userApi: boolean;
  localLlm: boolean;
  translationEndpoint: string;
  hostedEndpoint: string;
  localEndpoint: string;
  localModel: string;
  hostedDailyQuota: number;
  networkTimeoutMs: number;
  translationCacheLimit: number;
  contextCacheLimit: number;
  translationProviderOrder: TranslationProviderId[];
  contextProviderOrder: ContextProviderId[];
  debugMode: boolean;
}
export type TranslationProviderId = 'browser' | 'dictionary' | 'vocabulary' | 'mymemory' | 'google' | 'bing';
export type ContextProviderId = 'user-api' | 'hosted-lite' | 'local';
export const defaultTranslationProviderOrder: TranslationProviderId[] = ['browser', 'dictionary', 'vocabulary', 'mymemory', 'google', 'bing'];
export const defaultContextProviderOrder: ContextProviderId[] = ['user-api', 'hosted-lite', 'local'];
export const defaultEngineSettings: EngineSettings = {
  sourceLang: 'en', targetLang: 'vi', quickEngine: 'auto', contextEngine: 'auto', automaticFallback: true,
  cacheTranslations: true, cacheContext: true, browserTranslation: true, offlineDictionary: true,
  googleProvider: false, bingProvider: false, publicTranslation: false, experimentalProviders: false,
  hostedAiLite: false, userApi: true, localLlm: false,
  translationEndpoint: '', hostedEndpoint: '', localEndpoint: 'http://localhost:1234/v1', localModel: '',
  hostedDailyQuota: 20, networkTimeoutMs: 1200, translationCacheLimit: 5000, contextCacheLimit: 1000,
  translationProviderOrder: defaultTranslationProviderOrder, contextProviderOrder: defaultContextProviderOrder, debugMode: false
};
export async function loadEngineSettings(): Promise<EngineSettings> {
  const row = await db.settings.get('language-engines');
  const value = { ...defaultEngineSettings, ...(row?.value && typeof row.value === 'object' ? row.value : {}) } as EngineSettings;
  return { ...value, translationProviderOrder: mergeOrder(value.translationProviderOrder, defaultTranslationProviderOrder), contextProviderOrder: mergeOrder(value.contextProviderOrder, defaultContextProviderOrder) };
}
export async function saveEngineSettings(value: EngineSettings): Promise<void> {
  await db.settings.put({ key: 'language-engines', value });
}
function mergeOrder<T extends string>(stored: unknown, defaults: readonly T[]): T[] {
  const valid = Array.isArray(stored) ? stored.filter((id): id is T => typeof id === 'string' && defaults.includes(id as T)) : [];
  return [...new Set([...valid, ...defaults])];
}
