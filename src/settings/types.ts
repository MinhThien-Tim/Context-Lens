export type ProviderKind = 'gemini' | 'openai' | 'anthropic' | 'compatible' | 'none' | 'demo';
export type KeyStorage = 'session' | 'persistent';

export interface AiSettings {
  provider: ProviderKind;
  apiKey: string;
  model: string;
  baseUrl: string;
  keyStorage: KeyStorage;
}

export const defaultAiSettings: AiSettings = {
  provider: 'none',
  apiKey: '',
  model: 'gemini-3.6-flash',
  baseUrl: '',
  keyStorage: 'session'
};
