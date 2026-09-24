import { GeminiProvider } from '../../ai/providers/gemini';
import { AnthropicProvider } from '../../ai/providers/anthropic';
import { OpenAiCompatibleProvider } from '../../ai/providers/openaiCompatible';
import type { AiProvider } from '../../ai/provider';
import type { AiSettings } from '../../settings/types';
import type { EngineSettings } from '../../settings/engines';
import { db } from '../../db/database';
import { contextProviderResponseSchema } from './schema';
import { EngineError } from '../errors';
import { postJson } from '../network';
import type { ContextInput, ContextProvider } from './types';

export function createProvider(settings: AiSettings): AiProvider | null {
  if (!settings.apiKey || settings.provider === 'none' || settings.provider === 'demo') return null;
  if (settings.provider === 'gemini') return new GeminiProvider(settings.apiKey, settings.model);
  if (settings.provider === 'anthropic') return new AnthropicProvider(settings.apiKey, settings.model);
  return new OpenAiCompatibleProvider({ apiKey: settings.apiKey, model: settings.model, baseUrl: settings.provider === 'openai' ? 'https://api.openai.com/v1' : settings.baseUrl });
}
export class HostedLiteProvider implements ContextProvider {
  id = 'hosted-lite'; model = 'hosted'; network = true;
  family: string;
  constructor(private endpoint: string, private dailyLimit: number) { this.family = `hosted:${endpoint}`; }
  async explain(input: ContextInput) {
    const key = `hosted-quota:${this.endpoint}:${new Date().toISOString().slice(0, 10)}`;
    // Atomic across tabs. The server must independently enforce account/IP quotas.
    await db.transaction('rw', db.settings, async () => {
      const count = Number((await db.settings.get(key))?.value ?? 0);
      if (count >= this.dailyLimit) throw new EngineError('QUOTA');
      await db.settings.put({ key, value: count + 1 });
    });
    const result = contextProviderResponseSchema.safeParse(await postJson(this.endpoint, { selectedText: input.request.selection, sentence: input.request.paragraph ? undefined : input.request.sentence, paragraph: input.request.paragraph, previousSentence: input.request.previous_sentence, nextSentence: input.request.next_sentence, mode: input.mode, sourceLang: input.sourceLang, targetLang: input.targetLang }, input.signal));
    if (!result.success) throw new EngineError('INVALID_RESPONSE');
    return result.data;
  }
}
export function contextProviders(settings: EngineSettings, ai: AiSettings): ContextProvider[] {
  const providers: ContextProvider[] = [];
  const user = settings.userApi ? createProvider(ai) : null;
  if (user) providers.push({ id: 'user-api', model: ai.model, family: `${ai.provider}:${ai.baseUrl}`, network: true, explain: input => user.explain(input, input.signal) });
  if (settings.hostedAiLite && settings.hostedEndpoint) providers.push(new HostedLiteProvider(settings.hostedEndpoint, Math.max(0, Math.min(1000, settings.hostedDailyQuota))));
  if (settings.localLlm && settings.localEndpoint && settings.localModel) {
    let url: URL | undefined;
    try { url = new URL(settings.localEndpoint); } catch { /* Invalid optional endpoints are unavailable. */ }
    if (url && ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      const local = new OpenAiCompatibleProvider({ apiKey: '', baseUrl: settings.localEndpoint, model: settings.localModel });
      providers.push({ id: 'local', family: `local:${settings.localEndpoint}`, model: settings.localModel, network: false, explain: input => local.explain(input, input.signal) });
    }
  }
  const order = new Map(settings.contextProviderOrder.map((id, index) => [id, index]));
  providers.sort((a, b) => (order.get(a.id as never) ?? 999) - (order.get(b.id as never) ?? 999));
  if (settings.contextEngine !== 'auto') {
    if (settings.contextEngine === 'local') return providers.filter(provider => !provider.network);
    providers.sort((a, b) => Number(b.id === settings.contextEngine) - Number(a.id === settings.contextEngine));
    if (!settings.automaticFallback) return providers.filter(provider => provider.id === settings.contextEngine);
  }
  return providers;
}
