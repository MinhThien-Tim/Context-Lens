// @vitest-environment node
import { expect, it, vi, afterEach } from 'vitest';
import worker, { TranslationGate } from './index';
import { reserve, type Ledger, type Store } from './quota';
import { translate } from './google';
import { validate } from './protocol';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('aborts a stalled upstream once at the deadline without retry', async () => {
  vi.useFakeTimers();
  const transport = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }));
  const task = translate(validate(input), transport);
  const assertion = expect(task).rejects.toMatchObject({ code: 'TIMEOUT', status: 504 });
  await vi.advanceTimersByTimeAsync(2001); await assertion;
  expect(transport).toHaveBeenCalledTimes(1);
});
const input = { text: 'Hello', sourceLang: 'en', targetLang: 'vi' };
function storage(): Store {
  let value: unknown; let tail = Promise.resolve();
  const s: Store = {
    get: async <T,>() => structuredClone(value) as T | undefined,
    put: async (_key, next) => { value = structuredClone(next); },
    transaction: work => { const result = tail.then(() => work(s)); tail = result.then(() => {}, () => {}); return result; }
  }; return s;
}
it('rejects oversized input, unsupported pairs and client provider/URL overrides', () => {
  for (const invalid of [{ ...input, text: 'a'.repeat(1001) }, { ...input, targetLang: 'en' }, { ...input, provider: 'google' }, { ...input, url: 'https://other' }]) expect(() => validate(invalid)).toThrow();
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
it('persists cooldown on blocking and does not retry or refund the attempt', async () => {
  const store = storage(); const fetchMock = vi.fn(async () => new Response('blocked', { status: 429 })); vi.stubGlobal('fetch', fetchMock);
  const make = () => new Request('https://internal', { method: 'POST', headers: { 'X-Client-Hash': 'a'.repeat(64) }, body: JSON.stringify(input) });
  await new TranslationGate({ storage: store }).fetch(make());
  expect((await new TranslationGate({ storage: store }).fetch(make())).status).toBe(503);
  expect(fetchMock).toHaveBeenCalledTimes(1); expect((await store.get<Ledger>('ledger'))?.requests).toBe(1);
});
it('normalizes multiple segments and rejects HTML challenges', async () => {
  const transport = vi.fn(async () => new Response(JSON.stringify([[['Xin '], ['chào']]]), { headers: { 'Content-Type': 'application/json' } }));
  expect((await translate(validate(input), transport)).text).toBe('Xin chào');
  const options = (transport.mock.calls as unknown as [URL, RequestInit][])[0][1];
  expect(options.redirect).toBe('manual');
  await expect(translate(validate(input), vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'https://other.invalid' } })))).rejects.toMatchObject({ code: 'PROVIDER_DOWN' });
  await expect(translate(validate(input), vi.fn(async () => new Response('<html>challenge</html>')))).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('rejects other origins and respects the kill switch before using the object', async () => {
  const env = { ONLINE_ENABLED: 'false', IP_HASH_SECRET: 'a'.repeat(32), ASSETS: { fetch: vi.fn() }, QUOTA: { idFromName: vi.fn(), get: vi.fn() } };
  expect((await worker.fetch(new Request('https://app/api/translate', { method: 'POST', headers: { Origin: 'https://other' } }), env)).status).toBe(403);
  expect((await worker.fetch(new Request('https://app/api/translate', { method: 'POST', headers: { Origin: 'https://app' } }), env)).status).toBe(503);
  expect(env.QUOTA.get).not.toHaveBeenCalled();
});
