import type { LanguageMode, LookupRequest, LookupResponse } from './types';
import { dictionaryRegistry } from './dictionary/registry';

function lexicalUnit(selection: string, sentence: string) {
  const lower = sentence.toLowerCase();
  if (/\b(?:mind|make up|made up)\b/.test(selection.toLowerCase()) && /(?:make|makes|made) up (?:\w+ )?(?:own )?mind/.test(lower)) {
    return { type: 'idiom', text: "make up one's mind", meaning_en: 'make a decision', meaning_vi: 'đưa ra quyết định' };
  }
  if (/maintain public confidence/.test(lower) && ['maintain', 'confidence'].includes(selection.toLowerCase())) {
    return { type: 'collocation', text: 'maintain public confidence', meaning_en: 'keep public confidence strong', meaning_vi: 'duy trì lòng tin của công chúng' };
  }
  if (/account(?:s)? (?:of|for)/.test(lower) && selection.toLowerCase().startsWith('account')) {
    const isFor = /accounts? for/.test(lower);
    const share = /accounts? for\s+(?:about |approximately |over |nearly )?\d+(?:\.\d+)?\s*(?:%|percent)/.test(lower);
    return { type: isFor ? 'phrasal verb' : 'noun phrase', text: isFor ? 'account for' : 'account of an event', meaning_en: share ? 'constitute a share of a total' : isFor ? 'explain or constitute (depending on context)' : 'a report of an event', meaning_vi: share ? 'chiếm; tạo nên' : isFor ? 'giải thích; chiếm' : 'lời kể; bản tường thuật' };
  }
  return null;
}

export function localLookup(request: LookupRequest, useDictionary = true): LookupResponse {
  const key = request.selection.toLowerCase().normalize('NFC').trim();
  const match = useDictionary ? dictionaryRegistry.lookup(request.selection) : null;
  const entry = match?.entry;
  const lemma = entry?.lemma ?? key;
  const lexical = useDictionary ? lexicalUnit(request.selection, request.sentence) : null;
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
      definition_en: lexical?.meaning_en ?? (entry ? entry.definitionEn : 'No offline entry for this selection.'),
      meaning_vi: lexical ? [lexical.meaning_vi] : entry?.meaningsVi ?? ['Chưa có nghĩa ngoại tuyến'],
      lexical_unit: lexical
    },
    deep: {
      context_explanation_en: lexical?.meaning_en ?? '',
      context_explanation_vi: lexical?.meaning_vi ?? '',
      contrast: [], grammar: null,
      sentence_analysis: { translation_vi: '', chunks: lexical ? [{ text: lexical.text, role: lexical.type, meaning_vi: lexical.meaning_vi }] : [] }
    },
    difficulty: { cefr: '—', worth_learning: Boolean(entry) }, confidence: entry ? 0.55 : 0.2, source: 'offline'
  };
}

export function adaptLanguageMode(result: LookupResponse, mode: LanguageMode): LookupResponse {
  return { ...result, language_mode: mode };
}
