import type { LanguageMode } from './types';

export async function hashText(value: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(bytes)).slice(0, 8).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}

export async function createCacheKey(input: {
  selection: string;
  sentence: string;
  languageMode: LanguageMode;
  promptVersion: string;
  provider: string;
  model: string;
}): Promise<string> {
  const contextKey = await createContextCacheKey(input);
  return [contextKey, input.provider, input.model].join(':');
}

export async function createContextCacheKey(input: {
  selection: string;
  sentence: string;
  languageMode: LanguageMode;
  promptVersion: string;
}): Promise<string> {
  const sentenceHash = await hashText(input.sentence);
  return [input.selection.toLocaleLowerCase(), sentenceHash, input.languageMode, input.promptVersion].join(':');
}
