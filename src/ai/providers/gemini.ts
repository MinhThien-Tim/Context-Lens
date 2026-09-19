import type { AiProvider } from '../provider';
import { providerFetch, ProviderError } from '../provider';
import { buildContextPrompt, CONTEXT_SYSTEM_PROMPT } from '../prompt';
import { contextExplanationJsonSchema, contextExplanationSchema } from '../../core/context/schema';
import type { ContextExplanation, ContextInput } from '../../core/context/types';

export function normalizeGeminiModel(model: string): string {
  return model.trim().replace(/^models\//, '').replace(/^gemini-3-6-flash$/, 'gemini-3.6-flash');
}

export class GeminiProvider implements AiProvider {
  readonly id = 'gemini';
  constructor(private readonly apiKey: string, private readonly model: string) {}

  async explain(input: ContextInput, signal?: AbortSignal): Promise<ContextExplanation> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(normalizeGeminiModel(this.model))}:generateContent`;
    const response = await providerFetch(url, {
        method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey.trim() },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: CONTEXT_SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: buildContextPrompt(input) }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseJsonSchema: contextExplanationJsonSchema }
        })
      }, signal);
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> };
    const content = payload.candidates?.[0]?.content?.parts?.filter((part) => !part.thought).map((part) => part.text ?? '').join('');
    if (!content) throw new ProviderError('Gemini returned an empty response.', 'invalid_response');
    try { return contextExplanationSchema.parse(JSON.parse(content)); }
    catch { throw new ProviderError('Gemini returned an invalid response.', 'invalid_response'); }
  }
}
