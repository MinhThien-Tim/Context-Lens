import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/database';
import { lookupWebDictionary } from './webDictionary';

describe('web dictionary request guardrails', () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    await db.settings.where('key').startsWith('dictionary:web:').delete();
  });

  it('uses only Wiktionary and shares concurrent requests', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request) => new Response(JSON.stringify({ en: [{ partOfSpeech: 'noun', definitions: [{ definition: 'a test definition' }] }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const [first, second] = await Promise.all([
      lookupWebDictionary('test', 'test', 1000),
      lookupWebDictionary('test', 'Test', 1000)
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('en.wiktionary.org');
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('mymemory');
    expect(first?.senses[0].definitionEn).toBe('a test definition');
    expect(second?.surfaceForm).toBe('Test');
  });

  it('negative-caches misses', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request) => new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    await lookupWebDictionary('notaword', 'notaword', 1000);
    await lookupWebDictionary('notaword', 'notaword', 1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
