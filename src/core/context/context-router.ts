import { cacheKey, normalizeText, type ResultCache } from '../cache';
import { checkAbort, withDeadline } from '../errors';
import { SharedRequests } from '../requests';
import { ProviderHealthManager } from '../translation/provider-health';
import { findContextLookup } from '../../lookup/cacheRepository';
import { createContextCacheKey } from '../../lookup/cache';
import { boundedContext } from './prompt-builder';
import { estimateComplexity } from './complexity-estimator';
import { heuristicContext } from './heuristic';
import type { ContextInput, ContextProvider, ContextResult } from './types';
import { explanationFromLookup } from './adapter';
import { LocalLanguageEngine } from '../language/local-language-engine';
import { selectionInput } from '../language/adapter';
import { applyLocalResult } from '../language/adapter';
import { localLookup } from '../../lookup/localDictionary';
import { recordAiUsage } from '../../ai/usage';
import { recordDiagnostic } from '../diagnostics';
export const CONTEXT_VERSION = 'context-v5';
export function contextKey(input: ContextInput, family: string): string {
  return cacheKey([CONTEXT_VERSION, normalizeText(input.request.selection), normalizeText(input.request.sentence), input.request.previous_sentence, input.request.next_sentence, input.request.paragraph,
    input.sourceLang, input.targetLang, input.request.language_mode, input.mode, family, input.aiRequested ?? false]);
}
export class ContextRouter {
  private requests = new SharedRequests<ContextResult>();
  readonly health = new ProviderHealthManager();
  constructor(private providers: ContextProvider[], private cache: ResultCache<ContextResult>, private fallback = true, private online = () => navigator.onLine, private legacyCache = false, private local = new LocalLanguageEngine(), private gemini = false) {}
  explain(raw: ContextInput): Promise<ContextResult> {
    const input = boundedContext(raw);
    const families = this.providers.map(provider => `${provider.family}:${provider.model}`);
    return this.requests.run(contextKey(input, families.join('|')), async signal => {
      input.signal = signal;
      const pair = `${input.sourceLang}>${input.targetLang}`;
      const localKey = contextKey(input, 'local');
      const availableKey = contextKey(input, 'available');
      // Keep exact model identity online, but make previous useful results available offline or without AI.
      const keys = !this.online() || !this.providers.length ? [availableKey, localKey] : [...families.map(family => contextKey(input, family)), localKey];
      for (const key of keys) {
        const cached = await this.cache.get(key);
        checkAbort(signal);
        if (cached) {
          const diagnostic = { text: input.request.selection_type === 'sentence' ? undefined : input.request.selection, provider: cached.provider, mode: input.mode };
          recordDiagnostic('contextCacheHit', diagnostic);
          if (this.gemini && cached.provider === 'user-api') recordDiagnostic('geminiCacheHit', { ...diagnostic, provider: 'gemini' });
          await recordAiUsage({ provider: cached.provider, model: cached.model ?? 'unknown', task: input.mode, latencyMs: 0, cacheHit: true });
          return { ...cached, cached: true };
        }
      }
      if (this.legacyCache && (!this.online() || !this.providers.length) && input.mode === 'meaning-in-context' && input.sourceLang === 'en' && input.targetLang === 'vi') {
        for (const promptVersion of [CONTEXT_VERSION, 'context-v4', 'context-v2']) {
          const key = await createContextCacheKey({ selection: input.request.selection, sentence: input.request.sentence, languageMode: input.request.language_mode, promptVersion });
          const result = await findContextLookup(key).catch(() => null);
          checkAbort(signal);
          if (result) return { explanation: explanationFromLookup(result), provider: 'legacy-cache', cached: true };
        }
      }
      const local = input.localResult ?? (input.sourceLang === 'en' ? await this.local.analyzeSelection(selectionInput(input.request, input.sourceLang, input.targetLang)) : undefined);
      checkAbort(signal);
      const localLookupResult = local ? applyLocalResult(localLookup(input.request), local) : localLookup(input.request);
      const heuristic = heuristicContext(input);
      const complexity = estimateComplexity(input.request.selection, input.request.sentence);
      const simple = input.mode === 'meaning-in-context' && input.sourceLang === 'en' && complexity.level === 'simple';
      if (!input.aiRequested && (heuristic || simple)) {
        const result = heuristic ?? { explanation: explanationFromLookup(localLookupResult), provider: 'dictionary' };
        await this.cache.put(localKey, result, result.provider, pair);
        return result;
      }
      if (local?.sense && !input.aiRequested && input.mode === 'meaning-in-context' && local.confidence >= 0.6) {
        const result: ContextResult = { explanation: { meaning: input.targetLang === 'vi' ? local.vietnamese?.contextualMeaning ?? local.vietnamese?.meaning : local.english?.definition,
          sense: local.english?.definition, whyHere: local.sense.reasons.join('; '), confidence: local.confidence }, provider: 'local' };
        await this.cache.put(localKey, result, 'local', pair);
        return result;
      }
      let status: ContextResult['status'] = this.online() ? 'unavailable' : 'offline';
      for (const provider of this.providers) {
        checkAbort(signal);
        if ((provider.network && !this.online()) || !this.health.available(provider.id, pair)) continue;
        try {
          if (this.gemini && provider.id === 'user-api' && provider.network) recordDiagnostic('geminiRequest', { text: input.request.selection_type === 'sentence' ? undefined : input.request.selection, provider: 'gemini', mode: input.mode, status: 'request' });
          const explanation = await withDeadline(providerSignal => provider.explain({ ...input, signal: providerSignal }), 20_000, signal);
          checkAbort(signal);
          this.health.success(provider.id, pair);
          const response: ContextResult = { explanation, provider: provider.id, model: provider.model };
          await this.cache.put(contextKey(input, `${provider.family}:${provider.model}`), response, provider.id, pair);
          await this.cache.put(availableKey, response, provider.id, pair);
          return response;
        } catch (error) {
          checkAbort(signal);
          const rawCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
          const code = rawCode.toLowerCase();
          const externalStop = ['auth', 'quota', 'rate_limit'].includes(code) && !(code === 'quota' && error instanceof Error && error.name === 'EngineError');
          if (['quota', 'rate_limit'].includes(code)) status = 'quota';
          this.health.failure(provider.id, pair);
          if (externalStop) break;
          if (!this.fallback) break;
        }
      }
      const cached = await this.cache.get(availableKey);
      if (cached) return { ...cached, cached: true, status };
      if (local?.sense && local.confidence >= 0.6) return { explanation: {
        meaning: input.targetLang === 'vi' ? local.vietnamese?.meaning : local.english?.definition,
        sense: local.english?.definition, whyHere: local.sense.reasons.join('; '), confidence: local.confidence,
        grammar: local.grammar?.pattern ? { pattern: local.grammar.pattern, explanation: local.grammar.role ?? '' } : undefined
      }, provider: 'local', status };
      return { explanation: {
        meaning: input.targetLang === 'vi' ? 'Chưa thể xác định nghĩa theo ngữ cảnh này với độ tin cậy đủ cao.' : 'The contextual meaning could not be determined with enough confidence.',
        confidence: 0
      }, provider: 'unresolved', status };
    }, raw.signal);
  }
}
