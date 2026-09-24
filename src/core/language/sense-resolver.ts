import { LexicalEngine } from './lexicon';
import type { LexicalSense, SentenceAnalysis } from './types';

export interface SenseInput {
  selection: string; lemma: string; canonicalPhrase?: string; sentence: string;
  sentenceAnalysis?: SentenceAnalysis; selectionStart?: number; pos?: string;
  sentenceTranslationVi?: string; candidateSenses: LexicalSense[];
}
export interface SenseResolution {
  selectedSense?: LexicalSense; senseConfidence: number; posConfidence: number; contextMatch: boolean;
  status: 'context' | 'common' | 'ambiguous'; alternatives: LexicalSense[]; reasons: string[];
}

const stop = new Set('a an the to of for in on or and be is are was were something someone particular this that it they we you he she'.split(' '));
const viStop = new Set('là và của một những các cho với trong được bị đã đang sẽ thì mà'.split(' '));

export class SenseResolver {
  constructor(private lexical = new LexicalEngine()) {}
  resolve(input: SenseInput): SenseResolution {
    const selectedWords = new Set(this.lexical.tokenize(input.canonicalPhrase ?? input.lemma).map(token => token.lemma));
    const context = new Set(this.lexical.tokenize(input.sentence).map(token => token.lemma)
      .filter(word => !stop.has(word) && !selectedWords.has(word)));
    const syntacticRole = inferSyntacticRole(input);
    const translatedClause = alignedTranslationClause(input);
    const matchingTranslationSenses = translatedClause ? input.candidateSenses.filter(sense =>
      Boolean(sense.meaningVi && sense.meaningVi.split(/\s*(?:\/|;)\s*/).some(meaning => containsWords(translatedClause, meaning)))) : [];
    const ranked = input.candidateSenses.map(sense => {
      let score = 0, semanticScore = 0;
      const reasons: string[] = [];
      if (input.pos && sense.pos === input.pos) score += 1.5;
      if (syntacticRole && sense.pos === syntacticRole) score += 1;
      if (input.canonicalPhrase?.includes(' ')) { semanticScore += 5; reasons.push(`Recognized phrase: ${input.canonicalPhrase}`); }
      for (const collocation of sense.collocations ?? []) {
        if (containsWords(input.sentence, collocation)) { semanticScore += 4; reasons.push(`Collocation: ${collocation}`); }
      }
      const evidenceWords = new Set(this.lexical.tokenize([sense.definitionEn, ...(sense.examples ?? []), ...(sense.synonyms ?? []),
        ...(sense.domains ?? [])].join(' ')).map(token => token.lemma).filter(word => !stop.has(word) && word.length > 2));
      const keywordWords = new Set(this.lexical.tokenize((sense.keywords ?? []).join(' ')).map(token => token.lemma));
      const overlap = [...evidenceWords].filter(word => context.has(word));
      if (overlap.length >= 2) { semanticScore += Math.min(3, overlap.length); reasons.push(`Meaning evidence in sentence: ${overlap.join(', ')}`); }
      const keywordOverlap = [...keywordWords].filter(word => context.has(word));
      if (keywordOverlap.length) { semanticScore += Math.min(6, keywordOverlap.length * 3); reasons.push(`Sense keyword: ${keywordOverlap.join(', ')}`); }
      const semanticHints = input.sentenceAnalysis?.semanticHints.filter(hint => evidenceWords.has(hint) || keywordWords.has(hint)) ?? [];
      if (semanticHints.length) { semanticScore += 4; reasons.push(`Sentence structure hint: ${semanticHints.join(', ')}`); }
      const construction = constructionScore(input, sense);
      semanticScore += construction.score; if (construction.reason) reasons.push(construction.reason);
      const translation = matchingTranslationSenses.length <= 1 ? translationScore(translatedClause, sense.meaningVi) : { score: 0 };
      semanticScore += translation.score; if (translation.reason) reasons.push(translation.reason);
      score += semanticScore;
      return { sense, score, semanticScore, reasons };
    }).sort((left, right) => right.score - left.score || right.semanticScore - left.semanticScore
      || Number(Boolean(right.sense.meaningVi)) - Number(Boolean(left.sense.meaningVi))
      || (right.sense.frequency ?? 0) - (left.sense.frequency ?? 0));
    const best = ranked[0];
    if (!best) return { senseConfidence: 0, posConfidence: syntacticRole ? 0.9 : input.pos ? 0.65 : 0,
      contextMatch: false, status: 'ambiguous', alternatives: [], reasons: ['No local entry'] };
    const posConfidence = syntacticRole === best.sense.pos ? 0.9 : input.pos === best.sense.pos ? 0.65 : best.sense.pos ? 0.45 : 0;
    const semanticRunnerUp = Math.max(0, ...ranked.slice(1).filter(item => !equivalentConstruction(best, item)).map(item => item.semanticScore));
    const semanticMargin = best.semanticScore - semanticRunnerUp;
    const contextMatch = best.semanticScore >= 3 && (ranked.length === 1 || semanticMargin >= 1);
    const samePos = ranked.filter(item => item.sense.pos === (syntacticRole ?? input.pos ?? best.sense.pos));
    const materiallyDifferent = samePos.some(item => item !== best && !equivalentMeaning(best.sense, item.sense));
    const status = contextMatch ? 'context' : materiallyDifferent ? 'ambiguous' : 'common';
    const senseConfidence = contextMatch ? Math.min(0.97, 0.68 + Math.min(best.semanticScore, 8) * 0.035
      + Math.min(semanticMargin, 4) * 0.025) : ranked.length === 1 ? 0.62 : 0.4;
    return { selectedSense: best.sense, senseConfidence, posConfidence, contextMatch, status,
      alternatives: ranked.slice(1).map(item => item.sense),
      reasons: best.reasons.length ? best.reasons : ['No evidence distinguishing this meaning from the alternatives'] };
  }
}

function equivalentMeaning(left: LexicalSense, right: LexicalSense): boolean {
  const content = (value: string) => new Set(words(value.toLowerCase()).filter(word => word.length > 3 && !stop.has(word)));
  const a = content(left.definitionEn), b = content(right.definitionEn);
  const shared = [...a].filter(word => b.has(word)).length;
  return shared >= 2 && shared / Math.min(a.size, b.size) >= 0.5;
}

/** Sentence translation is usable only where the selected source clause can be identified. */
function alignedTranslationClause(input: SenseInput): string | undefined {
  if (!input.sentenceTranslationVi) return undefined;
  const selectedIndex = selectedTokenIndex(input);
  const selected = input.sentenceAnalysis?.tokens[selectedIndex];
  if (!selected || input.sentenceAnalysis?.tokens.filter(token => token.normalized === selected.normalized).length !== 1) return undefined;
  const split = (value: string) => value.split(/[,;:.!?]+/).map(part => part.trim()).filter(Boolean);
  const sourceClauses = split(input.sentence);
  const translatedClauses = split(input.sentenceTranslationVi);
  if (sourceClauses.length !== translatedClauses.length) return undefined;
  let offset = 0;
  for (let index = 0; index < sourceClauses.length; index++) {
    const start = input.sentence.indexOf(sourceClauses[index], offset);
    if (start <= selected.start && selected.end <= start + sourceClauses[index].length) return translatedClauses[index];
    offset = start + sourceClauses[index].length;
  }
  return undefined;
}

function equivalentConstruction(left: { sense: LexicalSense; reasons: string[] }, right: { sense: LexicalSense; reasons: string[] }): boolean {
  if (!left.sense.pos || left.sense.pos !== right.sense.pos) return false;
  const construction = left.reasons.find(reason => /^(?:Aspectual|Degree|Clause-level)/.test(reason));
  if (!construction || !right.reasons.includes(construction)) return false;
  const leftWords = new Set(words(left.sense.definitionEn.toLowerCase()).filter(word => !stop.has(word)));
  return equivalentMeaning(left.sense, right.sense) || words(right.sense.definitionEn.toLowerCase()).filter(word => leftWords.has(word)).length >= 2;
}

function constructionScore(input: SenseInput, sense: LexicalSense): { score: number; reason?: string } {
  const tokens = input.sentenceAnalysis?.tokens ?? [], index = selectedTokenIndex(input);
  if (index < 0) return { score: 0 };
  const previous = tokens[index - 1]?.normalized, next = tokens[index + 1]?.normalized;
  const definition = `${sense.definitionEn} ${(sense.keywords ?? []).join(' ')}`.toLowerCase();
  if (next === 'to' && tokens[index + 2] && /\b(?:try|trying|effort|attempt|difficult|strenuous)\b/.test(definition))
    return { score: 4, reason: 'Effort verb followed by an infinitive' };
  if (/^(?:more|less|better|worse|another|further)$/.test(next ?? '') && /\b(?:degree|extent|comparison|more|less|another)\b/.test(definition))
    return { score: 4, reason: 'Degree or comparison construction' };
  const atClauseStart = index === 0 || /^(?:but|and|yet|although|though)$/.test(previous ?? '');
  if (atClauseStart && /\b(?:despite|nevertheless|contrary|concession|however)\b/.test(definition))
    return { score: 3.5, reason: 'Clause-level contrast construction' };
  const beforePredicate = sense.pos === 'adverb' && Boolean(next) && !/^(?:more|less|another)$/.test(next!);
  if (beforePredicate && /\b(?:continu|remain|change|interruption|cessation|time)\w*\b/.test(definition))
    return { score: 4, reason: 'Aspectual adverb before the predicate' };
  return { score: 0 };
}

function translationScore(translation: string | undefined, meaning: string | undefined): { score: number; reason?: string } {
  if (!translation || !meaning) return { score: 0 };
  const translated = normalizeVietnamese(translation);
  const alternatives = meaning.split(/\s*(?:\/|;)\s*/).map(normalizeVietnamese).filter(Boolean);
  if (alternatives.some(candidate => containsWords(translated, candidate)))
    return { score: 4, reason: 'Linked dictionary meaning appears in the saved sentence translation' };
  const translatedWords = new Set(words(translated).filter(word => !viStop.has(word)));
  const overlap = alternatives.flatMap(words).filter(word => word.length > 2 && !viStop.has(word) && translatedWords.has(word));
  return new Set(overlap).size >= 2 ? { score: 2.5, reason: 'Saved sentence translation supports this linked meaning' } : { score: 0 };
}

function inferSyntacticRole(input: SenseInput): 'verb' | 'noun' | 'adjective' | undefined {
  const tokens = input.sentenceAnalysis?.tokens ?? [], index = selectedTokenIndex(input);
  if (index < 0) return undefined;
  const previous = tokens[index - 1]?.normalized, next = tokens[index + 1]?.normalized, beforePrevious = tokens[index - 2]?.normalized;
  const subjects = new Set(['i', 'we', 'you', 'they', 'he', 'she', 'it']);
  const auxiliaries = new Set(['did', 'do', 'does', 'have', 'has', 'had', 'would', 'could', 'will', 'shall', 'should', 'can', 'may', 'might', 'must']);
  const determiners = new Set(['a', 'an', 'the', 'this', 'that', 'my', 'our', 'their', 'his', 'her', 'its']);
  const linking = new Set(['be', 'is', 'am', 'are', 'was', 'were', 'seem', 'seems', 'seemed', 'feel', 'feels', 'felt', 'become', 'became']);
  if (subjects.has(previous) || auxiliaries.has(previous) || previous === 'to') return 'verb';
  if (determiners.has(previous)) return next && input.candidateSenses.some(sense => sense.pos === 'adjective') ? 'adjective' : 'noun';
  if (tokens[index + 1]?.pos === 'noun') return 'adjective';
  if (linking.has(previous) || (linking.has(beforePrevious) && /ly$|^(?:very|quite|rather|so|too)$/.test(previous ?? ''))) return 'adjective';
  return undefined;
}

function selectedTokenIndex(input: SenseInput): number {
  const tokens = input.sentenceAnalysis?.tokens ?? [];
  if (input.selectionStart !== undefined) { const exact = tokens.findIndex(token => token.start === input.selectionStart); if (exact >= 0) return exact; }
  const normalized = input.selection.toLocaleLowerCase();
  return tokens.findIndex(token => token.normalized === normalized);
}
function words(value: string): string[] { return value.match(/[\p{L}\p{M}]+/gu) ?? []; }
function normalizeVietnamese(value: string): string { return value.normalize('NFC').toLocaleLowerCase('vi').replace(/[^\p{L}\p{M}\s]/gu, ' ').replace(/\s+/g, ' ').trim(); }
function containsWords(haystack: string, needle: string): boolean {
  const normalizedNeedle = normalizeVietnamese(needle);
  return Boolean(normalizedNeedle) && ` ${normalizeVietnamese(haystack)} `.includes(` ${normalizedNeedle} `);
}
