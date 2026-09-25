import type { AiSettings } from '../settings/types';
import { defaultEngineSettings, type EngineSettings } from '../settings/engines';
import { db } from '../db/database';
import { EngineCache } from '../core/cache';
import { TranslationRouter, TRANSLATION_VERSION } from '../core/translation/router';
import { optionalTranslationEnabled, translationProviders } from '../core/translation/provider-registry';
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
import { LexicalEngine } from '../core/language/lexicon';
import { PhraseDetector } from '../core/language/phrases';
import { SentenceAnalysisCache, SentenceEngine } from '../core/language/sentence-engine';
import { ensureLocalDictionaryAssets } from './localAssets';
import { lookupWebDictionary } from './webDictionary';
import { recordDiagnostic } from '../core/diagnostics';
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
      this.context = new ContextRouter(contextProviders(settings, ai), new EngineCache<ContextResult>(db.contexts, CONTEXT_VERSION, settings.contextCacheLimit, settings.cacheContext), settings.automaticFallback, undefined, settings.cacheContext, this.local, ai.provider === 'gemini' && Boolean(ai.apiKey));
    }
  }
  immediate(request: LookupRequest, settings = defaultEngineSettings): LookupResponse { return localLookup(request, settings.offlineDictionary && settings.sourceLang === 'en'); }
  async quick(request: LookupRequest, settings = defaultEngineSettings, signal?: AbortSignal, onLocal?: (result: LookupResponse) => void): Promise<LookupResponse> {
    checkAbort(signal);
    recordDiagnostic('quickLookup', { text: request.selection_type === 'sentence' ? undefined : request.selection, mode: request.selection_type });
    this.configure(settings);
    let base = this.immediate(request, settings);
    if (settings.offlineDictionary && settings.sourceLang === 'en') {
      await ensureLocalDictionaryAssets().catch(() => { /* Curated and any successfully loaded source remain usable. */ });
      checkAbort(signal);
      const lens = await this.local.analyzeSelection(selectionInput(request, settings.sourceLang, settings.targetLang));
      checkAbort(signal);
      base = applyLocalResult(base, lens);
      const complete = Boolean(lens.english?.definition && (settings.targetLang === 'en' || lens.vietnamese?.meaning));
      // Let the surface progressively enrich the synchronous result instead of
      // holding useful local content behind a network fallback.
      onLocal?.(base);
      if (settings.quickEngine === 'offline' || (complete && lens.confidence >= 0.6 && settings.quickEngine === 'auto')) { recordDiagnostic('localStop', { text: request.selection_type === 'sentence' ? undefined : request.selection, provider: 'dictionary', mode: request.selection_type }); return base; }
      if (settings.automaticFallback && settings.publicTranslation && settings.targetLang === 'vi') {
        const web = await lookupWebDictionary(lens.selection.lemma, request.selection, settings.networkTimeoutMs, signal);
        if (web) {
          recordDiagnostic('wiktionary', { text: request.selection_type === 'sentence' ? undefined : request.selection, provider: 'wiktionary', mode: request.selection_type, status: 'used' });
          base = mergeDictionaryResult(base, web);
          if (base.quick.definition_en && base.quick.meaning_vi.length) return base;
        }
      }
    }
    if (!optionalTranslationEnabled(settings)) return base;
    let translated: TranslationResult;
    try { translated = await this.translation!.translate({ text: request.selection, sourceLang: settings.sourceLang, targetLang: settings.targetLang, mode: request.selection_type, signal,
      localContext: base.dictionary ? { lemma: base.dictionary.lemma, pos: base.dictionary.contextPos, meaningsVi: [...base.dictionary.senses.flatMap(s => s.meaningsVi), ...(base.dictionary.unpairedMeaningsVi ?? [])],
        contextConfidence: base.dictionary.contextConfidence, senseConfidence: base.dictionary.senseConfidence } : undefined }); }
    catch (error) { checkAbort(signal); if (base.difficulty.worth_learning) return base; throw error; }
    const translatedDefinition = settings.sourceLang === 'en' && settings.targetLang === 'en' ? translated.text : '';
    const translatedMeanings = settings.targetLang === 'vi' ? translated.dictionary?.meanings ?? [translated.text] : [];
    const dictionary = translatedMeanings.length ? addUnpairedTranslations(base.dictionary, translatedMeanings) : base.dictionary;
    return { ...base, dictionary, source: translated.cached ? 'cache' : translated.provider === 'browser' ? 'browser' : translated.offline ? 'offline' : 'translation',
      engine: { provider: translated.provider, cached: translated.cached, latencyMs: translated.latencyMs },
      quick: base.quick.lexical_unit ? base.quick : { definition_en: (base.difficulty.worth_learning ? base.quick.definition_en : '') || translated.dictionary?.definition || translatedDefinition,
        meaning_vi: translatedMeanings, lexical_unit: null } };
  }
  async explain(request: LookupRequest, ai: AiSettings, settings = defaultEngineSettings, mode: ContextMode = 'meaning-in-context', signal?: AbortSignal): Promise<ContextResult & { result: LookupResponse }> {
    if (ai.provider === 'gemini' && ai.apiKey) recordDiagnostic('geminiAction', { text: request.selection_type === 'sentence' ? undefined : request.selection, provider: 'gemini', mode, status: mode });
    this.configure(settings, ai);
    if (settings.offlineDictionary && settings.sourceLang === 'en') await ensureLocalDictionaryAssets().catch(() => {});
    const local = settings.offlineDictionary && settings.sourceLang === 'en'
      ? await this.local.analyzeSelection(selectionInput(request, settings.sourceLang, settings.targetLang)) : undefined;
    const base = local ? applyLocalResult(this.immediate(request, settings), local) : this.immediate(request, settings);
    const aiRequested = (settings.userApi || settings.hostedAiLite || settings.localLlm) && ai.provider !== 'none' && ai.provider !== 'demo';
    const routed = await this.context!.explain({ request, sourceLang: settings.sourceLang, targetLang: settings.targetLang, mode, signal, aiRequested, localResult: local });
    checkAbort(signal);
    const source = routed.cached ? 'cache' : !routed.model && ['offline', 'dictionary', 'heuristic', 'local', 'unresolved'].includes(routed.provider) ? 'offline' : 'ai';
    return { ...routed, result: applyExplanation(base, routed.explanation, source, { provider: routed.provider, model: routed.model, cached: routed.cached, status: routed.status }, settings.targetLang) };
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

function mergeDictionaryResult(base: LookupResponse, web: NonNullable<LookupResponse['dictionary']>): LookupResponse {
  const local = base.dictionary;
  const senses = [...(local?.senses ?? []), ...web.senses].map(sense => ({ ...sense,
    meaningsVi: uniqueMeanings(sense.meaningsVi) })).filter(sense => sense.definitionEn || sense.meaningsVi.length);
  const unpairedMeaningsVi = uniqueMeanings([...(local?.unpairedMeaningsVi ?? []), ...(web.unpairedMeaningsVi ?? [])]);
  const dictionary = { ...web, ...local, surfaceForm: base.selection.surface, senses, unpairedMeaningsVi };
  const first = senses[0];
  const meanings = [...senses.flatMap(sense => sense.meaningsVi), ...unpairedMeaningsVi];
  return { ...base, dictionary, source: 'translation', engine: { provider: 'wiktionary-web', cached: false },
    quick: { ...base.quick, definition_en: base.quick.definition_en || first?.definitionEn || '', meaning_vi: base.quick.meaning_vi.length ? base.quick.meaning_vi : meanings.slice(0, 4) },
    difficulty: { ...base.difficulty, worth_learning: Boolean(first?.definitionEn || meanings.length) } };
}

function addUnpairedTranslations(dictionary: LookupResponse['dictionary'], meaningsVi: string[]): LookupResponse['dictionary'] {
  if (!dictionary) return dictionary;
  return { ...dictionary, unpairedMeaningsVi: uniqueMeanings([...(dictionary.unpairedMeaningsVi ?? []), ...meaningsVi]) };
}

function uniqueMeanings(meanings: string[]): string[] {
  const seen = new Set<string>();
  return meanings.filter(meaning => { const key = meaning.normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) return false; seen.add(key); return true; });
}
