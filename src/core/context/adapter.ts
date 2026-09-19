import type { LookupResponse } from '../../lookup/types';
import type { ContextExplanation } from './types';

export function explanationFromLookup(result: LookupResponse): ContextExplanation {
  const grammar = result.deep.grammar;
  return {
    meaning: result.deep.context_explanation_vi || result.deep.context_explanation_en || result.quick.meaning_vi[0] || result.quick.definition_en,
    naturalTranslation: result.quick.lexical_unit?.meaning_vi,
    grammar: grammar ? { pattern: grammar.pattern, explanation: grammar.explanation_vi || grammar.explanation_en } : undefined,
    whyHere: result.deep.context_explanation_en || undefined,
    sentenceTranslation: result.deep.sentence_analysis.translation_vi || undefined,
    chunks: result.deep.sentence_analysis.chunks.map(chunk => ({ text: chunk.text, role: chunk.role, meaning: chunk.meaning_vi })),
    confidence: result.confidence
  };
}

export function applyExplanation(base: LookupResponse, explanation: ContextExplanation, source: LookupResponse['source'], engine?: LookupResponse['engine']): LookupResponse {
  const explanationText = explanation.meaning ?? explanation.simplified ?? explanation.whyHere ?? '';
  const grammar = explanation.grammar || explanation.pattern ? {
    pattern: explanation.grammar?.pattern ?? explanation.pattern ?? '',
    explanation_en: explanation.grammar?.explanation ?? '', explanation_vi: explanation.grammar?.explanation ?? ''
  } : null;
  return { ...base, source, engine, confidence: explanation.confidence ?? base.confidence, deep: {
    context_explanation_en: explanation.whyHere ?? explanation.sense ?? explanationText,
    context_explanation_vi: explanationText,
    contrast: explanation.notThisMeaning ? [{ meaning: explanation.notThisMeaning, example: explanation.example ?? '', meaning_vi: explanation.notThisMeaning, reason_not_selected: explanation.notThisMeaning }] : [],
    grammar,
    sentence_analysis: { translation_vi: explanation.sentenceTranslation ?? explanation.naturalTranslation ?? '', chunks: (explanation.chunks ?? []).map(chunk => ({ text: chunk.text, role: chunk.role, meaning_vi: chunk.meaning ?? '' })) }
  } };
}
