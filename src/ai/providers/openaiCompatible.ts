import type { AiProvider } from '../provider';
import { providerFetch, ProviderError } from '../provider';
import { buildUserPrompt, SYSTEM_PROMPT } from '../prompt';
import { lookupJsonSchema, lookupResponseSchema } from '../../lookup/schema';
import type { LookupRequest, LookupResponse } from '../../lookup/types';

export interface CompatibleProviderConfig { apiKey: string; baseUrl: string; model: string }

export class OpenAiCompatibleProvider implements AiProvider {
  readonly id = 'compatible';
  constructor(private readonly config: CompatibleProviderConfig) {}

  async lookup(request: LookupRequest, signal?: AbortSignal): Promise<LookupResponse> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const response = await providerFetch(url, {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.apiKey}` },
        body: JSON.stringify({
          model: this.config.model,
          temperature: 0.1,
          response_format: { type: 'json_schema', json_schema: { name: 'context_lookup', strict: true, schema: lookupJsonSchema } },
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: buildUserPrompt(request) }]
        })
      }, signal);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new ProviderError('The provider returned an empty response.', 'invalid_response');
    try { return lookupResponseSchema.parse(JSON.parse(content)); }
    catch { throw new ProviderError('The provider returned an invalid response.', 'invalid_response'); }
  }
}
