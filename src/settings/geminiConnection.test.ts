import { afterEach, describe, expect, it, vi } from 'vitest';
import { testGeminiConnection } from './geminiConnection';

describe('Gemini connection test', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('verifies structured JSON with a tiny fixed prompt sent directly to Google', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await testGeminiConnection(' secret ', 'gemini-3.6-flash')).toBe('ready');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent');
    expect(url).not.toContain('secret');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('secret');
    expect(init.body).toContain('responseJsonSchema');
    expect(init.body).toContain('"temperature":0.1');
    expect(init.body).not.toContain('selection');
    expect(init.body).not.toContain('document');
  });

  it.each([
    [401, '', 'invalid-key'],
    [400, JSON.stringify({ error: { details: [{ reason: 'API_KEY_INVALID' }] } }), 'invalid-key'],
    [404, '', 'model-unavailable'],
    [429, '', 'quota'],
    [400, '', 'structured-unavailable'],
    [200, JSON.stringify({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }), 'structured-unavailable']
  ] as const)('maps HTTP %i to %s', async (status, body, expected) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status })));
    expect(await testGeminiConnection('key', 'model')).toBe(expected);
  });

  it('maps failed fetch to a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await testGeminiConnection('key', 'model')).toBe('network');
  });

  it('maps its deadline to a friendly timeout status and passes an abort signal', async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await testGeminiConnection('key', 'model', undefined, 5)).toBe('timeout');
    expect(fetchMock.mock.calls[0][1].signal).toBeDefined();
  });

  it('does not convert user cancellation into a timeout', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const pending = testGeminiConnection('key', 'model', controller.signal, 1000);
    controller.abort();
    expect(await pending).toBe('cancelled');
  });
});
