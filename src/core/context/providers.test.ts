import { afterEach, expect, it, vi } from 'vitest';
import { HostedLiteProvider } from './providers';
import { db } from '../../db/database';
import type { ContextInput } from './types';
afterEach(async () => { vi.unstubAllGlobals(); await db.settings.clear(); });
it('atomically reserves daily hosted quota and makes no request after exhaustion', async () => {
  const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ meaning: 'nghĩa theo ngữ cảnh', confidence: 0.9 }))); vi.stubGlobal('fetch', fetch);
  const input = { request: {}, mode: 'grammar', sourceLang: 'en', targetLang: 'vi' } as ContextInput;
  const provider = new HostedLiteProvider('https://example.com/context', 1);
  const responses = await Promise.allSettled([provider.explain(input), provider.explain(input)]);
  expect(responses.filter(response => response.status === 'fulfilled')).toHaveLength(1);
  expect(fetch).toHaveBeenCalledTimes(1);
  await expect(new HostedLiteProvider('https://example.com/context', 1).explain(input)).rejects.toMatchObject({ code: 'QUOTA' });
});
