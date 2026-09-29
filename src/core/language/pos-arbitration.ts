import type { SentenceAnalysis } from './types';

export type ContextPos = 'verb' | 'noun' | 'adjective' | 'adverb';

/** Grammar selects only a POS already supplied by the lexical entry or its senses. */
export function occurrencePos(analysis: SentenceAnalysis | undefined, index: number, candidates: readonly string[], nextPos: readonly string[] = []): ContextPos | undefined {
  if (!analysis || index < 0) return undefined;
  const allowed = new Set(candidates);
  const tokens = analysis.tokens;
  const previousToken = tokens[index - 1];
  const previous = previousToken?.normalized;
  const next = tokens[index + 1];
  const nextCanBeNoun = next?.pos === 'noun' || next?.posCandidates?.includes('noun');
  const has = (pos: ContextPos) => allowed.has(pos);
  if (has('verb') && analysis.grammar?.predicates.some(predicate => predicate.tokenIndex === index)) return 'verb';
  if (allowed.size === 1) {
    const only = [...allowed][0];
    return /^(?:verb|noun|adjective|adverb)$/.test(only) ? only as ContextPos : undefined;
  }
  if (has('adverb') && /^(?:i|we|you|they|he|she|it)$/.test(previous ?? '')
    && (next?.pos === 'verb' || next?.posCandidates?.includes('verb') || nextPos.includes('verb'))) return 'adverb';
  if (has('verb') && /^(?:i|we|you|they|he|she|it)$/.test(previous ?? '') && !has('adverb')) return 'verb';
  if (has('verb') && /^(?:i|we|you|they|he|she|it)$/.test(previous ?? '') && next?.pos !== 'verb') return 'verb';
  if (has('verb') && index === 0 && next && !/^(?:a|an|the)$/.test(tokens[0].normalized)
    && !has('adverb')) return 'verb';
  if (has('verb') && analysis.tokens[0]?.normalized === 'what'
    && analysis.tokens.slice(0, index).some(item => /^(?:do|does|did)$/.test(item.normalized))) return 'verb';
  if (has('adverb') && next && (next.pos === 'adjective' || next.pos === 'verb'
    || next.pos === 'adverb') && !/^(?:a|an|the)$/.test(next.normalized)) return 'adverb';
  if (has('verb') && /^(?:to|can|could|may|might|must|shall|should|will|would|do|does|did)$/.test(previous ?? '')) return 'verb';
  if (has('verb') && /^(?:get|gets|got|getting)$/.test(previous ?? '')) return 'verb';
  if (has('verb') && previousToken?.pos === 'noun' && next?.pos === 'adverb') return 'verb';
  if (has('noun') && /^(?:a|an|the|this|that|my|our|their|his|her|its)$/.test(previous ?? '')
    && (!next || !nextCanBeNoun || !has('adjective'))) return 'noun';
  if (has('adjective') && nextCanBeNoun && /^(?:a|an|the|this|that|my|our|their|his|her|its)$/.test(previous ?? '')) return 'adjective';
  if (has('adjective') && nextCanBeNoun && !has('noun')) return 'adjective';
  if (has('adjective') && /^(?:is|am|are|was|were|be|seem|seems|feel|feels|become|became)$/.test(previous ?? '')
    && !has('noun') && !has('adverb')) return 'adjective';
  return undefined;
}
