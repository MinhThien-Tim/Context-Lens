import type { LanguageMode, LookupRequest, LookupResponse } from './types';
import { dictionaryRegistry } from './dictionary/registry';
import { matchKnownExpression } from '../core/context/language-rules';

function lexicalUnit(selection: string, sentence: string) {
  const match = matchKnownExpression(selection, sentence);
  return match && { type: match.type, text: match.text, meaning_en: match.meaningEn, meaning_vi: match.meaningVi };
}

export function localLookup(request: LookupRequest, useDictionary = true): LookupResponse {
  const key = request.selection.toLowerCase().normalize('NFC').trim();
  const match = useDictionary ? dictionaryRegistry.lookup(request.selection) : null;
  const entry = match?.entry;
  const lemma = entry?.lemma ?? key;
  const lexical = useDictionary ? lexicalUnit(request.selection, request.sentence) : null;
  const senses = entry ? (entry.senses?.map((sense, index) => ({ id: sense.id, pos: sense.partOfSpeech ?? entry.partOfSpeech,
    definitionEn: sense.definitionEn, meaningsVi: sense.meaningsVi, source: 'local' as const, contextScore: 0, contextMatch: false }))
    ?? [{ id: `${entry.lemma}.local`, pos: entry.partOfSpeech, definitionEn: entry.definitionEn, meaningsVi: [],
      source: 'local' as const, contextScore: 0, contextMatch: false }]) : [];
  const linkedMeanings = new Set((entry?.senses ?? []).flatMap(sense => sense.meaningsVi).map(normalizeMeaning));
  const unpairedMeaningsVi = (entry?.meaningsVi ?? []).filter(meaning => !linkedMeanings.has(normalizeMeaning(meaning)));
  return {
    request_id: `local_${Date.now()}`,
    language_mode: request.language_mode,
    dictionary: { word: lemma, surfaceForm: request.selection, lemma, pronunciation: entry?.ipa ?? null, contextConfidence: 0,
      senseConfidence: 0, partOfSpeechConfidence: 0, senses, unpairedMeaningsVi },
    selection: {
      surface: request.selection, lemma, normalized: key,
      selection_type: request.selection_type,
      part_of_speech: entry?.partOfSpeech ?? null, ipa_uk: entry?.ipa ?? null, ipa_us: entry?.ipa ?? null
    },
    context: { sentence: request.sentence, previous_sentence: request.previous_sentence, next_sentence: request.next_sentence },
    quick: {
      definition_en: lexical?.meaning_en ?? entry?.definitionEn ?? '',
      meaning_vi: lexical ? [lexical.meaning_vi] : entry?.meaningsVi ?? [],
      lexical_unit: lexical
    },
    deep: {
      context_explanation_en: lexical?.meaning_en ?? '',
      context_explanation_vi: lexical?.meaning_vi ?? '',
      contrast: [], grammar: match?.morphology ? { pattern: `${match.morphology.inflection} of ${match.morphology.baseLemma}`,
        explanation_en: `Word form: ${match.morphology.inflection} of ${match.morphology.baseLemma}.`,
        explanation_vi: `Dạng từ ${match.morphology.inflection} của ${match.morphology.baseLemma}.` } : null,
      sentence_analysis: { translation_vi: '', chunks: lexical ? [{ text: lexical.text, role: lexical.type, meaning_vi: lexical.meaning_vi }] : [] }
    },
    difficulty: { cefr: '—', worth_learning: Boolean(entry) }, confidence: entry ? 0.55 : 0.2, source: 'offline'
  };
}

export function adaptLanguageMode(result: LookupResponse, mode: LanguageMode): LookupResponse {
  return { ...result, language_mode: mode };
}

function normalizeMeaning(value: string): string { return value.normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim(); }
