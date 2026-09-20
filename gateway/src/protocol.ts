export class GatewayError extends Error {
  constructor(readonly code: string, readonly status = 503, readonly retryAfter = 60) { super(code); }
}
export function json(value: unknown, status = 200, retryAfter?: number): Response {
  return new Response(JSON.stringify(value), { status, headers: {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {})
  } });
}
export async function boundedJson(response: Request | Response, maxBytes: number): Promise<unknown> {
  if (!response.body) throw new GatewayError('INVALID_REQUEST', 400);
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new GatewayError('TOO_LARGE', 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new GatewayError('INVALID_JSON', 400); }
  } finally { reader.releaseLock(); }
}
export interface Input { text: string; sourceLang: 'en' | 'vi'; targetLang: 'en' | 'vi'; mode?: string }
export function validate(raw: unknown): Input {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new GatewayError('INVALID_REQUEST', 400);
  const r = raw as Record<string, unknown>;
  if (Object.keys(r).some(k => !['text', 'sourceLang', 'targetLang', 'mode'].includes(k)) ||
    typeof r.text !== 'string' || !r.text.trim() || [...r.text].length > 1000 ||
    !['en', 'vi'].includes(String(r.sourceLang)) || !['en', 'vi'].includes(String(r.targetLang)) || r.sourceLang === r.targetLang ||
    (r.mode !== undefined && !['word', 'phrase', 'sentence'].includes(String(r.mode)))) throw new GatewayError('INVALID_REQUEST', 400);
  return { text: r.text.normalize('NFC').trim(), sourceLang: r.sourceLang as Input['sourceLang'], targetLang: r.targetLang as Input['targetLang'], mode: r.mode as string | undefined };
}
