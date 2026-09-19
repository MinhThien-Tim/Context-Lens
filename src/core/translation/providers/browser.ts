import { checkAbort, EngineError } from '../../errors';
import type { TranslationInput, TranslationProvider } from '../types';
interface TranslatorInstance { translate(text: string, options?: { signal?: AbortSignal }): Promise<string>; destroy(): void }
interface TranslatorApi {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(options: { sourceLanguage: string; targetLanguage: string; signal?: AbortSignal }): Promise<TranslatorInstance>;
}
function api(): TranslatorApi | undefined { return (globalThis as typeof globalThis & { Translator?: TranslatorApi }).Translator; }
/** Called only by a settings button, so model download has explicit user activation. */
export async function prepareBrowserTranslation(source: string, target: string): Promise<void> {
  const translatorApi = api();
  if (!translatorApi) throw new EngineError('UNSUPPORTED_LANGUAGE');
  const translator = await translatorApi.create({ sourceLanguage: source, targetLanguage: target });
  translator.destroy();
}
export class BrowserTranslationProvider implements TranslationProvider {
  id = 'browser'; priority = 10; tier = 'stable' as const; network = false; timeoutMs = 280;
  isAvailable() { return !!api(); }
  supports(source: string, target: string) { return source !== 'auto' && source !== target; }
  async translate(input: TranslationInput) {
    const translatorApi = api();
    if (!translatorApi) throw new EngineError('UNSUPPORTED_LANGUAGE');
    const options = { sourceLanguage: input.sourceLang!, targetLanguage: input.targetLang };
    // Downloads need explicit user activation; selection lookups only use ready models.
    if (await translatorApi.availability(options) !== 'available') throw new EngineError('UNSUPPORTED_LANGUAGE');
    checkAbort(input.signal);
    const translator = await translatorApi.create({ ...options, signal: input.signal });
    try {
      checkAbort(input.signal);
      return { text: await translator.translate(input.text, { signal: input.signal }), sourceText: input.text, sourceLang: input.sourceLang, targetLang: input.targetLang, provider: this.id, offline: true };
    } finally { translator.destroy(); }
  }
}
