import type { EngineSettings } from '../../settings/engines';
import { BrowserTranslationProvider } from './providers/browser';
import { DictionaryTranslationProvider, VocabularyTranslationProvider } from './providers/dictionary';
import { GatewayTranslationProvider } from './providers/gateway';
import type { TranslationProvider } from './types';
import { PublicTranslationProvider } from './providers/public';
import { ManagedTranslationProvider } from './providers/managed';
export function translationProviders(settings: EngineSettings): TranslationProvider[] {
  let providers: TranslationProvider[] = [];
  if (settings.browserTranslation) providers.push(new BrowserTranslationProvider());
  if (settings.offlineDictionary) providers.push(new DictionaryTranslationProvider(), new VocabularyTranslationProvider());
  const timeout = Math.max(200, Math.min(2000, settings.networkTimeoutMs));
  if (settings.publicTranslation) { const provider = new PublicTranslationProvider(); provider.timeoutMs = timeout; providers.push(provider); }
  if (settings.googleProvider) providers.push(new GatewayTranslationProvider('google', 30, settings.translationEndpoint, timeout));
  if (settings.bingProvider) providers.push(new GatewayTranslationProvider('bing', 40, settings.translationEndpoint, timeout));
  const order = new Map(settings.translationProviderOrder.map((id, index) => [id, index]));
  providers.sort((a, b) => (order.get(a.id as never) ?? 999) - (order.get(b.id as never) ?? 999));
  providers.forEach((provider, index) => { provider.priority = (index + 1) * 10; });
  // Deployment opt-in only. Existing standalone builds never call an undeployed API.
  if (settings.managedTranslation && import.meta.env.VITE_MANAGED_TRANSLATION === 'true') {
    providers.push(new ManagedTranslationProvider('/api/translate'));
    const managed = providers.at(-1)!;
    managed.priority = Math.max(0, ...providers.filter(p => !p.network).map(p => p.priority)) + 1;
  }
  if (settings.quickEngine === 'offline') return providers.filter(provider => ['dictionary', 'vocabulary'].includes(provider.id));
  if (settings.quickEngine !== 'auto') {
    const chosen = providers.find(provider => provider.id === settings.quickEngine);
    if (chosen) chosen.priority = 0;
    if (!settings.automaticFallback) providers = chosen ? [chosen] : [];
  }
  return providers;
}
