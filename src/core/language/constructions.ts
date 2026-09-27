import type { StableGrammarPattern, TokenInfo } from './types';

/** Bounded occurrence features, independent of candidate dictionary senses. */
export interface ConstructionFeatures {
  imperative: boolean;
  complement: 'clause' | 'wh-clause' | 'infinitive' | 'bare-infinitive' | 'gerund' | 'object-adjective' | 'object-noun' | 'object-infinitive' | 'object-bare-infinitive' | 'double-object' | 'prepositional' | 'predicative' | 'object' | 'none';
  preposition?: string; particle?: string; objectHead?: number; indirectObjectHead?: number;
  passive: boolean; predicative: boolean; evaluationModifier: boolean;
}
const subjects = /^(?:i|you|he|she|it|we|they|[a-z]+['’](?:ll|d|s|re))$/;
const objects = /^(?:me|you|him|her|it|us|them|myself|yourself|himself|herself)$/;
const determiners = /^(?:a|an|the|my|your|his|her|their|our|this|that)$/;
const prepositions = /^(?:of|about|on|at|for|with|from|into|through|over|after|in|by|to)$/;
export function occurrenceConstruction(tokens: TokenInfo[], index: number): ConstructionFeatures {
  let start = index + 1;
  while (start < Math.min(tokens.length, index + 4) && /ly$|^(?:only|still|almost|nearly|never|not)$/.test(tokens[start].normalized)) start++;
  const next = tokens[start]?.normalized, second = tokens[start + 1]?.normalized;
  let complement: ConstructionFeatures['complement'] = 'none';
  let objectHead: number | undefined, indirectObjectHead: number | undefined;
  const nounHead = (at: number): number | undefined => {
    for (let i = at; i < Math.min(tokens.length, at + 4); i++) {
      if (tokens[i].pos === 'noun' || objects.test(tokens[i].normalized)) return i;
      if (!determiners.test(tokens[i].normalized) && tokens[i].pos !== 'adjective') return i === at + 1 && determiners.test(tokens[at].normalized) ? i : undefined;
    }
    return undefined;
  };
  if (next === 'that' || subjects.test(next ?? '')) complement = 'clause';
  else if (/^(?:what|who|why|where|when|how|whether|if)$/.test(next ?? '')) complement = 'wh-clause';
  else if (next === 'to' && second && !determiners.test(second) && !objects.test(second)) complement = 'infinitive';
  else if (/ing$/.test(next ?? '')) complement = 'gerund';
  else if (objects.test(next ?? '') || determiners.test(next ?? '') || tokens[start]?.pos === 'noun') {
    objectHead = nounHead(start);
    const after = objectHead === undefined ? undefined : tokens[objectHead + 1];
    if (after?.normalized === 'to' && tokens[objectHead! + 2]) complement = 'object-infinitive';
    else if (after && determiners.test(after.normalized)) { complement = 'double-object'; indirectObjectHead = objectHead; objectHead = nounHead(objectHead! + 1); }
    else if (after?.pos === 'verb') complement = 'object-bare-infinitive';
    else if (after?.pos === 'noun') complement = 'object-noun';
    else if (after && !prepositions.test(after.normalized) && !/^(?:and|but|because|before|after)$/.test(after.normalized)
      && (after.pos === 'adjective' || objects.test(next ?? ''))) complement = 'object-adjective';
    else complement = 'object';
  } else if (tokens[start]?.pos === 'verb') complement = 'bare-infinitive';
  let preposition: string | undefined, particle: string | undefined;
  for (let i = start; i < Math.min(tokens.length, start + 2); i++) {
    const word = tokens[i].normalized;
    if (/^(?:off|out|up|down|over)$/.test(word) && (!tokens[i + 1] || objects.test(tokens[i - 1]?.normalized ?? ''))) particle = word;
    else if (prepositions.test(word) && !(word === 'to' && complement.includes('infinitive'))) {
      preposition = word;
      if (complement === 'none') { complement = 'prepositional'; objectHead = nounHead(i + 1); }
    }
  }
  if (objects.test(next ?? '') && /^(?:off|out|up|down|over)$/.test(second ?? '')) { particle = second; complement = 'object'; }
  const predicative = complement === 'object-adjective' || complement === 'object-noun' || (complement === 'object-infinitive' && tokens[start + 2]?.normalized === 'be');
  if (/^(?:be|is|am|are|was|were|been)$/.test(tokens[index]?.normalized ?? '') && tokens[start]?.pos === 'adjective') complement = 'predicative';
  return { complement, preposition, particle, objectHead, indirectObjectHead, imperative: index === 0 && Boolean(next), predicative,
    evaluationModifier: /^(?:highly|well|poorly|badly|favorably|unfavorably)$/.test(tokens[index + 1]?.normalized ?? '') && preposition === 'of', passive: false };
}

export type GrammarCompatibility = 'MATCH' | 'UNKNOWN' | 'SOFT_CONFLICT' | 'HARD_CONFLICT';

/** WordNet frames describe attested usage, not an exhaustive complement inventory. */
export function frameEvidence(features: ConstructionFeatures, frames: number[]): GrammarCompatibility {
  const expected: Record<ConstructionFeatures['complement'], number[]> = {
    clause: [26], 'wh-clause': [26, 29], infinitive: [28, 32], 'bare-infinitive': [32],
    'object-infinitive': [24, 25], 'object-bare-infinitive': [25], 'object-adjective': [5, 9],
    'object-noun': [9], 'double-object': [14], prepositional: [15, 16, 17, 18, 19, 20, 21, 22],
    predicative: [6, 7], gerund: [33], object: [8, 9, 10, 11], none: [1, 2]
  };
  if (!frames.length || features.passive) return 'UNKNOWN';
  return frames.some(frame => expected[features.complement].includes(frame)) ? 'MATCH' : 'SOFT_CONFLICT';
}

export function frameCompatibility(features: ConstructionFeatures, frames: number[]): number {
  return frameEvidence(features, frames) === 'MATCH' ? 1 : 0;
}

/** Only controlled, explicit patterns can establish a hard complement contradiction. */
export function patternEvidence(a: StableGrammarPattern, b: StableGrammarPattern): GrammarCompatibility {
  const specific = ['clause', 'infinitive', 'gerund'];
  if ((specific.includes(a.complement) && specific.includes(b.complement) && a.complement !== b.complement)
    || (a.complement === b.complement && Boolean(a.preposition && b.preposition && a.preposition !== b.preposition))
    || Boolean(a.particle && b.particle && a.particle !== b.particle)) return 'HARD_CONFLICT';
  if (a.complement === b.complement && a.preposition === b.preposition && a.particle === b.particle) return 'MATCH';
  return 'UNKNOWN';
}
