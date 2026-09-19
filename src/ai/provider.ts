import type { LookupRequest, LookupResponse } from '../lookup/types';

export interface AiProvider {
  readonly id: string;
  lookup(request: LookupRequest, signal?: AbortSignal): Promise<LookupResponse>;
}

export type ProviderErrorCode = 'auth' | 'rate_limit' | 'quota' | 'timeout' | 'network' | 'invalid_response' | 'unsupported' | 'invalid_request';

export class ProviderError extends Error {
  constructor(message: string, readonly code: ProviderErrorCode, readonly status?: number) {
    super(message);
    this.name = 'ProviderError';
  }
}

export const DEFAULT_AI_TIMEOUT_MS = 45_000;

export async function providerFetch(input: RequestInfo | URL, init: RequestInit, signal?: AbortSignal, timeoutMs = DEFAULT_AI_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    if (response.status === 401 || response.status === 403) throw new ProviderError('The API key was rejected.', 'auth', response.status);
    if (response.status === 429) throw new ProviderError('The provider rate limit was reached.', 'rate_limit', response.status);
    if (response.status === 402) throw new ProviderError('The provider quota is exhausted.', 'quota', response.status);
    if (response.status === 404) throw new ProviderError('The model or API endpoint was not found. Check the model ID in Settings (Gemini: gemini-3.6-flash).', 'unsupported', response.status);
    if (response.status === 400) {
      const body = await response.json().catch(() => null) as { error?: { details?: Array<{ reason?: string }> } } | null;
      if (body?.error?.details?.some((detail) => detail.reason === 'API_KEY_INVALID')) {
        throw new ProviderError('The API key was rejected.', 'auth', response.status);
      }
      throw new ProviderError('The provider rejected the request (400). Check that the model supports structured JSON output and is available to your API key.', 'invalid_request', response.status);
    }
    if (!response.ok) throw new ProviderError(`Provider request failed (${response.status}).`, 'network', response.status);
    return response;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (timedOut) throw new ProviderError('The provider request timed out.', 'timeout');
    if (signal?.aborted) throw error;
    throw new ProviderError('Could not reach the AI provider.', 'network');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
