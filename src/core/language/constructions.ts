import type { TokenInfo } from './types';

/** Bounded occurrence features, independent of candidate dictionary senses. */
export interface ConstructionFeatures {
  imperative: boolean;
  complement: 'clause' | 'wh-clause' | 'infinitive' | 'gerund' | 'object-adjective' | 'object-infinitive' | 'object' | 'none';
  preposition?: string;
  passive: boolean;
  predicative: boolean;
  evaluationModifier: boolean;
}
const subjects = /^(?:i|you|he|she|it|we|they|[a-z]+['’](?:ll|d|s|re))$/;
const objects = /^(?:me|you|him|her|it|us|them|myself|yourself|himself|herself)$/;
const prepositions = /^(?:of|about|on|at|for|with|from|into|through|over)$/;
export function occurrenceConstruction(tokens: TokenInfo[], index: number): ConstructionFeatures {
  const following = tokens.slice(index + 1, index + 6).map(token => token.normalized);
  const [next, second] = following;
  let complement: ConstructionFeatures['complement'] = 'none';
  if (next === 'that' || subjects.test(next ?? '')) complement = 'clause';
  else if (/^(?:what|who|why|where|when|how|whether)$/.test(next ?? '')) complement = 'wh-clause';
  else if (next === 'to' && second) complement = 'infinitive';
  else if (objects.test(next ?? '') && second === 'to') complement = 'object-infinitive';
  else if (objects.test(next ?? '') && second && !prepositions.test(second)) complement = 'object-adjective';
  else if (/ing$/.test(next ?? '')) complement = 'gerund';
  else if (/^(?:a|an|the|my|your|his|her|their|our)$/.test(next ?? '') || objects.test(next ?? '')) complement = 'object';
  const preposition = following.find((word, offset) => offset < 2 && prepositions.test(word));
  return { complement, preposition, imperative: index === 0 && Boolean(next),
    predicative: complement === 'object-adjective' || (complement === 'object-infinitive' && following[2] === 'be'),
    evaluationModifier: /^(?:highly|well|poorly|badly|favorably|unfavorably)$/.test(next ?? '') && second === 'of',
    passive: /^(?:be|is|are|was|were|been|being|get|got)$/.test(tokens[index - 1]?.normalized ?? '') && /ed$/.test(tokens[index]?.normalized ?? '') };
}

export function frameCompatibility(features: ConstructionFeatures, frames: number[]): number {
  const expected: Record<ConstructionFeatures['complement'], number[]> = {
    clause: [26], 'wh-clause': [26, 29], infinitive: [28, 32],
    'object-infinitive': [9, 24, 25], 'object-adjective': [5, 9], gerund: [33], object: [8, 9, 10, 11], none: [1, 2]
  };
  if (!frames.length) return 0;
  return frames.some(frame => expected[features.complement].includes(frame)) ? 1 : -1;
}
