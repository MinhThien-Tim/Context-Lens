import type { TokenInfo } from './types';
import { occurrenceConstruction, type ConstructionFeatures } from './constructions';

export interface ClauseSpan { start: number; end: number; tokenStart: number; tokenEnd: number }
export interface PredicateFeature extends ConstructionFeatures {
  tokenIndex: number; lemma: string; clauseIndex: number; auxiliaryChain: number[];
  finite: boolean; tense: 'present' | 'past' | 'modal' | 'unknown';
  aspect: 'simple' | 'progressive' | 'perfect' | 'perfect-progressive';
  voice: 'active' | 'passive' | 'unknown'; negated: boolean;
  subjectHead?: number; objectHead?: number; indirectObjectHead?: number;
  modifiers: { tokenIndex: number; kind: 'evaluation' | 'degree' | 'aspectual' | 'frequency' | 'focus' }[];
}
const auxiliary = /^(?:am|is|are|was|were|be|been|being|have|has|had|do|does|did|can|could|may|might|must|will|would|shall|should)$/;
const negative = /^(?:not|never)$|n't$/;
const subject = /^(?:i|you|he|she|it|we|they)$/;
const determiner = /^(?:a|an|the|this|that|my|your|his|her|our|their|its)$/;
const modifierClasses = [
  ['evaluation', /^(?:highly|well|poorly|badly|favorably|unfavorably)$/],
  ['degree', /^(?:nearly|almost|very|quite|rather|too)$/],
  ['aspectual', /^(?:still|already|yet)$/],
  ['frequency', /^(?:often|always|sometimes|never)$/],
  ['focus', /^(?:only|even|just)$/]
] as const;

/** Linear clause partition and fixed-size predicate windows; no sense or network dependency. */
export function analyzeGrammar(tokens: TokenInfo[], text: string) {
  const starts = [0];
  for (let i = 1; i < tokens.length; i++) {
    const word = tokens[i].normalized;
    const punctuation = /[;.!?]|,/.test(text.slice(tokens[i - 1].end, tokens[i].start));
    const marker = /^(?:that|whether|if|because|although|though|while|when|who|which|what|where|why|how)$/.test(word);
    const coordinate = /^(?:and|but|yet|or)$/.test(word) && subject.test(tokens[i + 1]?.normalized ?? '');
    if (punctuation || coordinate || (marker && !determiner.test(tokens[i - 1].normalized)
      && (subject.test(tokens[i + 1]?.normalized ?? '') || auxiliary.test(tokens[i + 1]?.normalized ?? '')))) starts.push(i);
  }
  const clauses: ClauseSpan[] = starts.filter(start => start < tokens.length).map((start, i) => ({
    tokenStart: start, tokenEnd: starts[i + 1] ?? tokens.length,
    start: tokens[start].start, end: tokens[(starts[i + 1] ?? tokens.length) - 1].end
  }));
  const predicates: PredicateFeature[] = [];
  const tokenClauses = tokens.map(() => 0);
  clauses.forEach((clause, clauseIndex) => {
    for (let i = clause.tokenStart; i < clause.tokenEnd; i++) {
      tokenClauses[i] = clauseIndex;
      const token = tokens[i], previous = tokens[i - 1];
      if (auxiliary.test(token.normalized) || negative.test(token.normalized) || /ly$/.test(token.normalized)
        || modifierClasses.some(([, pattern]) => pattern.test(token.normalized))) continue;
      const before = tokens.slice(Math.max(clause.tokenStart, i - 6), i);
      const chain = before.filter(t => auxiliary.test(t.normalized) || /n't$/.test(t.normalized));
      const precedingContent = [...before].reverse().find(t => !negative.test(t.normalized) && !modifierClasses.some(([, pattern]) => pattern.test(t.normalized)));
      const structural = subject.test(precedingContent?.normalized ?? '') || previous?.normalized === 'to'
        || (chain.length > 0 && !determiner.test(previous?.normalized ?? '') && token.pos !== 'noun' && token.pos !== 'adjective');
      const imperative = i === clause.tokenStart && (determiner.test(tokens[i + 1]?.normalized ?? '') || /^(?:about|of|twice|once)$/.test(tokens[i + 1]?.normalized ?? ''));
      if (!(token.pos === 'verb' || structural || imperative) || determiner.test(previous?.normalized ?? '')) continue;
      const construction = occurrenceConstruction(tokens.slice(0, clause.tokenEnd), i);
      // A complement marker belongs to the following clause but is still visible to its governor.
      if (tokens[clause.tokenEnd]?.normalized === 'that') construction.complement = 'clause';
      else if (/^(?:whether|what|who|where|why|how)$/.test(tokens[clause.tokenEnd]?.normalized ?? '')) construction.complement = 'wh-clause';
      const progressive = /ing$/.test(token.normalized) && chain.some(t => /^(?:am|is|are|was|were|be|been|being)$/.test(t.normalized));
      const perfect = chain.some(t => /^(?:have|has|had)$/.test(t.normalized));
      const participle = /ed$|en$/.test(token.normalized) || (token.lemma !== token.normalized && !/s$|ing$/.test(token.normalized));
      const be = chain.some(t => /^(?:am|is|are|was|were|be|been|being)$/.test(t.normalized));
      // Ambiguous adjectival participles require lexical verb evidence or an explicit agent.
      const passive = be && participle && !progressive && (token.pos === 'verb' || tokens.slice(i + 1, i + 5).some(t => t.normalized === 'by'));
      const subjectToken = [...before].reverse().find(t => subject.test(t.normalized) || t.pos === 'noun');
      const modifiers = tokens.slice(Math.max(clause.tokenStart, i - 2), Math.min(clause.tokenEnd, i + 3)).flatMap(t =>
        modifierClasses.flatMap(([kind, pattern]) => pattern.test(t.normalized) ? [{ tokenIndex: tokens.indexOf(t), kind }] : []));
      predicates.push({ ...construction, passive, tokenIndex: i, lemma: token.lemma, clauseIndex,
        auxiliaryChain: chain.map(t => tokens.indexOf(t)), finite: previous?.normalized !== 'to' && !(/ing$/.test(token.normalized) && !chain.length),
        tense: chain.some(t => /^(?:can|could|may|might|must|will|would|shall|should)$/.test(t.normalized)) ? 'modal'
          : chain.some(t => /^(?:was|were|had|did)$/.test(t.normalized)) || /ed$/.test(token.normalized) ? 'past' : structural || imperative || /s$/.test(token.normalized) ? 'present' : 'unknown',
        aspect: perfect ? progressive ? 'perfect-progressive' : 'perfect' : progressive ? 'progressive' : 'simple',
        voice: passive ? 'passive' : be && participle && !progressive ? 'unknown' : 'active',
        negated: before.some(t => negative.test(t.normalized)), subjectHead: subjectToken ? tokens.indexOf(subjectToken) : undefined,
        modifiers });
    }
  });
  return { clauses, predicates, tokenClauses };
}

