import type { LookupResponse } from '../../lookup/types';
import type { ContextExplanation } from './types';

export function explanationFromLookup(result: LookupResponse): ContextExplanation {
  const grammar = result.deep.grammar;
  return {
    definitionEn: result.quick.definition_en || undefined,
    meaningVi: result.quick.meaning_vi[0] || undefined,
    meaning: result.deep.context_explanation_vi || result.deep.context_explanation_en || result.quick.meaning_vi[0] || result.quick.definition_en,
    naturalTranslation: result.quick.lexical_unit?.meaning_vi,
    grammar: grammar ? { pattern: grammar.pattern, explanation: grammar.explanation_vi || grammar.explanation_en } : undefined,
    whyHere: result.deep.context_explanation_en || undefined,
    sentenceTranslation: result.deep.sentence_analysis.translation_vi || undefined,
    chunks: result.deep.sentence_analysis.chunks.map(chunk => ({ text: chunk.text, role: chunk.role, meaning: chunk.meaning_vi })),
    confidence: result.confidence
  };
}

export function applyExplanation(base: LookupResponse, explanation: ContextExplanation, source: LookupResponse['source'], engine?: LookupResponse['engine'], targetLang: 'en' | 'vi' = 'vi'): LookupResponse {
  const grammar = explanation.grammar || explanation.pattern ? {
    pattern: explanation.grammar?.pattern ?? explanation.pattern ?? '',
    explanation_en: explanation.grammar?.explanation ?? '', explanation_vi: explanation.grammar?.explanation ?? ''
  } : null;
  const definitionEn = explanation.definitionEn ?? base.quick.definition_en;
  const meaningVi = explanation.meaningVi ?? (targetLang === 'vi' ? explanation.meaning : undefined) ?? base.quick.meaning_vi[0];
  return { ...base, source, engine, confidence: explanation.confidence ?? base.confidence,
    quick: { ...base.quick, definition_en: definitionEn, meaning_vi: meaningVi ? [meaningVi] : base.quick.meaning_vi }, deep: {
    context_explanation_en: explanation.whyHere ?? explanation.sense ?? explanation.definitionEn ?? base.deep.context_explanation_en,
    context_explanation_vi: explanation.meaningVi ?? (targetLang === 'vi' ? explanation.meaning : undefined) ?? base.deep.context_explanation_vi,
    contrast: explanation.notThisMeaning ? [{ meaning: explanation.notThisMeaning, example: explanation.example ?? '', meaning_vi: explanation.notThisMeaning, reason_not_selected: explanation.notThisMeaning }] : [],
    grammar: grammar ?? base.deep.grammar,
    sentence_analysis: { translation_vi: explanation.sentenceTranslation ?? base.deep.sentence_analysis.translation_vi, chunks: explanation.chunks ? explanation.chunks.map(chunk => ({ text: chunk.text, role: chunk.role, meaning_vi: chunk.meaning ?? '' })) : base.deep.sentence_analysis.chunks }
  } };
}
