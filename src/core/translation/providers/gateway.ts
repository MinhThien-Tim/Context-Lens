import { z } from 'zod';
import { EngineError } from '../../errors';
import { postJson } from '../../network';
import type { TranslationInput, TranslationProvider } from '../types';
const responseSchema = z.object({ text: z.string().trim().min(1).max(20_000), detectedLang: z.string().optional(), transliteration: z.string().optional() });
/** User-operated gateway to official engines. Credentials stay on that gateway. */
export class GatewayTranslationProvider implements TranslationProvider {
  network = true;
  constructor(readonly id: string, readonly priority: number, private endpoint: string, readonly timeoutMs = 1200, readonly tier: TranslationProvider['tier'] = 'optional') {}
  isAvailable() { return Boolean(this.endpoint); }
  supports(source: string, target: string) { return source !== target; }
  async translate(input: TranslationInput) {
    const response = responseSchema.safeParse(await postJson(this.endpoint, { provider: this.id, text: input.text, sourceLang: input.sourceLang, targetLang: input.targetLang }, input.signal));
    if (!response.success) throw new EngineError('INVALID_RESPONSE');
    return { ...response.data, sourceText: input.text, sourceLang: input.sourceLang, targetLang: input.targetLang, provider: this.id };
  }
}
