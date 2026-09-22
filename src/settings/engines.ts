import { db } from '../db/database';
export interface EngineSettings {
  webLookupDefaultsVersion: number;
  sourceLang: 'en' | 'vi';
  targetLang: 'en' | 'vi';
  quickEngine: 'auto' | 'browser' | 'google' | 'bing' | 'offline';
  contextEngine: 'auto' | 'user-api' | 'hosted-lite' | 'local';
  automaticFallback: boolean;
  cacheTranslations: boolean;
  cacheContext: boolean;
  cacheSentenceAnalysis: boolean;
  browserTranslation: boolean;
  offlineDictionary: boolean;
  googleProvider: boolean;
  bingProvider: boolean;
  publicTranslation: boolean;
  managedTranslation: boolean;
  onlineTranslationProvider: OnlineTranslationProvider;
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
export type OnlineTranslationProvider = 'auto' | 'google-web' | 'bing-web';
export type TranslationProviderId = 'browser' | 'dictionary' | 'vocabulary' | 'mymemory' | 'google' | 'bing';
export type ContextProviderId = 'user-api' | 'hosted-lite' | 'local';
export const defaultTranslationProviderOrder: TranslationProviderId[] = ['browser', 'dictionary', 'vocabulary', 'mymemory', 'google', 'bing'];
export const defaultContextProviderOrder: ContextProviderId[] = ['user-api', 'hosted-lite', 'local'];
export const defaultEngineSettings: EngineSettings = {
  webLookupDefaultsVersion: 1,
  sourceLang: 'en', targetLang: 'vi', quickEngine: 'auto', contextEngine: 'auto', automaticFallback: true,
  cacheTranslations: true, cacheContext: true, cacheSentenceAnalysis: true, browserTranslation: true, offlineDictionary: true,
  googleProvider: false, bingProvider: false, publicTranslation: true, managedTranslation: true, onlineTranslationProvider: 'auto', experimentalProviders: false,
  hostedAiLite: false, userApi: true, localLlm: false,
  translationEndpoint: '', hostedEndpoint: '', localEndpoint: 'http://localhost:1234/v1', localModel: '',
  hostedDailyQuota: 20, networkTimeoutMs: 2500, translationCacheLimit: 5000, contextCacheLimit: 1000,
  translationProviderOrder: defaultTranslationProviderOrder, contextProviderOrder: defaultContextProviderOrder, debugMode: false
};
export async function loadEngineSettings(): Promise<EngineSettings> {
  const row = await db.settings.get('language-engines');
  const stored = row?.value && typeof row.value === 'object' ? row.value as Partial<EngineSettings> : {};
  // Older builds stored the then-default `false`, which is indistinguishable
  // from an explicit opt-out. Migrate once; subsequent user choices carry v1.
  const migrated = stored.webLookupDefaultsVersion === undefined
    ? { ...stored, publicTranslation: true, webLookupDefaultsVersion: 1 }
    : stored;
  const value = { ...defaultEngineSettings, ...migrated } as EngineSettings;
  return { ...value, translationProviderOrder: mergeOrder(value.translationProviderOrder, defaultTranslationProviderOrder), contextProviderOrder: mergeOrder(value.contextProviderOrder, defaultContextProviderOrder) };
}
export async function saveEngineSettings(value: EngineSettings): Promise<void> {
  await db.settings.put({ key: 'language-engines', value });
}
function mergeOrder<T extends string>(stored: unknown, defaults: readonly T[]): T[] {
  const valid = Array.isArray(stored) ? stored.filter((id): id is T => typeof id === 'string' && defaults.includes(id as T)) : [];
  return [...new Set([...valid, ...defaults])];
}
