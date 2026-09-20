import { boundedJson, GatewayError, json, validate } from './protocol';
import { GatewayProviderRouter } from './provider-router';
import { BingWebProvider } from './providers/bing-web';
import { GoogleWebProvider } from './providers/google-web';
import type { GatewayTranslationProvider } from './providers/types';
import { reserve, settle, type Ledger, type Store } from './quota';
interface Env {
  ONLINE_ENABLED: string; IP_HASH_SECRET: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
  QUOTA: { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> } };
}
export class TranslationGate {
  constructor(private ctx: { storage: Store }, private providers: GatewayTranslationProvider[] = [new GoogleWebProvider(), new BingWebProvider()]) {}
  async fetch(request: Request): Promise<Response> {
    try {
      const input = validate(await boundedJson(request, 8192));
      const client = request.headers.get('X-Client-Hash');
      if (!client || !/^[a-f0-9]{64}$/.test(client)) throw new GatewayError('INVALID_REQUEST', 400);
      const router = new GatewayProviderRouter(this.providers);
      return json(await router.translate(input, request.signal, async provider => {
        const reservation = crypto.randomUUID();
        let failure: GatewayError | undefined;
        try {
          await this.ctx.storage.transaction(async tx => {
            const previous = await tx.get<Ledger>('ledger');
            await tx.put('ledger', reserve(previous, client, [...input.text].length, Date.now(), reservation, provider.id));
          });
        } catch (error) {
          if (error instanceof GatewayError) throw error;
          throw new GatewayError('UNAVAILABLE');
        }
        try { return await provider.translate(input, request.signal); }
        catch (error) { failure = error instanceof GatewayError ? error : new GatewayError('UNAVAILABLE'); throw failure; }
        finally {
          // Failed attempts are not refunded; only their concurrency lease is released.
          await this.ctx.storage.transaction(async tx => {
            const ledger = await tx.get<Ledger>('ledger');
            if (ledger) await tx.put('ledger', settle(ledger, reservation, provider.id, failure, Date.now()));
          }).catch(() => {});
        }
      }));
    } catch (error) {
      const failure = error instanceof GatewayError ? error : new GatewayError('UNAVAILABLE');
      return json({ error: { code: failure.code } }, failure.status, failure.retryAfter);
    }
  }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (url.pathname !== '/api/translate') return json({ error: { code: 'NOT_FOUND' } }, 404);
    if (request.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
    if (request.headers.get('Origin') !== url.origin) return json({ error: { code: 'ORIGIN' } }, 403);
    if (env.ONLINE_ENABLED !== 'true' || !env.IP_HASH_SECRET || env.IP_HASH_SECRET.length < 32) return json({ error: { code: 'DISABLED' } }, 503);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: { code: 'CONTENT_TYPE' } }, 415);
    try {
      const ip = request.headers.get('CF-Connecting-IP');
      if (!ip) throw new GatewayError('UNAVAILABLE');
      const input = validate(await boundedJson(request, 8192));
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.IP_HASH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const hash = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${new Date().toISOString().slice(0, 10)}:${ip}`));
      const client = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
      return await env.QUOTA.get(env.QUOTA.idFromName('global-pilot-v1')).fetch(new Request('https://internal/translate', {
        method: 'POST', headers: { 'X-Client-Hash': client }, body: JSON.stringify(input), signal: request.signal
      }));
    } catch (error) {
      const e = error instanceof GatewayError ? error : new GatewayError('UNAVAILABLE');
      return json({ error: { code: e.code } }, e.status, e.retryAfter);
    }
  }
};
