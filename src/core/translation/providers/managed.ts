import { EngineError } from '../../errors';
import type { TranslationInput, TranslationProvider } from '../types';
import type { OnlineTranslationProvider } from '../../../settings/engines';
export class ManagedTranslationProvider implements TranslationProvider {
  priority = 25; tier = 'experimental' as const; network = true; timeoutMs = 2800;
  readonly id: string;
  constructor(private endpoint: string, private selection: OnlineTranslationProvider = 'auto') {
    this.id = selection === 'auto' ? 'online-auto' : selection;
  }
  isAvailable() { return Boolean(this.endpoint); }
  supports(source: string, target: string) { return ['en', 'vi'].includes(source) && ['en', 'vi'].includes(target) && source !== target; }
  async translate(input: TranslationInput) {
    if ([...input.text].length > 1000) throw new EngineError('UNSUPPORTED_LANGUAGE');
    const url = new URL(this.endpoint, location.origin);
    if (url.origin !== location.origin) throw new EngineError('PROVIDER_DOWN');
    const response = await fetch(url, { method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', signal: input.signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        version: 1, provider: this.selection, text: input.text, sourceLang: input.sourceLang, targetLang: input.targetLang, mode: input.mode ?? 'word'
      }) });
    if (response.status === 429) throw new EngineError('QUOTA');
    if (response.status === 504) throw new EngineError('TIMEOUT');
    if (!response.ok) throw new EngineError('PROVIDER_DOWN');
    let result: unknown;
    try { result = await response.json(); } catch { throw new EngineError('INVALID_RESPONSE'); }
    if (!result || typeof result !== 'object' || !('version' in result) || result.version !== 1 ||
      !('provider' in result) || !['google-web', 'bing-web'].includes(String(result.provider)) ||
      !('text' in result) || typeof result.text !== 'string' || !result.text.trim() || result.text.length > 10_000) throw new EngineError('INVALID_RESPONSE');
    return { text: result.text, sourceText: input.text, sourceLang: input.sourceLang, targetLang: input.targetLang, provider: String(result.provider) };
  }
}
