import { boundedJson, GatewayError, type Input } from './protocol';
/** Experimental upstream. No tokens, proxy rotation, automatic retry or endpoint fan-out. */
export async function translate(input: Input, transport: typeof fetch = fetch) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.search = new URLSearchParams({ client: 'gtx', sl: input.sourceLang, tl: input.targetLang, dt: 't', q: input.text }).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await transport(url, { signal: controller.signal, redirect: 'manual', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if ([403, 429].includes(response.status)) throw new GatewayError('UPSTREAM_BLOCKED');
    if (!response.ok) throw new GatewayError('PROVIDER_DOWN', 502);
    if (!response.headers.get('content-type')?.includes('json')) throw new GatewayError('INVALID_RESPONSE', 502);
    const raw = await boundedJson(response, 32_768);
    if (!Array.isArray(raw) || !Array.isArray(raw[0]) || !raw[0].length ||
      raw[0].some((segment: unknown) => !Array.isArray(segment) || typeof segment[0] !== 'string')) throw new GatewayError('INVALID_RESPONSE', 502);
    const text = raw[0].map((segment: string[]) => segment[0]).join('').trim();
    if (!text || text.length > 10_000) throw new GatewayError('INVALID_RESPONSE', 502);
    return { text, detectedLang: input.sourceLang, provider: 'google-unofficial' };
  } catch (error) {
    if (controller.signal.aborted) throw new GatewayError('TIMEOUT', 504);
    if (error instanceof GatewayError) {
      if (['INVALID_JSON', 'TOO_LARGE', 'INVALID_REQUEST'].includes(error.code)) throw new GatewayError('INVALID_RESPONSE', 502);
      throw error;
    }
    throw new GatewayError('PROVIDER_DOWN', 502);
  } finally { clearTimeout(timer); }
}
