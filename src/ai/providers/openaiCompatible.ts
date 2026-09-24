import type { AiProvider } from '../provider';
import { providerFetch, ProviderError } from '../provider';
import { buildContextPrompt, CONTEXT_SYSTEM_PROMPT, contextTaskJsonSchema, outputTokenCap } from '../prompt';
import { explanationSchemaForTask } from '../../core/context/schema';
import type { ContextExplanation, ContextInput } from '../../core/context/types';
import { recordAiUsage } from '../usage';

export interface CompatibleProviderConfig { apiKey: string; baseUrl: string; model: string }

export class OpenAiCompatibleProvider implements AiProvider {
  readonly id = 'compatible';
  constructor(private readonly config: CompatibleProviderConfig) {}

  async explain(input: ContextInput, signal?: AbortSignal): Promise<ContextExplanation> {
    const startedAt = Date.now();
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const response = await providerFetch(url, {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) },
        body: JSON.stringify({
          model: this.config.model,
          temperature: 0.1, max_completion_tokens: outputTokenCap(input.mode),
          response_format: { type: 'json_schema', json_schema: { name: 'context_explanation', strict: true, schema: contextTaskJsonSchema(input.mode) } },
          messages: [{ role: 'system', content: CONTEXT_SYSTEM_PROMPT }, { role: 'user', content: buildContextPrompt(input) }]
        })
      }, signal);
    const payload = await response.json() as { usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } }; choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new ProviderError('The provider returned an empty response.', 'invalid_response');
    let explanation: ContextExplanation;
    try { explanation = explanationSchemaForTask(input.mode).parse(JSON.parse(content)); }
    catch { throw new ProviderError('The provider returned an invalid response.', 'invalid_response'); }
    await recordAiUsage({ provider: this.id, model: this.config.model, task: input.mode, inputTokens: payload.usage?.prompt_tokens, outputTokens: payload.usage?.completion_tokens, cachedTokens: payload.usage?.prompt_tokens_details?.cached_tokens, latencyMs: Date.now() - startedAt, cacheHit: false });
    return explanation;
  }
}
