import type { LookupResponse } from '../lookup/types';

export const validLookup: LookupResponse = {
  request_id: 'lookup_test', language_mode: 'bilingual',
  selection: { surface: 'maintain', lemma: 'maintain', normalized: 'maintain', selection_type: 'word', part_of_speech: 'verb', ipa_uk: '/meɪnˈteɪn/', ipa_us: '/meɪnˈteɪn/' },
  context: { sentence: 'The government struggled to maintain public confidence.', previous_sentence: null, next_sentence: null },
  quick: { definition_en: 'to keep something at the same level or strength', meaning_vi: ['duy trì', 'giữ vững'], lexical_unit: { type: 'collocation', text: 'maintain public confidence', meaning_en: 'keep public confidence strong', meaning_vi: 'duy trì lòng tin của công chúng' } },
  deep: { context_explanation_en: 'It means keeping confidence from falling.', context_explanation_vi: 'Nghĩa là giữ cho lòng tin không suy giảm.', contrast: [], grammar: { pattern: 'maintain + noun', explanation_en: 'It takes a direct object.', explanation_vi: 'Động từ đi với tân ngữ trực tiếp.' }, sentence_analysis: { translation_vi: 'Chính phủ gặp khó khăn trong việc duy trì lòng tin của công chúng.', chunks: [{ text: 'struggled to', role: 'verb pattern', meaning_vi: 'gặp khó khăn khi cố làm gì' }] } },
  difficulty: { cefr: 'B2', worth_learning: true }, confidence: 0.97
};
