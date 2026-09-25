import { boundedJson, GatewayError, type GatewayTranslationRequest } from '../protocol';
import type { GatewayTranslationProvider, GatewayTranslationResult } from './types';

/** Experimental upstream. No tokens, proxy rotation, retry or endpoint fan-out. */
export class GoogleWebProvider implements GatewayTranslationProvider {
  readonly id = 'google-web' as const;
  constructor(private transport: typeof fetch = fetch, private timeoutMs = 2000) {}
  isAvailable() { return true; }
  supports(input: GatewayTranslationRequest) { return input.sourceLang !== input.targetLang; }
  async translate(input: GatewayTranslationRequest, signal: AbortSignal, onRequest: () => void = () => {}): Promise<GatewayTranslationResult> {
    const url = new URL('https://translate.googleapis.com/translate_a/single');
    url.search = new URLSearchParams({ client: 'gtx', sl: input.sourceLang, tl: input.targetLang, dt: 't', q: input.text }).toString();
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), this.timeoutMs);
    try {
      const request = () => { onRequest(); return this.transport(url, { signal: controller.signal, redirect: 'manual', credentials: 'omit', referrerPolicy: 'no-referrer' }); };
      let response: Response;
      try {
        response = await request();
      } catch (error) {
        if (controller.signal.aborted) throw error;
        await backoff(controller.signal);
        response = await request();
      }
      if (response.status >= 500) {
        await backoff(controller.signal);
        response = await request();
      }
      if (response.status === 429) throw new GatewayError('UPSTREAM_BLOCKED', 429, 60);
      if (response.status === 403) throw new GatewayError('UPSTREAM_BLOCKED', 503, 60);
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

function backoff(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 100 + Math.random() * 100);
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
  });
}
