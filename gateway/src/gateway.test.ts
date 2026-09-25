// @vitest-environment node
import { expect, it, vi, afterEach } from 'vitest';
import worker, { TranslationGate } from './index';
import { reserve, settle, type Ledger, type Store } from './quota';
import { GoogleWebProvider } from './providers/google-web';
import { GatewayError, validate } from './protocol';
import { GatewayProviderRouter } from './provider-router';
import type { GatewayTranslationProvider } from './providers/types';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('aborts a stalled upstream once at the deadline without retry', async () => {
  vi.useFakeTimers();
  const transport = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }));
  const task = new GoogleWebProvider(transport).translate(validate(input), new AbortController().signal);
  const assertion = expect(task).rejects.toMatchObject({ code: 'TIMEOUT', status: 504 });
  await vi.advanceTimersByTimeAsync(2001); await assertion;
  expect(transport).toHaveBeenCalledTimes(1);
});
it('reports upstream Google 429 without retrying', async () => {
  const transport = vi.fn(async () => new Response(null, { status: 429 }));
  await expect(new GoogleWebProvider(transport).translate(validate(input), new AbortController().signal)).rejects.toMatchObject({ code: 'UPSTREAM_BLOCKED', status: 429 });
  expect(transport).toHaveBeenCalledTimes(1);
});
it('retries one transient Google 5xx with bounded backoff', async () => {
  const transport = vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify([[['Xin chào', 'Hello']]]), { headers: { 'content-type': 'application/json' } }));
  const attempts = vi.fn();
  await expect(new GoogleWebProvider(transport).translate(validate(input), new AbortController().signal, attempts)).resolves.toMatchObject({ text: 'Xin chào' });
  expect(transport).toHaveBeenCalledTimes(2);
  expect(attempts).toHaveBeenCalledTimes(2);
});
const input = { version: 1 as const, provider: 'auto' as const, text: 'Hello', sourceLang: 'en' as const, targetLang: 'vi' as const, mode: 'word' as const };
function storage(): Store {
  let value: unknown; let tail = Promise.resolve();
  const s: Store = {
    get: async <T,>() => structuredClone(value) as T | undefined,
    put: async (_key, next) => { value = structuredClone(next); },
    transaction: work => { const result = tail.then(() => work(s)); tail = result.then(() => {}, () => {}); return result; }
  }; return s;
}
it('validates the versioned provider protocol and rejects reserved or unknown providers', () => {
  expect(validate({ ...input, mode: 'paragraph' })).toMatchObject({ version: 1, provider: 'auto', mode: 'paragraph' });
  for (const invalid of [
    { ...input, version: 2 }, { ...input, text: 'a'.repeat(1001) }, { ...input, targetLang: 'en' },
    { ...input, provider: 'google' }, { ...input, provider: 'google-cloud-v2' }, { ...input, mode: 'document' },
    { ...input, url: 'https://other' }
  ]) expect(() => validate(invalid)).toThrow();
});
it('does not exceed global request or character budgets and resets at UTC midnight', () => {
  const now = Date.UTC(2026, 8, 20); let ledger: Ledger | undefined;
  for (let i = 0; i < 500; i++) { ledger = reserve(ledger, `client${i}`, 1, now, String(i)); ledger.leases = {}; }
  expect(() => reserve(ledger, 'new-ip', 1, now, 'x')).toThrow('GLOBAL_QUOTA');
  expect(reserve(ledger, 'new-ip', 1, now + 86400000, 'x').requests).toBe(1);
  ledger!.requests = 1; ledger!.characters = 99999;
  expect(() => reserve(ledger, 'new-ip', 2, now, 'x')).toThrow('GLOBAL_QUOTA');
});
it('enforces rolling rate, daily per-IP cap and leases after reconstruction', () => {
  const now = Date.now(); let ledger: Ledger | undefined;
  for (let i = 0; i < 6; i++) { ledger = reserve(ledger, 'same', 10, now, String(i)); ledger.leases = {}; }
  expect(() => reserve(ledger, 'same', 1, now, '7')).toThrow('RATE_LIMIT');
  ledger!.clients.same.requests = 50;
  expect(() => reserve(ledger, 'same', 1, now + 61000, '8')).toThrow('DAILY_QUOTA');
  ledger = reserve(undefined, 'a', 1, now, 'a'); ledger = reserve(ledger, 'b', 1, now, 'b');
  expect(() => reserve(structuredClone(ledger), 'c', 1, now, 'c')).toThrow('BUSY');
  expect(reserve(ledger, 'c', 1, now + 31000, 'c').requests).toBe(3);
});
it('keeps the rolling per-IP limit across UTC midnight while resetting daily counters', () => {
  const beforeMidnight = Date.UTC(2026, 8, 20, 23, 59, 59);
  let ledger: Ledger | undefined;
  for (let i = 0; i < 6; i++) {
    ledger = reserve(ledger, 'same', 1, beforeMidnight, String(i));
    ledger.leases = {};
  }
  expect(() => reserve(ledger, 'same', 1, beforeMidnight + 2_000, 'next')).toThrow('RATE_LIMIT');
  const next = reserve(ledger, 'same', 1, beforeMidnight + 60_001, 'later');
  expect(next.requests).toBe(1);
  expect(next.clients.same.requests).toBe(1);
});
it('keeps cooldown health isolated by provider and restores it after a healthy call', () => {
  const now = Date.now();
  let ledger = reserve(undefined, 'client', 1, now, 'g1', 'google-web');
  ledger = settle(ledger, 'g1', 'google-web', new GatewayError('UPSTREAM_BLOCKED'), now);
  expect(() => reserve(ledger, 'client', 1, now, 'g2', 'google-web')).toThrow('PROVIDER_COOLDOWN');
  expect(() => reserve(ledger, 'client', 1, now, 'b1', 'bing-web')).not.toThrow();
  ledger = reserve(ledger, 'client', 1, ledger.providers['google-web']!.cooldown + 1, 'g3', 'google-web');
  ledger = settle(ledger, 'g3', 'google-web', undefined, ledger.providers['google-web']!.cooldown + 1);
  expect(ledger.providers['google-web']?.failures).toBe(0);
});
it('does not count cancellation as provider failure', () => {
  const now = Date.now();
  let ledger = reserve(undefined, 'client', 1, now, 'g1', 'google-web');
  ledger = settle(ledger, 'g1', 'google-web', new GatewayError('CANCELLED', 499, 0), now);
  expect(ledger.providers['google-web']).toEqual({ cooldown: 0, failures: 0 });
});
it('reserves at most two upstream calls under 100 concurrent requests across instances', async () => {
  const store = storage(); let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const fetchMock = vi.fn(async () => { await pending; return new Response(JSON.stringify([[['Xin chào']]]), { headers: { 'Content-Type': 'application/json' } }); });
  vi.stubGlobal('fetch', fetchMock);
  const calls = Array.from({ length: 100 }, (_, i) => new TranslationGate({ storage: store }).fetch(new Request('https://internal', { method: 'POST', headers: { 'X-Client-Hash': i.toString(16).padStart(64, '0') }, body: JSON.stringify(input) })));
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2)); finish();
  const responses = await Promise.all(calls);
  expect(responses.filter(r => r.ok)).toHaveLength(2);
  expect((await store.get<Ledger>('ledger'))?.requests).toBe(2);
});
it('fails closed on storage errors without sending text upstream', async () => {
  const store = storage(); store.transaction = async () => { throw new Error('storage'); };
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  const response = await new TranslationGate({ storage: store }).fetch(new Request('https://internal', { method: 'POST', headers: { 'X-Client-Hash': 'a'.repeat(64) }, body: JSON.stringify(input) }));
  expect(response.status).toBe(503); expect(fetchMock).not.toHaveBeenCalled();
});
it('rejects exhausted quota before calling the provider', async () => {
  const store = storage(); const now = Date.now(); let ledger: Ledger | undefined;
  for (let i = 0; i < 500; i++) { ledger = reserve(ledger, `client${i}`, 1, now, String(i)); ledger.leases = {}; }
  await store.put('ledger', ledger!);
  const translate = vi.fn();
  const google = mockProvider('google-web', translate);
  const response = await new TranslationGate({ storage: store }, [google]).fetch(new Request('https://internal', {
    method: 'POST', headers: { 'X-Client-Hash': 'a'.repeat(64) }, body: JSON.stringify(input)
  }));
  expect(response.status).toBe(429);
  expect(translate).not.toHaveBeenCalled();
});
it('fails a not-yet-available explicit provider without quota or upstream work', async () => {
  const store = storage(); const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  const response = await new TranslationGate({ storage: store }).fetch(new Request('https://internal', {
    method: 'POST', headers: { 'X-Client-Hash': 'a'.repeat(64) }, body: JSON.stringify({ ...input, provider: 'bing-web' })
  }));
  expect(response.status).toBe(503);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await store.get<Ledger>('ledger')).toBeUndefined();
});
it('persists cooldown on blocking and does not retry or refund the attempt', async () => {
  const store = storage(); const fetchMock = vi.fn(async () => new Response('blocked', { status: 429 })); vi.stubGlobal('fetch', fetchMock);
  const make = () => new Request('https://internal', { method: 'POST', headers: { 'X-Client-Hash': 'a'.repeat(64) }, body: JSON.stringify(input) });
  await new TranslationGate({ storage: store }).fetch(make());
  expect((await new TranslationGate({ storage: store }).fetch(make())).status).toBe(503);
  expect(fetchMock).toHaveBeenCalledTimes(1); expect((await store.get<Ledger>('ledger'))?.requests).toBe(1);
});
it('normalizes multiple segments and rejects HTML challenges', async () => {
  const transport = vi.fn(async () => new Response(JSON.stringify([[['Xin '], ['chào']]]), { headers: { 'Content-Type': 'application/json' } }));
  const provider = new GoogleWebProvider(transport);
  expect(await provider.translate(validate(input), new AbortController().signal)).toMatchObject({ version: 1, provider: 'google-web', text: 'Xin chào' });
  const options = (transport.mock.calls as unknown as [URL, RequestInit][])[0][1];
  expect(options.redirect).toBe('manual');
  await expect(new GoogleWebProvider(vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'https://other.invalid' } }))).translate(validate(input), new AbortController().signal)).rejects.toMatchObject({ code: 'PROVIDER_DOWN' });
  await expect(new GoogleWebProvider(vi.fn(async () => new Response('<html>challenge</html>'))).translate(validate(input), new AbortController().signal)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
function mockProvider(id: 'google-web' | 'bing-web', run: GatewayTranslationProvider['translate']): GatewayTranslationProvider {
  return { id, isAvailable: () => true, supports: () => true, translate: run };
}
it('auto routes sequentially, while manual selection never calls another provider', async () => {
  const order: string[] = [];
  const google = mockProvider('google-web', async () => { order.push('google-web'); throw new Error('down'); });
  const bing = mockProvider('bing-web', async request => { order.push('bing-web'); return { version: 1, provider: 'bing-web', text: 'Xin chào', detectedLang: request.sourceLang }; });
  const router = new GatewayProviderRouter([google, bing]);
  expect((await router.translate(validate(input), new AbortController().signal)).provider).toBe('bing-web');
  expect(order).toEqual(['google-web', 'bing-web']);
  order.length = 0;
  await expect(router.translate(validate({ ...input, provider: 'google-web' }), new AbortController().signal)).rejects.toBeTruthy();
  expect(order).toEqual(['google-web']);
});
it('preserves the primary failure when the fallback is unavailable and never falls back on global quota', async () => {
  const unavailable = { ...mockProvider('bing-web', vi.fn()), isAvailable: () => false };
  const down = mockProvider('google-web', async () => { throw new GatewayError('PROVIDER_DOWN', 502); });
  await expect(new GatewayProviderRouter([down, unavailable]).translate(validate(input), new AbortController().signal)).rejects.toMatchObject({ code: 'PROVIDER_DOWN' });
  const bing = vi.fn();
  const quota = mockProvider('google-web', async () => { throw new GatewayError('GLOBAL_QUOTA', 429); });
  await expect(new GatewayProviderRouter([quota, mockProvider('bing-web', bing)]).translate(validate(input), new AbortController().signal)).rejects.toMatchObject({ code: 'GLOBAL_QUOTA' });
  expect(bing).not.toHaveBeenCalled();
});
it('abort stops auto fallback', async () => {
  const controller = new AbortController(); const bing = vi.fn();
  const google = mockProvider('google-web', async () => { controller.abort(); throw new Error('cancelled'); });
  await expect(new GatewayProviderRouter([google, mockProvider('bing-web', bing)]).translate(validate(input), controller.signal)).rejects.toMatchObject({ code: 'CANCELLED' });
  expect(bing).not.toHaveBeenCalled();
});
it('rejects other origins and respects the kill switch before using the object', async () => {
  const env = { ONLINE_ENABLED: 'false', IP_HASH_SECRET: 'a'.repeat(32), ASSETS: { fetch: vi.fn() }, QUOTA: { idFromName: vi.fn(), get: vi.fn() } };
  expect((await worker.fetch(new Request('https://app/api/translate', { method: 'POST', headers: { Origin: 'https://other' } }), env)).status).toBe(403);
  expect((await worker.fetch(new Request('https://app/api/translate', { method: 'POST', headers: { Origin: 'https://app' } }), env)).status).toBe(503);
  expect(env.QUOTA.get).not.toHaveBeenCalled();
});
