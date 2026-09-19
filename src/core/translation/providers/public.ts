import { z } from 'zod';
import { EngineError } from '../../errors';
import { fetchJson } from '../../network';
import type { TranslationInput, TranslationProvider } from '../types';
const responseSchema = z.object({ responseStatus: z.union([z.number(), z.string()]), quotaFinished: z.boolean().optional(), responseData: z.object({ translatedText: z.string().trim().min(1).max(20_000) }) });
/** Documented, anonymous read-only API. Optional because it has a daily usage limit. */
export class PublicTranslationProvider implements TranslationProvider {
  id = 'mymemory'; priority = 25; tier = 'optional' as const; network = true; timeoutMs = 1200;
  isAvailable() { return true; }
  supports(source: string, target: string) { return source !== 'auto' && source !== target; }
  async translate(input: TranslationInput) {
    if (new TextEncoder().encode(input.text).length > 500) throw new EngineError('UNSUPPORTED_LANGUAGE');
    const url = new URL('https://api.mymemory.translated.net/get');
    url.searchParams.set('q', input.text); url.searchParams.set('langpair', `${input.sourceLang}|${input.targetLang}`);
    const response = responseSchema.safeParse(await fetchJson(url, { signal: input.signal }));
    if (!response.success) throw new EngineError('INVALID_RESPONSE');
    if (response.data.quotaFinished || Number(response.data.responseStatus) === 429) throw new EngineError('QUOTA');
    if (Number(response.data.responseStatus) !== 200) throw new EngineError('PROVIDER_DOWN');
    return { text: response.data.responseData.translatedText, sourceText: input.text, sourceLang: input.sourceLang, targetLang: input.targetLang, provider: this.id };
  }
}
