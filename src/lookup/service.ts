import type { AiSettings } from '../settings/types';
import { defaultEngineSettings, type EngineSettings } from '../settings/engines';
import { db } from '../db/database';
import { EngineCache } from '../core/cache';
import { TranslationRouter, TRANSLATION_VERSION } from '../core/translation/router';
import { translationProviders } from '../core/translation/provider-registry';
import { ContextRouter, CONTEXT_VERSION } from '../core/context/context-router';
import { contextProviders } from '../core/context/providers';
import type { ContextMode, ContextResult } from '../core/context/types';
import type { TranslationResult } from '../core/translation/types';
import { localLookup } from './localDictionary';
import type { LookupRequest, LookupResponse } from './types';
import { applyExplanation } from '../core/context/adapter';
import type { ProviderHealthSnapshot } from '../core/translation/provider-health';
export { createProvider } from '../core/context/providers';

/** Compatibility facade: UI consumes normalized reading results, never provider payloads. */
export class LookupService {
  private translation?: TranslationRouter;
  private context?: ContextRouter;
  private signature = '';
  private ai?: AiSettings;
  private configure(settings: EngineSettings, ai?: AiSettings) {
    const signature = JSON.stringify(settings);
    if (signature !== this.signature) {
      this.signature = signature;
      this.translation = new TranslationRouter(translationProviders(settings), new EngineCache<TranslationResult>(db.translations, TRANSLATION_VERSION, settings.translationCacheLimit, settings.cacheTranslations), undefined, settings.automaticFallback);
      this.context = undefined;
    }
    if (ai && (!this.context || !this.ai || Object.keys(ai).some(key => ai[key as keyof AiSettings] !== this.ai![key as keyof AiSettings]))) {
      this.ai = { ...ai };
      this.context = new ContextRouter(contextProviders(settings, ai), new EngineCache<ContextResult>(db.contexts, CONTEXT_VERSION, settings.contextCacheLimit, settings.cacheContext), settings.automaticFallback, undefined, settings.cacheContext);
    }
  }
  immediate(request: LookupRequest, settings = defaultEngineSettings): LookupResponse { return localLookup(request, settings.offlineDictionary && settings.sourceLang === 'en'); }
  async quick(request: LookupRequest, settings = defaultEngineSettings, signal?: AbortSignal): Promise<LookupResponse> {
    this.configure(settings);
    const translated = await this.translation!.translate({ text: request.selection, sourceLang: settings.sourceLang, targetLang: settings.targetLang, mode: request.selection_type, signal });
    const base = this.immediate(request, settings);
    const translatedDefinition = settings.sourceLang === 'en' && settings.targetLang === 'en' ? translated.text : '';
    return { ...base, source: translated.cached ? 'cache' : translated.provider === 'browser' ? 'browser' : translated.offline ? 'offline' : 'translation',
      engine: { provider: translated.provider, cached: translated.cached, latencyMs: translated.latencyMs },
      quick: base.quick.lexical_unit ? base.quick : { definition_en: base.quick.definition_en || translated.dictionary?.definition || translatedDefinition,
        meaning_vi: settings.targetLang === 'vi' ? translated.dictionary?.meanings ?? [translated.text] : [], lexical_unit: null } };
  }
  async explain(request: LookupRequest, ai: AiSettings, settings = defaultEngineSettings, mode: ContextMode = 'meaning-in-context', signal?: AbortSignal): Promise<ContextResult & { result: LookupResponse }> {
    this.configure(settings, ai);
    const routed = await this.context!.explain({ request, sourceLang: settings.sourceLang, targetLang: settings.targetLang, mode, signal });
    const base = this.immediate(request, settings);
    const source = routed.cached ? 'cache' : routed.provider === 'offline' || routed.provider === 'dictionary' || routed.provider === 'heuristic' ? 'offline' : 'ai';
    return { ...routed, result: applyExplanation(base, routed.explanation, source, { provider: routed.provider, model: routed.model, cached: routed.cached, status: routed.status }) };
  }
  async contextual(request: LookupRequest, ai: AiSettings, signal?: AbortSignal): Promise<LookupResponse | null> {
    return (await this.explain(request, ai, defaultEngineSettings, request.context_mode ?? 'meaning-in-context', signal)).result;
  }
  diagnostics(): ProviderHealthSnapshot[] {
    return [...(this.translation?.health.snapshot() ?? []), ...(this.context?.health.snapshot() ?? [])];
  }
}
export const lookupService = new LookupService();
