import { cacheKey, normalizeText, type ResultCache } from '../cache';
import { checkAbort, withDeadline } from '../errors';
import { SharedRequests } from '../requests';
import { ProviderHealthManager } from '../translation/provider-health';
import { localLookup } from '../../lookup/localDictionary';
import { findContextLookup } from '../../lookup/cacheRepository';
import { createContextCacheKey } from '../../lookup/cache';
import { boundedContext } from './prompt-builder';
import { estimateComplexity } from './complexity-estimator';
import { heuristicContext } from './heuristic';
import type { ContextInput, ContextProvider, ContextResult } from './types';
import { explanationFromLookup } from './adapter';
export const CONTEXT_VERSION = 'context-v4';
export function contextKey(input: ContextInput, family: string): string {
  return cacheKey([CONTEXT_VERSION, normalizeText(input.request.selection), normalizeText(input.request.sentence), input.request.previous_sentence, input.request.next_sentence,
    input.sourceLang, input.targetLang, input.request.language_mode, input.mode, family]);
}
export class ContextRouter {
  private requests = new SharedRequests<ContextResult>();
  readonly health = new ProviderHealthManager();
  constructor(private providers: ContextProvider[], private cache: ResultCache<ContextResult>, private fallback = true, private online = () => navigator.onLine, private legacyCache = false) {}
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
        if (cached) return { ...cached, cached: true };
      }
      if (this.legacyCache && (!this.online() || !this.providers.length) && input.mode === 'meaning-in-context' && input.sourceLang === 'en' && input.targetLang === 'vi') {
        for (const promptVersion of [CONTEXT_VERSION, 'context-v2']) {
          const key = await createContextCacheKey({ selection: input.request.selection, sentence: input.request.sentence, languageMode: input.request.language_mode, promptVersion });
          const result = await findContextLookup(key).catch(() => null);
          checkAbort(signal);
          if (result) return { explanation: explanationFromLookup(result), provider: 'legacy-cache', cached: true };
        }
      }
      const heuristic = heuristicContext(input);
      const complexity = estimateComplexity(input.request.selection, input.request.sentence);
      const simple = input.mode === 'meaning-in-context' && input.sourceLang === 'en' && complexity.level === 'simple';
      if (heuristic || simple) {
        const result = heuristic ?? { explanation: explanationFromLookup(localLookup(input.request)), provider: 'dictionary' };
        await this.cache.put(localKey, result, result.provider, pair);
        return result;
      }
      let status: ContextResult['status'] = this.online() ? 'unavailable' : 'offline';
      for (const provider of this.providers) {
        checkAbort(signal);
        if ((provider.network && !this.online()) || !this.health.available(provider.id, pair)) continue;
        try {
          const explanation = await withDeadline(providerSignal => provider.explain({ ...input, signal: providerSignal }), 20_000, signal);
          checkAbort(signal);
          this.health.success(provider.id, pair);
          const response: ContextResult = { explanation, provider: provider.id, model: provider.model };
          await this.cache.put(contextKey(input, `${provider.family}:${provider.model}`), response, provider.id, pair);
          await this.cache.put(availableKey, response, provider.id, pair);
          return response;
        } catch (error) {
          checkAbort(signal);
          if (error && typeof error === 'object' && 'code' in error && ['QUOTA', 'quota', 'rate_limit'].includes(String(error.code))) status = 'quota';
          this.health.failure(provider.id, pair);
          if (!this.fallback) break;
        }
      }
      const cached = await this.cache.get(availableKey);
      if (cached) return { ...cached, cached: true, status };
      return { explanation: explanationFromLookup(localLookup(input.request)), provider: 'offline', status };
    }, raw.signal);
  }
}
