import type { AiSettings } from '../settings/types';
import { defaultEngineSettings, type EngineSettings } from '../settings/engines';
import { db } from '../db/database';
import { EngineCache } from '../core/cache';
import { TranslationRouter, TRANSLATION_VERSION, translationKey } from '../core/translation/router';
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
import { senseVietnameseMeanings } from '../core/language/sense-meanings';
import { applyLocalResult, selectionInput } from '../core/language/adapter';
import { checkAbort } from '../core/errors';
import { LexicalEngine } from '../core/language/lexicon';
import { PhraseDetector } from '../core/language/phrases';
import { SentenceAnalysisCache, SentenceEngine } from '../core/language/sentence-engine';
import { ensureLocalDictionaryAssets, localAssetStatus } from './localAssets';
import { lookupWebDictionary } from './webDictionary';
import { recordDiagnostic } from '../core/diagnostics';
import { ManagedTranslationProvider } from '../core/translation/providers/managed';
export { createProvider } from '../core/context/providers';

/** Compatibility facade: UI consumes normalized reading results, never provider payloads. */
export class LookupService {
  private local = new LocalLanguageEngine();
  private translation?: TranslationRouter;
  private wordFallback?: TranslationRouter;
  private googleContext?: TranslationRouter;
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
      this.wordFallback = new TranslationRouter(translationProviders(settings).filter(provider => !['google', 'google-web', 'online-auto'].includes(provider.id)),
        new EngineCache<TranslationResult>(db.translations, TRANSLATION_VERSION, settings.translationCacheLimit, settings.cacheTranslations), undefined, settings.automaticFallback);
      this.googleContext = new TranslationRouter([
        ...translationProviders(settings).filter(provider => ['google', 'google-web'].includes(provider.id)),
        ...(settings.managedTranslation && import.meta.env.VITE_MANAGED_TRANSLATION === 'true' ? [new ManagedTranslationProvider('/api/translate', 'google-web')] : [])
      ],
        new EngineCache<TranslationResult>(db.translations, TRANSLATION_VERSION, settings.translationCacheLimit, settings.cacheTranslations), undefined, false);
      this.context = undefined;
    }
    if (ai && (!this.context || !this.ai || Object.keys(ai).some(key => ai[key as keyof AiSettings] !== this.ai![key as keyof AiSettings]))) {
      this.ai = { ...ai };
      this.context = new ContextRouter(contextProviders(settings, ai), new EngineCache<ContextResult>(db.contexts, CONTEXT_VERSION, settings.contextCacheLimit, settings.cacheContext), settings.automaticFallback, undefined, settings.cacheContext, this.local, ai.provider === 'gemini' && Boolean(ai.apiKey));
    }
  }
  immediate(request: LookupRequest, settings = defaultEngineSettings): LookupResponse { return localLookup(request, settings.offlineDictionary && settings.sourceLang === 'en'); }
  async quick(request: LookupRequest, settings = defaultEngineSettings, signal?: AbortSignal, onLocal?: (result: LookupResponse) => void, initial?: LookupResponse): Promise<LookupResponse> {
    checkAbort(signal);
    recordDiagnostic('quickLookup', { text: request.selection_type === 'sentence' ? undefined : request.selection, mode: request.selection_type });
    this.configure(settings);
    let base = initial ?? this.immediate(request, settings);
    let cachedSelection: TranslationResult | null = null;
    let localFinished = false;
    const withCachedSelection = (): LookupResponse => {
      // Cached entry-level glosses are provisional, never context evidence or sense pairs.
      const meanings = cachedSelection && settings.targetLang === 'vi' && !base.quick.meaning_vi.length
        ? cachedSelection.dictionary?.meanings ?? [cachedSelection.text] : [];
      return cachedSelection ? { ...base,
        source: 'cache', engine: { provider: cachedSelection.provider, cached: true },
        dictionary: meanings.length ? addUnpairedTranslations(base.dictionary, meanings) : base.dictionary,
        quick: { ...base.quick, meaning_vi: base.quick.meaning_vi.length ? base.quick.meaning_vi : meanings,
          definition_en: base.quick.definition_en || cachedSelection.dictionary?.definition || (settings.targetLang === 'en' ? cachedSelection.text : '') }
      } : base;
    };
    const publish = () => { checkAbort(signal); onLocal?.(withCachedSelection()); };
    publish();
    const cachedReady = optionalTranslationEnabled(settings)
      ? (request.selection_type !== 'sentence' && settings.quickEngine === 'auto' ? this.wordFallback! : this.translation!).cached({ text: request.selection, sourceLang: settings.sourceLang, targetLang: settings.targetLang, mode: request.selection_type })
        .then(cached => { if (!localFinished && !signal?.aborted && cached) { cachedSelection = cached; publish(); } })
      : Promise.resolve();
    let cachedSentence = false;
    if (settings.offlineDictionary && settings.sourceLang === 'en') {
      const assetsWereReady = localAssetStatus() === 'ready';
      // Independent local I/O overlaps; neither is allowed to hide the base result.
      const sentenceCache = settings.cacheTranslations && request.selection_type !== 'sentence' && settings.targetLang === 'vi' && request.sentence.trim()
        ? db.translations.get(translationKey({ text: request.sentence, sourceLang: settings.sourceLang, targetLang: settings.targetLang, mode: 'sentence' })).catch(() => undefined)
        : Promise.resolve(undefined);
      await ensureLocalDictionaryAssets(!assetsWereReady ? () => {
        if (signal?.aborted) return;
        base = this.immediate(request, settings);
        publish();
      } : undefined).catch(() => { /* Curated and any successfully loaded source remain usable. */ });
      checkAbort(signal);
      if (settings.cacheTranslations && request.selection_type !== 'sentence' && settings.sourceLang === 'en' && settings.targetLang === 'vi' && request.sentence.trim()) {
        const row = await sentenceCache;
        checkAbort(signal);
        if (row?.version === TRANSLATION_VERSION && row.result.text) {
          await this.local.rememberSentenceTranslation(request.sentence, row.result.text);
          recordDiagnostic('translationCacheHit', { provider: row.provider, mode: 'sentence' });
          cachedSentence = true;
        }
      }
      const lens = await this.local.analyzeSelection(selectionInput(request, settings.sourceLang, settings.targetLang));
      checkAbort(signal);
      base = applyLocalResult(base, lens);
      const complete = Boolean(lens.english?.definition && (settings.targetLang === 'en' || lens.vietnamese?.meaning));
      // Let the surface progressively enrich the synchronous result instead of
      // holding useful local content behind a network fallback.
      publish();
      if (settings.quickEngine === 'offline' || (complete && settings.quickEngine === 'auto' && !selectedMissingSense(base))) { localFinished = true; recordDiagnostic('localStop', { text: request.selection_type === 'sentence' ? undefined : request.selection, provider: 'dictionary', mode: request.selection_type }); return base; }
      // Device offline state is authoritative: do not start remote enrichment requests.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { localFinished = true; return base; }
      await cachedReady;
      checkAbort(signal);
      if (settings.sourceLang === 'en' && settings.targetLang === 'vi' && selectedMissingSense(base) && optionalTranslationEnabled(settings)) return this.fillSelectedSense(base, settings, signal);
      const cachedBase = withCachedSelection();
      if (cachedSelection && settings.quickEngine === 'auto' && cachedBase.quick.definition_en && cachedBase.quick.meaning_vi.length) return cachedBase;
      if (!cachedSentence && request.selection_type !== 'sentence' && settings.sourceLang === 'en' && settings.targetLang === 'vi' && this.googleContext && request.sentence.trim() && this.googleContextProviderAvailable(settings)) {
        try {
          const translated = await this.googleContext.translate({ text: request.sentence, sourceLang: settings.sourceLang, targetLang: settings.targetLang, mode: 'sentence', signal });
          checkAbort(signal);
          await this.local.rememberSentenceTranslation(request.sentence, translated.text);
          const reranked = await this.local.analyzeSelection(selectionInput(request, settings.sourceLang, settings.targetLang));
          base = applyLocalResult(base, reranked);
          publish();
          if (reranked.dictionary?.senses.some(sense => sense.contextMatch && senseVietnameseMeanings(sense).length)) {
            recordDiagnostic('googleContextResolved', { provider: translated.provider, mode: request.selection_type });
            return base;
          }
          recordDiagnostic('googleUnresolved', { provider: translated.provider, mode: request.selection_type });
        } catch (error) { checkAbort(signal); recordDiagnostic('googleUnresolved', { provider: 'google', mode: request.selection_type }); }
      }
      if (settings.automaticFallback && settings.publicTranslation && settings.targetLang === 'vi') {
        const web = await lookupWebDictionary(lens.selection.lemma, request.selection, settings.networkTimeoutMs, signal);
        checkAbort(signal);
        if (web) {
          recordDiagnostic('wiktionary', { text: request.selection_type === 'sentence' ? undefined : request.selection, provider: 'wiktionary', mode: request.selection_type, status: 'used' });
          const merged = mergeDictionaryResult(base, web);
          const reranked = await this.local.analyzeSelection(selectionInput(request, settings.sourceLang, settings.targetLang), merged.dictionary!.senses);
          checkAbort(signal);
          base = applyWebRerank(merged, reranked);
          if (web.webCached) base = { ...base, engine: { ...base.engine!, cached: true } };
          publish();
          if (base.quick.definition_en && base.quick.meaning_vi.length) return base;
        }
      }
    }
    await cachedReady;
    checkAbort(signal);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return base;
    if (!optionalTranslationEnabled(settings)) return base;
    if (request.selection_type !== 'sentence' && settings.quickEngine === 'auto' && base.quick.meaning_vi.length) return base;
    let translated: TranslationResult;
    try { translated = await (request.selection_type !== 'sentence' && settings.quickEngine === 'auto' ? this.wordFallback! : this.translation!).translate({ text: request.selection, sourceLang: settings.sourceLang, targetLang: settings.targetLang, mode: request.selection_type, signal,
      localContext: base.dictionary ? { lemma: base.dictionary.lemma, pos: base.dictionary.contextPos, meaningsVi: [...base.dictionary.senses.flatMap(senseVietnameseMeanings), ...(base.dictionary.unpairedMeaningsVi ?? [])],
        contextConfidence: base.dictionary.contextConfidence, senseConfidence: base.dictionary.senseConfidence } : undefined }); }
    catch { checkAbort(signal); return base; }
    const translatedDefinition = settings.sourceLang === 'en' && settings.targetLang === 'en' ? translated.text : '';
    const translatedMeanings = settings.targetLang === 'vi' ? translated.dictionary?.meanings ?? [translated.text] : [];
    const dictionary = translatedMeanings.length ? addUnpairedTranslations(base.dictionary, translatedMeanings) : base.dictionary;
    return { ...base, dictionary, source: translated.cached ? 'cache' : translated.provider === 'browser' ? 'browser' : translated.offline ? 'offline' : 'translation',
      engine: { provider: translated.provider, cached: translated.cached, latencyMs: translated.latencyMs },
      quick: base.quick.lexical_unit ? base.quick : { definition_en: (base.difficulty.worth_learning ? base.quick.definition_en : '') || translated.dictionary?.definition || translatedDefinition,
        meaning_vi: translatedMeanings, lexical_unit: null } };
  }
  private async fillSelectedSense(base: LookupResponse, settings: EngineSettings, signal?: AbortSignal): Promise<LookupResponse> {
    const sense = selectedMissingSense(base);
    if (!sense) return base;
    try {
      const translated = await this.wordFallback!.translate({ text: sense.definitionEn, sourceLang: 'en', targetLang: 'vi', mode: 'sentence', signal });
      checkAbort(signal);
      if (!translated.text.trim() || translated.text.trim().toLowerCase() === sense.definitionEn.trim().toLowerCase()) return base;
      const dictionary = { ...base.dictionary!, senses: base.dictionary!.senses.map(item => item.id === sense.id ? { ...item, meaningsVi: [translated.text], pairingState: 'paired' as const, alignment: { kind: 'translated-definition' as const, confidence: 'low' as const, evidence: [translated.provider], dependsOnSenseId: sense.id } } : item) };
      return { ...base, dictionary,
        lens: base.lens ? { ...base.lens, dictionary, vietnamese: { meaning: translated.text, contextualMeaning: sense.contextMatch ? translated.text : undefined, senseAligned: true } } : undefined,
        quick: { ...base.quick, meaning_vi: [translated.text] }, source: translated.cached ? 'cache' : translated.offline ? 'offline' : 'translation',
        engine: { provider: translated.provider, cached: translated.cached, latencyMs: translated.latencyMs } };
    } catch { checkAbort(signal); return base; }
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
    return [...(this.translation?.health.snapshot() ?? []), ...(this.googleContext?.health.snapshot() ?? []), ...(this.context?.health.snapshot() ?? [])];
  }
  private googleContextProviderAvailable(settings: EngineSettings): boolean {
    return settings.quickEngine === 'auto' && (settings.googleProvider || (settings.managedTranslation && import.meta.env.VITE_MANAGED_TRANSLATION === 'true'));
  }
}
export const lookupService = new LookupService();

export function mergeDictionaryResult(base: LookupResponse, web: NonNullable<LookupResponse['dictionary']>): LookupResponse {
  const local = base.dictionary;
  const seen = new Set<string>();
  const senses = [...(local?.senses ?? []), ...web.senses].map(sense => ({ ...sense,
    meaningsVi: uniqueMeanings(sense.meaningsVi) })).filter(sense => {
      if (!sense.definitionEn && !sense.meaningsVi.length) return false;
      const key = `${sense.pos.trim().toLocaleLowerCase()}|${sense.definitionEn.normalize('NFC').toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  const unpairedMeaningsVi = uniqueMeanings([...(local?.unpairedMeaningsVi ?? []), ...(web.unpairedMeaningsVi ?? [])]);
  const dictionary = { ...web, ...local, surfaceForm: base.selection.surface, senses, unpairedMeaningsVi };
  const first = senses[0];
  const meanings = [...senses.flatMap(sense => sense.meaningsVi), ...unpairedMeaningsVi];
  return { ...base, dictionary, source: 'web', engine: { provider: 'wiktionary-web', cached: false },
    quick: { ...base.quick, definition_en: base.quick.definition_en || first?.definitionEn || '', meaning_vi: base.quick.meaning_vi.length ? base.quick.meaning_vi : meanings.slice(0, 4) },
    difficulty: { ...base.difficulty, worth_learning: Boolean(first?.definitionEn || meanings.length) } };
}

function applyWebRerank(base: LookupResponse, lens: NonNullable<LookupResponse['lens']>): LookupResponse {
  const dictionary = lens.dictionary ? { ...lens.dictionary,
    unpairedMeaningsVi: base.dictionary?.unpairedMeaningsVi,
    vietnameseReferences: base.dictionary?.vietnameseReferences,
    pronunciation: base.dictionary?.pronunciation ?? lens.dictionary.pronunciation } : base.dictionary;
  const selected = dictionary?.senses[0];
  const selectedMeaning = selected ? senseVietnameseMeanings(selected) : [];
  const contextualDefinition = selected?.contextMatch ? selected.definitionEn : undefined;
  const nextLens = { ...lens, dictionary,
    english: selected?.definitionEn ? { ...lens.english, definition: selected.definitionEn, contextualDefinition } : lens.english,
    vietnamese: selectedMeaning.length ? { meaning: selectedMeaning.join(' / '), contextualMeaning: selected?.contextMatch ? selectedMeaning.join(' / ') : undefined, senseAligned: true }
      : base.lens?.vietnamese?.senseAligned === false ? base.lens.vietnamese : undefined };
  return { ...base, lens: nextLens, dictionary, confidence: lens.confidence,
    selection: { ...base.selection, part_of_speech: dictionary?.contextPos ?? base.selection.part_of_speech },
    quick: base.quick.lexical_unit ? base.quick : { ...base.quick, definition_en: selected?.definitionEn ?? base.quick.definition_en,
      meaning_vi: selectedMeaning.length ? selectedMeaning : selected?.contextMatch ? (dictionary?.unpairedMeaningsVi ?? []) : base.quick.meaning_vi },
    deep: { ...base.deep, context_explanation_en: contextualDefinition ?? '',
      context_explanation_vi: selected?.contextMatch ? selectedMeaning.join(' / ') : '' } };
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

function selectedMissingSense(base: LookupResponse) {
  if (base.selection.selection_type === 'sentence') return undefined;
  const senses = base.dictionary?.senses ?? [];
  const selected = senses.find(sense => sense.contextMatch) ?? (senses.length === 1 ? senses[0] : undefined);
  return selected?.definitionEn && !senseVietnameseMeanings(selected).length &&
    !(base.dictionary?.unpairedMeaningsVi ?? []).some(meaning => meaning.trim() &&
      !base.dictionary?.vietnameseReferences?.some(ref => ref.status === 'unresolved' && ref.text.trim() === meaning.trim())) ? selected : undefined;
}
