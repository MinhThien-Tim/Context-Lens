import type { AiProvider } from '../provider';
import { providerFetch, ProviderError } from '../provider';
import { buildContextPrompt, CONTEXT_SYSTEM_PROMPT, contextTaskJsonSchema, outputTokenCap } from '../prompt';
import { explanationSchemaForTask } from '../../core/context/schema';
import type { ContextExplanation, ContextInput } from '../../core/context/types';
import { recordAiUsage } from '../usage';

export function normalizeGeminiModel(model: string): string {
  return model.trim().replace(/^models\//, '').replace(/^gemini-3-6-flash$/, 'gemini-3.6-flash');
}

export class GeminiProvider implements AiProvider {
  readonly id = 'gemini';
  constructor(private readonly apiKey: string, private readonly model: string) {}

  async explain(input: ContextInput, signal?: AbortSignal): Promise<ContextExplanation> {
    const startedAt = Date.now();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(normalizeGeminiModel(this.model))}:generateContent`;
    const response = await providerFetch(url, {
        method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey.trim() },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: CONTEXT_SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: buildContextPrompt(input) }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: outputTokenCap(input.mode), responseMimeType: 'application/json', responseJsonSchema: contextTaskJsonSchema(input.mode) }
        })
      }, signal);
    const payload = await response.json() as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number }; candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> };
    const content = payload.candidates?.[0]?.content?.parts?.filter((part) => !part.thought).map((part) => part.text ?? '').join('');
    if (!content) throw new ProviderError('Gemini returned an empty response.', 'invalid_response');
    let explanation: ContextExplanation;
    try { explanation = explanationSchemaForTask(input.mode).parse(JSON.parse(content)); }
    catch { throw new ProviderError('Gemini returned an invalid response.', 'invalid_response'); }
    await recordAiUsage({ provider: this.id, model: this.model, task: input.mode, inputTokens: payload.usageMetadata?.promptTokenCount, outputTokens: payload.usageMetadata?.candidatesTokenCount, cachedTokens: payload.usageMetadata?.cachedContentTokenCount, latencyMs: Date.now() - startedAt, cacheHit: false });
    return explanation;
  }
}
