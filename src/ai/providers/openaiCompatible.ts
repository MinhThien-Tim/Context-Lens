import type { AiProvider } from '../provider';
import { providerFetch, ProviderError } from '../provider';
import { buildContextPrompt, CONTEXT_SYSTEM_PROMPT } from '../prompt';
import { contextExplanationJsonSchema, contextExplanationSchema } from '../../core/context/schema';
import type { ContextExplanation, ContextInput } from '../../core/context/types';

export interface CompatibleProviderConfig { apiKey: string; baseUrl: string; model: string }

export class OpenAiCompatibleProvider implements AiProvider {
  readonly id = 'compatible';
  constructor(private readonly config: CompatibleProviderConfig) {}

  async explain(input: ContextInput, signal?: AbortSignal): Promise<ContextExplanation> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const response = await providerFetch(url, {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) },
        body: JSON.stringify({
          model: this.config.model,
          temperature: 0.1,
          response_format: { type: 'json_schema', json_schema: { name: 'context_explanation', strict: true, schema: contextExplanationJsonSchema } },
          messages: [{ role: 'system', content: CONTEXT_SYSTEM_PROMPT }, { role: 'user', content: buildContextPrompt(input) }]
        })
      }, signal);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new ProviderError('The provider returned an empty response.', 'invalid_response');
    try { return contextExplanationSchema.parse(JSON.parse(content)); }
    catch { throw new ProviderError('The provider returned an invalid response.', 'invalid_response'); }
  }
}
