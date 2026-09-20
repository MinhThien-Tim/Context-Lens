import { dictionaryRegistry } from '../../lookup/dictionary/registry';

export type ComplexityLevel = 'simple' | 'medium' | 'complex';
export type ComplexityReason = 'exact-dictionary-match' | 'multiword-selection' | 'known-collocation' | 'polysemous-expression' | 'idiom' | 'abstract-language' | 'nested-syntax' | 'clause-attachment' | 'discourse-marker' | 'no-dictionary-entry';
export interface ComplexityEstimate { level: ComplexityLevel; reasons: ComplexityReason[] }

const ambiguous = /\b(account(?:s|ed)? for|make up|made up|take off|set up|bank|charge|interest|issue|subject|matter)\b/i;
const idiom = /\b(make up (?:my|your|his|her|our|their|one'?s) mind|break the ice|on the other hand|by and large)\b/i;
const abstract = /\b(ambiguity|institutional|epistemic|normative|contingent|paradigm|notwithstanding|thereby|wherein)\b/i;
const discourse = /\b(however|nevertheless|whereas|consequently|indeed|rather|while)\b/i;
const knownCollocation = /\b(maintain public confidence|account for \d+(?:\.\d+)?\s*(?:%|percent)|make up (?:my|your|his|her|our|their|one'?s) mind)\b/i;

export function estimateComplexity(selectedText: string, sentence: string): ComplexityEstimate {
  const selection = selectedText.trim();
  const reasons: ComplexityReason[] = [];
  const words = selection.split(/\s+/).filter(Boolean);
  const sentenceWords = sentence.split(/\s+/).filter(Boolean).length;
  const punctuation = sentence.match(/[,;—()]/g)?.length ?? 0;
  const clauses = sentence.match(/\b(?:that|which|who|whom|whose|although|because|unless|while|whereas)\b/gi)?.length ?? 0;
  const exact = dictionaryRegistry.lookup(selection);

  if (exact) reasons.push('exact-dictionary-match');
  if (words.length > 1) reasons.push('multiword-selection');
  if (knownCollocation.test(`${selection} ${sentence}`)) reasons.push('known-collocation');
  if (ambiguous.test(selection)) reasons.push('polysemous-expression');
  if (idiom.test(`${selection} ${sentence}`)) reasons.push('idiom');
  if (abstract.test(`${selection} ${sentence}`)) reasons.push('abstract-language');
  if (sentenceWords > 28 || punctuation > 3 || clauses > 2) reasons.push('nested-syntax');
  if (clauses > 1 && /\b(?:with|by|for|as)\b/i.test(sentence)) reasons.push('clause-attachment');
  if (discourse.test(selection) || (words.length <= 2 && discourse.test(sentence) && sentence.toLowerCase().includes(selection.toLowerCase()))) reasons.push('discourse-marker');
  if (!exact) reasons.push('no-dictionary-entry');

  const strong = reasons.filter(reason => ['idiom', 'abstract-language', 'nested-syntax', 'clause-attachment'].includes(reason)).length;
  const resolvedLocally = reasons.includes('known-collocation');
  const level: ComplexityLevel = strong >= 2 ? 'complex' : strong === 1 || (!resolvedLocally && reasons.some(reason => ['polysemous-expression', 'discourse-marker', 'multiword-selection'].includes(reason))) ? 'medium' : 'simple';
  return { level, reasons: [...new Set(reasons)] };
}
