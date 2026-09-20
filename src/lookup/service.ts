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
import { LocalLanguageEngine } from '../core/language/local-language-engine';
import { applyLocalResult, selectionInput } from '../core/language/adapter';
import { checkAbort } from '../core/errors';
import { waitForWordNet } from '../core/language/wordnet';
import { LexicalEngine } from '../core/language/lexicon';
import { PhraseDetector } from '../core/language/phrases';
import { SentenceAnalysisCache, SentenceEngine } from '../core/language/sentence-engine';
export { createProvider } from '../core/context/providers';

/** Compatibility facade: UI consumes normalized reading results, never provider payloads. */
export class LookupService {
  private local = new LocalLanguageEngine();
  private translation?: TranslationRouter;
  private context?: ContextRouter;
  private signature = '';
  private ai?: AiSettings;
  private configure(settings: EngineSettings, ai?: AiSettings) {
    const signature = JSON.stringify(settings);
    if (signature !== this.signature) {
      this.signature = signature;
      const lexical = new LexicalEngine();
      const phrases = new PhraseDetector(undefined, lexical);
      this.local = new LocalLanguageEngine(lexical, phrases, new SentenceEngine(lexical, phrases, new SentenceAnalysisCache(db, 1000, settings.cacheSentenceAnalysis)));
      this.translation = new TranslationRouter(translationProviders(settings), new EngineCache<TranslationResult>(db.translations, TRANSLATION_VERSION, settings.translationCacheLimit, settings.cacheTranslations), undefined, settings.automaticFallback);
      this.context = undefined;
    }
    if (ai && (!this.context || !this.ai || Object.keys(ai).some(key => ai[key as keyof AiSettings] !== this.ai![key as keyof AiSettings]))) {
      this.ai = { ...ai };
      this.context = new ContextRouter(contextProviders(settings, ai), new EngineCache<ContextResult>(db.contexts, CONTEXT_VERSION, settings.contextCacheLimit, settings.cacheContext), settings.automaticFallback, undefined, settings.cacheContext, this.local);
    }
  }
  immediate(request: LookupRequest, settings = defaultEngineSettings): LookupResponse { return localLookup(request, settings.offlineDictionary && settings.sourceLang === 'en'); }
  async quick(request: LookupRequest, settings = defaultEngineSettings, signal?: AbortSignal, onLocal?: (result: LookupResponse) => void): Promise<LookupResponse> {
    checkAbort(signal);
    this.configure(settings);
    let base = this.immediate(request, settings);
    if (settings.offlineDictionary && settings.sourceLang === 'en') {
      await waitForWordNet();
      checkAbort(signal);
      const lens = await this.local.analyzeSelection(selectionInput(request, settings.sourceLang, settings.targetLang));
      checkAbort(signal);
      base = applyLocalResult(base, lens);
      onLocal?.(base);
      const complete = Boolean(lens.english?.definition && (settings.targetLang === 'en' || lens.vietnamese?.meaning));
      if (settings.quickEngine === 'offline' || (complete && lens.confidence >= 0.6 && settings.quickEngine === 'auto')) return base;
    }
    let translated: TranslationResult;
    try { translated = await this.translation!.translate({ text: request.selection, sourceLang: settings.sourceLang, targetLang: settings.targetLang, mode: request.selection_type, signal }); }
    catch (error) { checkAbort(signal); if (base.difficulty.worth_learning) return base; throw error; }
    const translatedDefinition = settings.sourceLang === 'en' && settings.targetLang === 'en' ? translated.text : '';
    return { ...base, source: translated.cached ? 'cache' : translated.provider === 'browser' ? 'browser' : translated.offline ? 'offline' : 'translation',
      engine: { provider: translated.provider, cached: translated.cached, latencyMs: translated.latencyMs },
      quick: base.quick.lexical_unit ? base.quick : { definition_en: (base.difficulty.worth_learning ? base.quick.definition_en : '') || translated.dictionary?.definition || translatedDefinition,
        meaning_vi: settings.targetLang === 'vi' ? translated.dictionary?.meanings ?? [translated.text] : [], lexical_unit: null } };
  }
  async explain(request: LookupRequest, ai: AiSettings, settings = defaultEngineSettings, mode: ContextMode = 'meaning-in-context', signal?: AbortSignal): Promise<ContextResult & { result: LookupResponse }> {
    this.configure(settings, ai);
    const routed = await this.context!.explain({ request, sourceLang: settings.sourceLang, targetLang: settings.targetLang, mode, signal, aiRequested: ai.provider !== 'none' && ai.provider !== 'demo' });
    const base = settings.offlineDictionary && settings.sourceLang === 'en'
      ? applyLocalResult(this.immediate(request, settings), await this.local.analyzeSelection(selectionInput(request, settings.sourceLang, settings.targetLang))) : this.immediate(request, settings);
    checkAbort(signal);
    const source = routed.cached ? 'cache' : !routed.model && ['offline', 'dictionary', 'heuristic', 'local', 'unresolved'].includes(routed.provider) ? 'offline' : 'ai';
    return { ...routed, result: applyExplanation(base, routed.explanation, source, { provider: routed.provider, model: routed.model, cached: routed.cached, status: routed.status }) };
  }
  /** Explicit sentence translation: shares the router cache, never runs on scroll. */
  async translateSentence(request: LookupRequest, settings = defaultEngineSettings, signal?: AbortSignal): Promise<TranslationResult> {
    this.configure(settings);
    const result = await this.translation!.translate({ text: request.sentence, sourceLang: settings.sourceLang, targetLang: settings.targetLang, mode: 'sentence', signal });
    checkAbort(signal);
    if (settings.sourceLang === 'en' && settings.targetLang === 'vi') await this.local.rememberSentenceTranslation(request.sentence, result.text);
    checkAbort(signal);
    return result;
  }
  async contextual(request: LookupRequest, ai: AiSettings, signal?: AbortSignal): Promise<LookupResponse | null> {
    return (await this.explain(request, ai, defaultEngineSettings, request.context_mode ?? 'meaning-in-context', signal)).result;
  }
  diagnostics(): ProviderHealthSnapshot[] {
    return [...(this.translation?.health.snapshot() ?? []), ...(this.context?.health.snapshot() ?? [])];
  }
}
export const lookupService = new LookupService();
