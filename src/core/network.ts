import { EngineError } from './errors';
/** All optional gateways share this transport; no tokens or provider responses are logged. */
export async function postJson(endpoint: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const url = new URL(endpoint, location.origin);
  if (url.username || url.password) throw new EngineError('PROVIDER_DOWN');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new EngineError('PROVIDER_DOWN');
  return fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
}
export async function fetchJson(url: URL, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, { ...init, credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (response.status === 429 || response.status === 402) throw new EngineError('QUOTA');
  if (!response.ok) throw new EngineError('PROVIDER_DOWN');
  try { return await response.json(); } catch { throw new EngineError('INVALID_RESPONSE'); }
}
