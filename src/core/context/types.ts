import type { LookupRequest } from '../../lookup/types';
export type ContextMode = 'meaning-in-context' | 'grammar' | 'phrase' | 'idiom' | 'simplify' | 'nuance' | 'word-sense' | 'sentence-structure';
export interface ContextInput {
  aiRequested?: boolean;
  request: LookupRequest;
  mode: ContextMode;
  sourceLang: string;
  targetLang: string;
  signal?: AbortSignal;
}
export interface ContextResult {
  explanation: ContextExplanation;
  provider: string;
  model?: string;
  cached?: boolean;
  status?: 'offline' | 'quota' | 'unavailable';
}
export interface ContextExplanation {
  meaning?: string;
  naturalTranslation?: string;
  sense?: string;
  grammar?: { pattern?: string; explanation: string };
  whyHere?: string;
  notThisMeaning?: string;
  pattern?: string;
  example?: string;
  simplified?: string;
  sentenceTranslation?: string;
  chunks?: Array<{ text: string; role: string; meaning?: string }>;
  confidence?: number;
}
export interface ContextProvider {
  id: string;
  model: string;
  family: string;
  network: boolean;
  explain(input: ContextInput): Promise<ContextExplanation>;
}
