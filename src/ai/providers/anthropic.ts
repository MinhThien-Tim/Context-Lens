import type { AiProvider } from '../provider';
import { providerFetch, ProviderError } from '../provider';
import { buildUserPrompt, SYSTEM_PROMPT } from '../prompt';
import { lookupResponseSchema } from '../../lookup/schema';
import type { LookupRequest, LookupResponse } from '../../lookup/types';

export class AnthropicProvider implements AiProvider {
  readonly id = 'anthropic';
  constructor(private readonly apiKey: string, private readonly model: string) {}

  async lookup(request: LookupRequest, signal?: AbortSignal): Promise<LookupResponse> {
    const response = await providerFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal,
        headers: {
          'Content-Type': 'application/json', 'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({ model: this.model, max_tokens: 1800, temperature: 0.1, system: `${SYSTEM_PROMPT}\nReturn the JSON object directly with no code fence.`, messages: [{ role: 'user', content: buildUserPrompt(request) }] })
      }, signal);
    const payload = await response.json() as { content?: Array<{ type?: string; text?: string }> };
    const content = payload.content?.find((part) => part.type === 'text')?.text;
    if (!content) throw new ProviderError('Anthropic returned an empty response.', 'invalid_response');
    try { return lookupResponseSchema.parse(JSON.parse(content)); }
    catch { throw new ProviderError('Anthropic returned an invalid response.', 'invalid_response'); }
  }
}
