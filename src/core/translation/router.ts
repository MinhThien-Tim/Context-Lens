import { cacheKey, normalizeText, type ResultCache } from '../cache';
import { checkAbort, EngineError, withDeadline } from '../errors';
import { SharedRequests } from '../requests';
import { ProviderHealthManager } from './provider-health';
import { evaluatePublicTranslationQuality } from './public-quality';
import { recordDiagnostic } from '../diagnostics';
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
      if (cached) { recordDiagnostic('cacheHit', { provider: cached.provider }); return { ...cached, sourceText: input.text, cached: true }; }
      const pair = `${input.sourceLang ?? 'auto'}>${input.targetLang}`;
      let lastError = new EngineError(this.online() ? 'UNSUPPORTED_LANGUAGE' : 'OFFLINE');
      let deferred: TranslationResult | undefined;
      let googleFallbackAttempted = false;
      for (const provider of [...this.providers].sort((a, b) => a.priority - b.priority)) {
        checkAbort(signal);
        if ((provider.network && !this.online()) || !provider.supports(input.sourceLang ?? 'auto', input.targetLang) || !this.health.available(provider.id, pair)) continue;
        const googleManaged = provider.id === 'online-auto' || provider.id === 'google-web' || provider.id === 'google';
        const start = performance.now();
        try {
          const result = await withDeadline(async providerSignal => {
            if (!await provider.isAvailable()) return null;
            if (googleManaged && !googleFallbackAttempted) { googleFallbackAttempted = true; recordDiagnostic('googleFallback', { provider: provider.id }); }
            return provider.translate({ ...input, signal: providerSignal });
          }, provider.timeoutMs, signal);
          if (!result) continue;
          if (!result.text?.trim() || result.targetLang !== input.targetLang) throw new EngineError('INVALID_RESPONSE');
          checkAbort(signal);
          this.health.success(provider.id, pair);
          const normalized = { ...result, provider: provider.id, latencyMs: performance.now() - start };
          if (provider.id === 'mymemory') {
            const quality = evaluatePublicTranslationQuality(input, normalized, input.localContext);
            recordDiagnostic(quality === 'accept' ? 'mymemoryAccept' : quality === 'uncertain' ? 'mymemoryUncertain' : 'mymemoryReject', { latencyMs: normalized.latencyMs, status: quality });
            if (quality === 'reject') { lastError = new EngineError('INVALID_RESPONSE'); continue; }
            if (quality === 'uncertain' && this.fallback) { deferred = normalized; continue; }
          }
          await this.cache.put(key, normalized, provider.id, pair);
          return normalized;
        } catch (error) {
          checkAbort(signal);
          lastError = error instanceof EngineError ? error : new EngineError('NETWORK');
          if (lastError.code !== 'UNSUPPORTED_LANGUAGE') this.health.failure(provider.id, pair);
          if (!this.fallback) break;
        }
      }
      if (deferred) {
        checkAbort(signal);
        if (!googleFallbackAttempted && this.online()) {
          const google = [...this.providers].sort((a, b) => a.priority - b.priority).find(provider =>
            ['online-auto', 'google-web', 'google'].includes(provider.id) && provider.network && provider.supports(input.sourceLang ?? 'auto', input.targetLang) && this.health.available(provider.id, pair));
          if (google) {
            const start = performance.now();
            try {
              const result = await withDeadline(async providerSignal => {
                if (!await google.isAvailable()) return null;
                if (!googleFallbackAttempted) { googleFallbackAttempted = true; recordDiagnostic('googleFallback', { provider: google.id }); }
                return google.translate({ ...input, signal: providerSignal });
              }, google.timeoutMs, signal);
              checkAbort(signal);
              if (result?.text?.trim() && result.targetLang === input.targetLang) {
                this.health.success(google.id, pair);
                const normalized = { ...result, provider: google.id, latencyMs: performance.now() - start };
                await this.cache.put(key, normalized, google.id, pair);
                return normalized;
              }
            } catch (error) {
              checkAbort(signal);
              lastError = error instanceof EngineError ? error : new EngineError('NETWORK');
              this.health.failure(google.id, pair);
            }
          }
        }
        await this.cache.put(key, deferred, deferred.provider, pair);
        return deferred;
      }
      throw lastError;
    }, input.signal);
  }
}
