import type { AiProvider } from '../provider';
import { providerFetch, ProviderError } from '../provider';
import { buildUserPrompt, SYSTEM_PROMPT } from '../prompt';
import { lookupResponseSchema } from '../../lookup/schema';
import { lookupJsonSchema } from '../../lookup/schema';
import type { LookupRequest, LookupResponse } from '../../lookup/types';

export class GeminiProvider implements AiProvider {
  readonly id = 'gemini';
  constructor(private readonly apiKey: string, private readonly model: string) {}

  async lookup(request: LookupRequest, signal?: AbortSignal): Promise<LookupResponse> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const response = await providerFetch(url, {
        method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: buildUserPrompt(request) }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseJsonSchema: lookupJsonSchema }
        })
      }, signal);
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const content = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new ProviderError('Gemini returned an empty response.', 'invalid_response');
    try { return lookupResponseSchema.parse(JSON.parse(content)); }
    catch { throw new ProviderError('Gemini returned an invalid response.', 'invalid_response'); }
  }
}
