import type { AiProvider } from '../provider';
import { providerFetch, ProviderError } from '../provider';
import { buildContextPrompt, CONTEXT_SYSTEM_PROMPT } from '../prompt';
import { contextProviderResponseSchema } from '../../core/context/schema';
import type { ContextExplanation, ContextInput } from '../../core/context/types';

export class AnthropicProvider implements AiProvider {
  readonly id = 'anthropic';
  constructor(private readonly apiKey: string, private readonly model: string) {}

  async explain(input: ContextInput, signal?: AbortSignal): Promise<ContextExplanation> {
    const response = await providerFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal,
        headers: {
          'Content-Type': 'application/json', 'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({ model: this.model, max_tokens: 900, temperature: 0.1, system: `${CONTEXT_SYSTEM_PROMPT}\nReturn the JSON object directly with no code fence.`, messages: [{ role: 'user', content: buildContextPrompt(input) }] })
      }, signal);
    const payload = await response.json() as { content?: Array<{ type?: string; text?: string }> };
    const content = payload.content?.find((part) => part.type === 'text')?.text;
    if (!content) throw new ProviderError('Anthropic returned an empty response.', 'invalid_response');
    try { return contextProviderResponseSchema.parse(JSON.parse(content)); }
    catch { throw new ProviderError('Anthropic returned an invalid response.', 'invalid_response'); }
  }
}
