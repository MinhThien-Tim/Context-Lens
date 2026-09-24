export type LanguageMode = 'en' | 'vi' | 'bilingual';
export type SelectionType = 'word' | 'phrase' | 'sentence';

export type DictionarySenseSource = 'local' | 'wiktionary' | 'web';
export interface DictionarySenseResult {
  id: string;
  pos: string;
  definitionEn: string;
  meaningsVi: string[];
  source: DictionarySenseSource;
  contextScore: number;
  contextMatch: boolean;
}
export interface DictionaryResult {
  word: string;
  surfaceForm: string;
  lemma: string;
  pronunciation: string | null;
  contextPos?: string;
  senseStatus?: 'context' | 'common' | 'ambiguous';
  partOfSpeechConfidence?: number;
  senseConfidence?: number;
  contextConfidence: number;
  senses: DictionarySenseResult[];
  /** Vietnamese glosses supplied only at entry level, without a source sense link. */
  unpairedMeaningsVi?: string[];
}

export interface LookupRequest {
  selection_start?: number;
  context_mode?: import('../core/context/types').ContextMode;
  source_language?: string;
  target_language?: string;
  selection: string;
  selection_type: SelectionType;
  sentence: string;
  previous_sentence: string | null;
  next_sentence: string | null;
  paragraph?: string;
  language_mode: LanguageMode;
  learner: { native_language: 'vi'; english_level: string };
  options: {
    include_ipa: boolean;
    include_contrast: boolean;
    include_grammar: boolean;
    include_sentence_translation: boolean;
  };
}

export interface LookupResponse {
  dictionary?: DictionaryResult;
  lens?: import('../core/language/types').LensResult;
  request_id: string;
  language_mode: LanguageMode;
  selection: {
    surface: string;
    lemma: string;
    normalized: string;
    selection_type: SelectionType;
    part_of_speech: string | null;
    ipa_uk: string | null;
    ipa_us: string | null;
  };
  context: {
    sentence: string;
    previous_sentence: string | null;
    next_sentence: string | null;
  };
  quick: {
    definition_en: string;
    meaning_vi: string[];
    lexical_unit: {
      type: string;
      text: string;
      meaning_en: string;
      meaning_vi: string;
    } | null;
  };
  deep: {
    context_explanation_en: string;
    context_explanation_vi: string;
    contrast: Array<{
      meaning: string;
      example: string;
      meaning_vi: string;
      reason_not_selected: string;
    }>;
    grammar: {
      pattern: string;
      explanation_en: string;
      explanation_vi: string;
    } | null;
    sentence_analysis: {
      translation_vi: string;
      chunks: Array<{ text: string; role: string; meaning_vi: string }>;
    };
  };
  difficulty: { cefr: string; worth_learning: boolean };
  confidence: number;
  source?: 'ai' | 'cache' | 'offline' | 'browser' | 'translation';
  engine?: { provider: string; model?: string; cached?: boolean; latencyMs?: number; status?: string };
}
