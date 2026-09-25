import { normalizeGeminiModel } from '../ai/providers/gemini';

export type GeminiConnectionStatus = 'ready' | 'invalid-key' | 'model-unavailable' | 'quota' | 'network' | 'structured-unavailable' | 'unknown' | 'timeout' | 'cancelled';

export async function testGeminiConnection(apiKey: string, model: string, signal?: AbortSignal, timeoutMs = 12_000): Promise<GeminiConnectionStatus> {
  const key = apiKey.trim();
  if (!key) return 'invalid-key';
  const name = normalizeGeminiModel(model);
  if (!name) return 'model-unavailable';
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(name)}:generateContent`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Reply with {"ok":true}.' }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 32, responseMimeType: 'application/json', responseJsonSchema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] } }
      })
    });
    if (response.status === 401 || response.status === 403) return 'invalid-key';
    if (response.status === 404) return 'model-unavailable';
    if (response.status === 429) return 'quota';
    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => null) as { error?: { details?: Array<{ reason?: string }> } } | null;
        return error?.error?.details?.some(detail => detail.reason === 'API_KEY_INVALID') ? 'invalid-key' : 'structured-unavailable';
      }
      return 'unknown';
    }
    const payload = await response.json().catch(() => null) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> } | null;
    const content = payload?.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('') ?? '';
    try { return JSON.parse(content).ok === true ? 'ready' : 'structured-unavailable'; } catch { return 'structured-unavailable'; }
  } catch { return timedOut ? 'timeout' : signal?.aborted ? 'cancelled' : 'network'; }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
