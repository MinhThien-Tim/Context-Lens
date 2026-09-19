import { GeminiProvider } from '../ai/providers/gemini';
import { AnthropicProvider } from '../ai/providers/anthropic';
import { OpenAiCompatibleProvider } from '../ai/providers/openaiCompatible';
import { PROMPT_VERSION } from '../ai/prompt';
import type { AiProvider } from '../ai/provider';
import type { AiSettings } from '../settings/types';
import { createCacheKey, createContextCacheKey } from './cache';
import { localLookup } from './localDictionary';
import type { LookupRequest, LookupResponse } from './types';
import { findContextLookup, findExactLookup, storeLookup } from './cacheRepository';

export function createProvider(settings: AiSettings): AiProvider | null {
  if (!settings.apiKey || settings.provider === 'none' || settings.provider === 'demo') return null;
  if (settings.provider === 'gemini') return new GeminiProvider(settings.apiKey, settings.model);
  if (settings.provider === 'anthropic') return new AnthropicProvider(settings.apiKey, settings.model);
  if (settings.provider === 'openai') return new OpenAiCompatibleProvider({ apiKey: settings.apiKey, model: settings.model, baseUrl: 'https://api.openai.com/v1' });
  if (settings.provider === 'compatible') return new OpenAiCompatibleProvider({ apiKey: settings.apiKey, model: settings.model, baseUrl: settings.baseUrl });
  return null;
}

export class LookupService {
  immediate(request: LookupRequest): LookupResponse {
    return localLookup(request);
  }

  async contextual(request: LookupRequest, settings: AiSettings, signal?: AbortSignal): Promise<LookupResponse | null> {
    const provider = createProvider(settings);
    const contextKey = await createContextCacheKey({
      selection: request.selection, sentence: request.sentence, languageMode: request.language_mode,
      promptVersion: PROMPT_VERSION
    });
    if (!provider || !navigator.onLine) {
      return findContextLookup(contextKey);
    }
    const cacheKey = await createCacheKey({
      selection: request.selection, sentence: request.sentence, languageMode: request.language_mode,
      promptVersion: PROMPT_VERSION, provider: provider.id, model: settings.model
    });
    const cached = await findExactLookup(cacheKey);
    if (cached) return cached;
    const result = await provider.lookup(request, signal);
    await storeLookup(cacheKey, contextKey, result);
    return { ...result, source: 'ai' };
  }
}

export const lookupService = new LookupService();
