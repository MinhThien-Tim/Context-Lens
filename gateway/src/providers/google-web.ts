import { boundedJson, GatewayError, type GatewayTranslationRequest } from '../protocol';
import type { GatewayTranslationProvider, GatewayTranslationResult } from './types';

/** Experimental upstream. No tokens, proxy rotation, retry or endpoint fan-out. */
export class GoogleWebProvider implements GatewayTranslationProvider {
  readonly id = 'google-web' as const;
  constructor(private transport: typeof fetch = fetch, private timeoutMs = 2000) {}
  isAvailable() { return true; }
  supports(input: GatewayTranslationRequest) { return input.sourceLang !== input.targetLang; }
  async translate(input: GatewayTranslationRequest, signal: AbortSignal): Promise<GatewayTranslationResult> {
    const url = new URL('https://translate.googleapis.com/translate_a/single');
    url.search = new URLSearchParams({ client: 'gtx', sl: input.sourceLang, tl: input.targetLang, dt: 't', q: input.text }).toString();
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), this.timeoutMs);
    try {
      const response = await this.transport(url, { signal: controller.signal, redirect: 'manual', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if ([403, 429].includes(response.status)) throw new GatewayError('UPSTREAM_BLOCKED');
      if (!response.ok) throw new GatewayError('PROVIDER_DOWN', 502);
      if (!response.headers.get('content-type')?.includes('json')) throw new GatewayError('INVALID_RESPONSE', 502);
      const raw = await boundedJson(response, 32_768);
      if (!Array.isArray(raw) || !Array.isArray(raw[0]) || !raw[0].length ||
        raw[0].some((segment: unknown) => !Array.isArray(segment) || typeof segment[0] !== 'string')) throw new GatewayError('INVALID_RESPONSE', 502);
      const text = raw[0].map((segment: string[]) => segment[0]).join('').trim();
      if (!text || text.length > 10_000) throw new GatewayError('INVALID_RESPONSE', 502);
      return { version: 1, text, detectedLang: input.sourceLang, provider: this.id };
    } catch (error) {
      if (signal.aborted) throw new GatewayError('CANCELLED', 499, 0);
      if (controller.signal.aborted) throw new GatewayError('TIMEOUT', 504);
      if (error instanceof GatewayError) {
        if (['INVALID_JSON', 'TOO_LARGE', 'INVALID_REQUEST'].includes(error.code)) throw new GatewayError('INVALID_RESPONSE', 502);
        throw error;
      }
      throw new GatewayError('PROVIDER_DOWN', 502);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  }
}
