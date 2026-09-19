import { cacheKey, normalizeText, type ResultCache } from '../cache';
import { checkAbort, EngineError, withDeadline } from '../errors';
import { SharedRequests } from '../requests';
import { ProviderHealthManager } from './provider-health';
import type { TranslationInput, TranslationProvider, TranslationResult } from './types';
export const TRANSLATION_VERSION = 'translation-v1';
export function translationKey(input: TranslationInput): string {
  return cacheKey([TRANSLATION_VERSION, normalizeText(input.text), input.sourceLang ?? 'auto', input.targetLang, input.mode ?? 'word']);
}
export class TranslationRouter {
  private requests = new SharedRequests<TranslationResult>();
  constructor(private providers: TranslationProvider[], private cache: ResultCache<TranslationResult>, readonly health = new ProviderHealthManager(), private fallback = true, private online = () => navigator.onLine) {}
  translate(input: TranslationInput): Promise<TranslationResult> {
    const key = translationKey(input);
    return this.requests.run(key, async signal => {
      checkAbort(signal);
      const cached = await this.cache.get(key);
      checkAbort(signal);
      if (cached) return { ...cached, sourceText: input.text, cached: true };
      const pair = `${input.sourceLang ?? 'auto'}>${input.targetLang}`;
      let lastError = new EngineError(this.online() ? 'UNSUPPORTED_LANGUAGE' : 'OFFLINE');
      for (const provider of [...this.providers].sort((a, b) => a.priority - b.priority)) {
        checkAbort(signal);
        if ((provider.network && !this.online()) || !provider.supports(input.sourceLang ?? 'auto', input.targetLang) || !this.health.available(provider.id, pair)) continue;
        const start = performance.now();
        try {
          const result = await withDeadline(async providerSignal => {
            if (!await provider.isAvailable()) return null;
            return provider.translate({ ...input, signal: providerSignal });
          }, provider.timeoutMs, signal);
          if (!result) continue;
          if (!result.text?.trim() || result.targetLang !== input.targetLang) throw new EngineError('INVALID_RESPONSE');
          checkAbort(signal);
          this.health.success(provider.id, pair);
          const normalized = { ...result, provider: provider.id, latencyMs: performance.now() - start };
          await this.cache.put(key, normalized, provider.id, pair);
          return normalized;
        } catch (error) {
          checkAbort(signal);
          lastError = error instanceof EngineError ? error : new EngineError('NETWORK');
          if (lastError.code !== 'UNSUPPORTED_LANGUAGE') this.health.failure(provider.id, pair);
          if (!this.fallback) break;
        }
      }
      throw lastError;
    }, input.signal);
  }
}
