export type TranslationMode = 'word' | 'phrase' | 'sentence';
export interface TranslationInput {
  text: string;
  sourceLang?: string;
  targetLang: string;
  mode?: TranslationMode;
  signal?: AbortSignal;
}
export interface TranslationResult {
  text: string;
  sourceText: string;
  sourceLang?: string;
  detectedLang?: string;
  targetLang: string;
  provider: string;
  transliteration?: string;
  dictionary?: { definition: string; meanings: string[]; ipa?: string | null };
  confidence?: number;
  cached?: boolean;
  offline?: boolean;
  latencyMs?: number;
}
export interface TranslationProvider {
  id: string;
  priority: number;
  tier: 'stable' | 'optional' | 'experimental';
  network: boolean;
  timeoutMs: number;
  isAvailable(): Promise<boolean> | boolean;
  supports(sourceLang: string, targetLang: string): boolean;
  translate(input: TranslationInput): Promise<TranslationResult>;
}
