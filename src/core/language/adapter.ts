import type { LookupRequest, LookupResponse } from '../../lookup/types';
import type { LensResult } from './types';

/** Compatibility boundary for vocabulary/export and the existing reading panel. */
export function applyLocalResult(base: LookupResponse, lens: LensResult): LookupResponse {
  const en = lens.english?.definition ?? '';
  const vi = lens.vietnamese?.meaning;
  return { ...base, lens, source: lens.cached ? 'cache' : 'offline', confidence: lens.confidence,
    selection: { ...base.selection, lemma: lens.selection.lemma, part_of_speech: lens.selection.pos ?? null },
    quick: { definition_en: en, meaning_vi: vi ? [vi] : [], lexical_unit: lens.phrase ? {
      text: lens.phrase.canonical, type: lens.phrase.type, meaning_en: en, meaning_vi: vi ?? ''
    } : null },
    deep: { ...base.deep, context_explanation_en: lens.english?.contextualDefinition ?? '',
      context_explanation_vi: lens.vietnamese?.contextualMeaning ?? '',
      sentence_analysis: { ...base.deep.sentence_analysis, translation_vi: lens.context.sentenceTranslation ?? '' },
      grammar: lens.grammar?.role ? { pattern: lens.grammar.form ?? lens.grammar.pattern ?? lens.selection.lemma,
        explanation_en: lens.grammar.form ? `Word form: ${lens.grammar.form}. Dictionary part of speech: ${lens.grammar.role}` : `Dictionary part of speech: ${lens.grammar.role}`,
        explanation_vi: `Từ loại theo từ điển: ${lens.grammar.role}` } : null },
    difficulty: { ...base.difficulty, worth_learning: Boolean(en || vi) },
    engine: { provider: 'local', cached: lens.cached }
  };
}
export function selectionInput(request: LookupRequest, sourceLang: string, targetLang: string) {
  return { selectedText: request.selection, sentence: request.sentence, previousSentence: request.previous_sentence ?? undefined,
    nextSentence: request.next_sentence ?? undefined, paragraph: request.paragraph, sourceLang, targetLang, selectionStart: request.selection_start };
}
