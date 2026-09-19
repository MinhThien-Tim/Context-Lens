import type { LanguageMode, LookupRequest, LookupResponse } from './types';
import { dictionaryRegistry } from './dictionary/registry';

function lexicalUnit(selection: string, sentence: string) {
  const lower = sentence.toLowerCase();
  if (selection.toLowerCase() === 'mind' && /made? up (?:\w+ )?(?:own )?mind/.test(lower)) {
    return { type: 'idiom', text: "make up one's mind", meaning_en: 'make a decision', meaning_vi: 'đưa ra quyết định' };
  }
  if (/maintain public confidence/.test(lower) && ['maintain', 'confidence'].includes(selection.toLowerCase())) {
    return { type: 'collocation', text: 'maintain public confidence', meaning_en: 'keep public confidence strong', meaning_vi: 'duy trì lòng tin của công chúng' };
  }
  if (/account(?:s)? (?:of|for)/.test(lower) && selection.toLowerCase().startsWith('account')) {
    const isFor = lower.includes('account for');
    return { type: isFor ? 'phrasal verb' : 'noun phrase', text: isFor ? 'account for' : 'account of an event', meaning_en: isFor ? 'explain or cause' : 'a report of an event', meaning_vi: isFor ? 'giải thích; chiếm' : 'lời kể; bản tường thuật' };
  }
  return null;
}

export function localLookup(request: LookupRequest): LookupResponse {
  const key = request.selection.toLowerCase().replace(/[^a-z'-]/g, '');
  const match = dictionaryRegistry.lookup(request.selection);
  const entry = match?.entry;
  const lemma = entry?.lemma ?? key;
  const lexical = lexicalUnit(request.selection, request.sentence);
  return {
    request_id: `local_${Date.now()}`,
    language_mode: request.language_mode,
    selection: {
      surface: request.selection, lemma, normalized: key,
      selection_type: request.selection_type,
      part_of_speech: entry?.partOfSpeech ?? null, ipa_uk: entry?.ipa ?? null, ipa_us: entry?.ipa ?? null
    },
    context: { sentence: request.sentence, previous_sentence: request.previous_sentence, next_sentence: request.next_sentence },
    quick: {
      definition_en: lexical?.meaning_en ?? (entry ? entry.definitionEn : 'This word is not in the offline dictionary. Try AI in Settings.'),
      meaning_vi: lexical ? [lexical.meaning_vi] : entry?.meaningsVi ?? ['Chưa có nghĩa ngoại tuyến'],
      lexical_unit: lexical
    },
    deep: {
      context_explanation_en: 'A contextual AI explanation is unavailable offline.',
      context_explanation_vi: 'Không có giải thích AI theo ngữ cảnh khi ngoại tuyến.',
      contrast: [], grammar: null,
      sentence_analysis: { translation_vi: '', chunks: lexical ? [{ text: lexical.text, role: lexical.type, meaning_vi: lexical.meaning_vi }] : [] }
    },
    difficulty: { cefr: '—', worth_learning: Boolean(entry) }, confidence: entry ? 0.55 : 0.2, source: 'offline'
  };
}

export function adaptLanguageMode(result: LookupResponse, mode: LanguageMode): LookupResponse {
  return { ...result, language_mode: mode };
}
