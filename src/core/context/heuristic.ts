import type { ContextInput, ContextResult } from './types';
import { matchKnownExpression } from './language-rules';
export function heuristicContext(input: ContextInput): ContextResult | null {
  if (!['meaning-in-context', 'phrase', 'idiom', 'word-sense', 'nuance'].includes(input.mode) || input.sourceLang !== 'en') return null;
  const match = matchKnownExpression(input.request.selection, input.request.sentence);
  if (!match) return null;
  return { provider: 'heuristic', explanation: { meaning: match.meaningVi, sense: match.meaningEn, whyHere: match.whyHere, notThisMeaning: match.notThisMeaning, grammar: { pattern: match.pattern, explanation: match.meaningEn }, confidence: match.confidence } };
}
