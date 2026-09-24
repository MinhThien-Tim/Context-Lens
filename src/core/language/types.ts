export type { TranslationResult } from '../translation/types';

export interface LexicalSense {
  id: string;
  definitionEn: string;
  meaningVi?: string;
  pos?: string;
  synonyms?: string[];
  antonyms?: string[];
  examples?: string[];
  collocations?: string[];
  domains?: string[];
  keywords?: string[];
  frequency?: number;
  cefr?: string;
}
export interface LexicalEntry {
  lemma: string; pos: string[]; forms?: string[]; senses: LexicalSense[]; meaningsVi?: string[];
  morphology?: { surface: string; baseLemma: string; inflection: import('../../lookup/dictionary/types').InflectionType };
  sources?: { english?: string[]; vietnamese?: string[]; morphology?: string };
}
export interface PhraseEntry extends LexicalEntry { type: 'idiom' | 'phrasal verb' | 'collocation' | 'fixed expression' }
export interface TokenInfo { text: string; normalized: string; lemma: string; start: number; end: number; pos?: string }
export interface DetectedPhrase { canonical: string; text: string; start: number; end: number; type: PhraseEntry['type'] }
export interface SentenceAnalysis {
  id: string; sourceText: string; normalizedText: string; sourceLang: string;
  translationVi?: string; simpleEnglish?: string;
  tokens: TokenInfo[]; lemmas: string[]; phrases: DetectedPhrase[]; semanticHints: string[];
  provider: string; createdAt: number; lastUsedAt: number; analysisVersion: number;
}
export interface SelectionInput {
  selectedText: string; sentence: string; previousSentence?: string; nextSentence?: string; paragraph?: string;
  sourceLang: string; targetLang: string;
  /** Character offset within sentence, needed to distinguish repeated occurrences. */
  selectionStart?: number;
}
export interface LensResult {
  selection: { surface: string; normalized: string; lemma: string; pos?: string; status?: 'complete' | 'partial' | 'base-form' | 'reconstructed' | 'fragment-or-unknown'; reconstructedFrom?: string; reconstructedToken?: string; matchedText?: string; matchType?: 'exact' | 'lemma' | 'phrase' | 'subphrase' | 'head' };
  phrase?: { canonical: string; type: string };
  english?: { definition?: string; contextualDefinition?: string; synonyms?: string[]; examples?: string[] };
  vietnamese?: { meaning?: string; contextualMeaning?: string; senseAligned?: boolean };
  grammar?: { role?: string; pattern?: string; form?: string };
  context: { sentence: string; sentenceTranslation?: string; simpleEnglish?: string; previousSentence?: string; nextSentence?: string; needsPreviousSentence?: boolean };
  sense?: { id: string; alternatives: string[]; reasons: string[] };
  dictionary?: import('../../lookup/types').DictionaryResult;
  /** Confidence in the selected meaning; deliberately separate from POS confidence. */
  confidence: number; posConfidence?: number; providers: { lexical?: string; sentence?: string; context?: string };
  cached: boolean; offline: boolean;
}
