export type LanguageMode = 'en' | 'vi' | 'bilingual';
export type SelectionType = 'word' | 'phrase' | 'sentence';

export interface LookupRequest {
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
