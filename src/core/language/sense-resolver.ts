import { LexicalEngine } from './lexicon';
import { occurrenceConstruction, frameEvidence, patternEvidence } from './constructions';
import type { LexicalSense, SentenceAnalysis } from './types';

export interface SenseInput {
  selection: string; lemma: string; canonicalPhrase?: string; sentence: string;
  sentenceAnalysis?: SentenceAnalysis; selectionStart?: number; pos?: string;
  sentenceTranslationVi?: string; candidateSenses: LexicalSense[];
}
export interface SenseResolution {
  selectedSense?: LexicalSense; senseConfidence: number; posConfidence: number; contextMatch: boolean;
  status: 'context' | 'common' | 'ambiguous'; alternatives: LexicalSense[]; reasons: string[];
  diagnostics?: { senseId: string; score: number; semanticScore: number; reasons: string[] }[];
}

const stop = new Set('a an the to of for in on or and be is are was were something someone particular this that it they we you he she'.split(' '));
const viStop = new Set('lÃ  vÃ  cá»§a má»™t nhá»¯ng cÃ¡c cho vá»›i trong Ä‘Æ°á»£c bá»‹ Ä‘Ã£ Ä‘ang sáº½ thÃ¬ mÃ '.split(' '));

export class SenseResolver {
  constructor(private lexical = new LexicalEngine()) {}
  resolve(input: SenseInput): SenseResolution {
    const selectedWords = new Set(this.lexical.tokenize(input.canonicalPhrase ?? input.lemma).map(token => token.lemma));
    const context = new Set(this.lexical.tokenize(input.sentence).map(token => token.lemma)
      .filter(word => !stop.has(word) && !selectedWords.has(word)));
    const syntacticRole = inferSyntacticRole(input, this.lexical);
    const translationEvidence = alignedTranslationClause(input);
    const translatedClause = translationEvidence?.text;
    const matchingTranslationSenses = translatedClause ? input.candidateSenses.filter(sense =>
      Boolean(sense.alignment?.kind !== 'translated-definition' && !sense.alignment?.dependsOnSenseId && sense.meaningVi && sense.meaningVi.split(/\s*(?:\/|;)\s*/).some(meaning => containsWords(translatedClause, meaning)))) : [];
    const grammarEvidence = input.candidateSenses.map(sense => this.grammarEvidence(input, sense));
    const ranked = input.candidateSenses.map((sense, candidateIndex) => {
      let score = 0, semanticScore = 0;
      const reasons: string[] = [];
      if (!syntacticRole && input.pos && sense.pos === input.pos) score += 1.5;
      if (syntacticRole) {
        score += sense.pos === syntacticRole ? 8 : sense.pos ? -8 : 0;
        reasons.push(sense.pos === syntacticRole ? `Occurrence POS: ${syntacticRole}` : `POS conflict: occurrence ${syntacticRole}, candidate ${sense.pos ?? 'unknown'}`);
      }
      if (input.canonicalPhrase?.includes(' ') && input.candidateSenses.length === 1) { semanticScore += 5; reasons.push(`Recognized phrase: ${input.canonicalPhrase}`); }
      for (const collocation of sense.collocations ?? []) {
        if (occurrenceCollocation(input, collocation, this.lexical)) { semanticScore += 4; reasons.push(`Collocation: ${collocation}`); }
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
      const grammar = grammarEvidence[candidateIndex];
      reasons.push(...grammar.reasons);
      for (const event of grammar.events) {
        const peers = grammarEvidence.filter((peer, i) => peer.compatible && input.candidateSenses[i].pos === sense.pos);
        const supported = peers.filter(peer => peer.events.some(other => other.reason === event.reason)).length;
        const contribution = !grammar.compatible ? 0 : supported === 1 ? event.score : supported * 2 < peers.length ? Math.min(1, event.score) : 0;
        semanticScore += contribution;
        reasons.push(event.reason, `Grammar ranking contribution: ${contribution}`);
      }
      const translation = matchingTranslationSenses.length <= 1 ? translationScore(translatedClause, sense.alignment?.kind === 'translated-definition' || sense.alignment?.dependsOnSenseId ? undefined : sense.meaningVi) : { score: 0 };
      if (translation.score && !translationEvidence?.strong) {
        translation.score = Math.min(1, translation.score);
        translation.reason = 'Weak whole-sentence support from saved sentence translation; clause alignment unverified';
      }
      const independentSemanticScore = semanticScore;
      semanticScore += translation.score; if (translation.reason) reasons.push(translation.reason);
      score += semanticScore;
      return { sense, score, semanticScore, independentSemanticScore, reasons, compatible: grammar.compatible };
    });
    // Stage A: exclude explicit structural contradictions, retaining every dictionary sense.
    const compatible = ranked.filter(item => item.compatible);
    const ranking = compatible.length ? compatible : ranked;
    ranking.sort((left, right) => right.score - left.score);
    const best = ranking[0];
    if (!best) return { senseConfidence: 0, posConfidence: syntacticRole ? 0.9 : input.pos ? 0.65 : 0,
      contextMatch: false, status: 'ambiguous', alternatives: [], reasons: ['No local entry'] };
    const posConfidence = syntacticRole && syntacticRole === best.sense.pos ? 0.9 : input.pos && input.pos === best.sense.pos ? 0.65 : 0;
    const semanticRunnerUp = Math.max(0, ...ranking.slice(1).filter(item => (!syntacticRole || item.sense.pos === best.sense.pos) && !equivalentConstruction(best, item)).map(item => item.semanticScore));
    const semanticMargin = best.semanticScore - semanticRunnerUp;
    const contextMatch = best.compatible && best.semanticScore >= 3 && best.independentSemanticScore >= 2 && semanticMargin >= 2 && (!syntacticRole || !best.sense.pos || best.sense.pos === syntacticRole);
    // Close semantic evidence is not a reason to reverse dictionary order.
    if (!contextMatch) ranked.sort((left, right) =>
      (syntacticRole ? Number(right.sense.pos === syntacticRole) - Number(left.sense.pos === syntacticRole) : 0)
      || input.candidateSenses.indexOf(left.sense) - input.candidateSenses.indexOf(right.sense));
    if (contextMatch) ranked.sort((a, b) => Number(b === best) - Number(a === best) || b.score - a.score);
    const selected = contextMatch ? best : ranked[0];
    const samePos = ranked.filter(item => item.sense.pos === (syntacticRole ?? input.pos ?? best.sense.pos));
    const materiallyDifferent = samePos.some(item => item !== best && !equivalentMeaning(best.sense, item.sense));
    const status = contextMatch ? 'context' : materiallyDifferent ? 'ambiguous' : 'common';
    const senseConfidence = contextMatch ? Math.min(0.97, 0.68 + Math.min(best.semanticScore, 8) * 0.035
      + Math.min(semanticMargin, 4) * 0.025) : ranked.length === 1 ? 0.62 : 0.4;
    return { selectedSense: selected.sense, senseConfidence, posConfidence, contextMatch, status,
      alternatives: ranked.slice(1).map(item => item.sense),
      reasons: [...selected.reasons, `Semantic margin: ${semanticMargin}`, ...(contextMatch ? [] : ['No evidence distinguishing this meaning from the alternatives'])],
      diagnostics: ranked.map(item => ({ senseId: item.sense.id, score: item.score, semanticScore: item.semanticScore, reasons: item.reasons })) };
  }
  private grammarEvidence(input: SenseInput, sense: LexicalSense) {
    let compatible = true;
    const reasons: string[] = [], events: { score: number; reason: string }[] = [];
    const add = (score: number, reason: string) => events.push({ score, reason });
    const construction = constructionScore(input, sense);
    if (construction.reason) add(construction.score, construction.reason);
    const index = selectedTokenIndex(input);
    if (index >= 0 && sense.pos === 'verb' && input.sentenceAnalysis) {
      const features = input.sentenceAnalysis.grammar?.predicates.find(predicate => predicate.tokenIndex === index) ?? input.sentenceAnalysis.constructions?.[index] ?? occurrenceConstruction(input.sentenceAnalysis.tokens, index);
      const compatibility = frameEvidence(features, sense.verbFrames ?? []);
      if (sense.grammarPatterns?.length && sense.grammarPatterns.every(pattern => patternEvidence(features, pattern) === 'HARD_CONFLICT')) {
        compatible = false;
        reasons.push('Explicit grammar pattern: HARD_CONFLICT');
      }
      if (compatibility === 'MATCH') add(1, 'Frame match');
      reasons.push('Grammar complement: ' + features.complement);
      const predicate = input.sentenceAnalysis.grammar?.predicates.find(item => item.tokenIndex === index);
      if (predicate) {
        reasons.push(`Grammar predicate: ${predicate.lemma}; clause ${predicate.clauseIndex}; finite ${predicate.finite}; ${predicate.tense}/${predicate.aspect}; voice ${predicate.voice}; negated ${predicate.negated}; auxiliaries ${predicate.auxiliaryChain.join(',')}`);
        reasons.push(`Grammar arguments: subject ${predicate.subjectHead ?? 'unknown'}, object ${predicate.objectHead ?? 'unknown'}, indirect ${predicate.indirectObjectHead ?? 'unknown'}`);
        for (const modifier of predicate.modifiers) reasons.push(`Grammar modifier: ${modifier.kind} at ${modifier.tokenIndex}`);
      }
      if (features.preposition || features.particle) reasons.push(`Preposition/particle: ${features.preposition ?? 'none'}/${features.particle ?? 'none'}`);
      reasons.push(`Frame compatibility: ${compatibility} (${features.complement})`);
      if (features.evaluationModifier && /\b(?:regard|opinion|esteem|evaluate|rate)\b/i.test(sense.definitionEn)) {
        add(4, 'Evaluative modifier with of-complement');
      }
      if (features.preposition && /^(?:about|into|through)$/.test(features.preposition)
        && new RegExp(`\\b[a-z]+\\s+${features.preposition}\\b`, 'i').test(sense.definitionEn)) {
        add(4, `Definition argument pattern: ${features.preposition}`);
      }
      const examplePatterns = (sense.examples ?? []).flatMap(example => {
        const tokens = this.lexical.tokenize(example);
        const position = tokens.findIndex(token => token.lemma === input.lemma || sense.synonyms?.includes(token.lemma));
        return position < 0 ? [] : [occurrenceConstruction(tokens, position)];
      });
      const specific = features.complement !== 'none' && features.complement !== 'object';
      if (examplePatterns.some(pattern => (specific && pattern.complement === features.complement)
        || (features.predicative && pattern.predicative)
        || (features.preposition && pattern.preposition === features.preposition) || (features.particle && pattern.particle === features.particle))) {
        add(3, `Example construction: ${features.complement}${features.preposition ? ` + ${features.preposition}` : ''}`);
      }
    }
    return { reasons, events, compatible };
  }

}

function equivalentMeaning(left: LexicalSense, right: LexicalSense): boolean {
  const content = (value: string) => new Set(words(value.toLowerCase()).filter(word => word.length > 3 && !stop.has(word)));
  const a = content(left.definitionEn), b = content(right.definitionEn);
  const shared = [...a].filter(word => b.has(word)).length;
  return shared >= 2 && shared / Math.min(a.size, b.size) >= 0.5;
}

/** Sentence translation is usable only where the selected source clause can be identified. */
function alignedTranslationClause(input: SenseInput): { text: string; strong: boolean } | undefined {
  if (!input.sentenceTranslationVi) return undefined;
  const selectedIndex = selectedTokenIndex(input);
  const selected = input.sentenceAnalysis?.tokens[selectedIndex];
  if (!selected || selected.normalized !== input.selection.toLowerCase()) return undefined;
  const split = (value: string) => value.split(/[,;:.!?]+/).map(part => part.trim()).filter(Boolean);
  const sourceClauses = split(input.sentence);
  const translatedClauses = split(input.sentenceTranslationVi);
  // Clause counts do not establish alignment. Preserve only weak whole-sentence support
  // for multi-clause translations; independent lexical evidence still gates Context.
  const grammar = input.sentenceAnalysis?.grammar;
  const predicate = grammar?.predicates.find(item => item.tokenIndex === selectedIndex);
  const clause = predicate && grammar?.clauses[predicate.clauseIndex];
  const strong = Boolean(clause && grammar?.clauses.length === 1 && clause.start <= selected.start && selected.end <= clause.end
    && sourceClauses.length === 1 && translatedClauses.length === 1);
  if (sourceClauses.length !== 1 || translatedClauses.length !== 1 || !strong) return { text: input.sentenceTranslationVi, strong: false };
  let offset = 0;
  for (let index = 0; index < sourceClauses.length; index++) {
    const start = input.sentence.indexOf(sourceClauses[index], offset);
    if (start <= selected.start && selected.end <= start + sourceClauses[index].length) return { text: translatedClauses[index], strong };
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
  const detached = tokens[index] && /^\s*[,;]/.test(input.sentence.slice(tokens[index].end));
  if (atClauseStart && detached && sense.pos === 'adverb' && /^(?:still|however|nevertheless|nonetheless|yet)$/.test(tokens[index]?.normalized ?? '') && /\b(?:despite|nevertheless|contrary|concession|however)\b/.test(definition))
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

function inferSyntacticRole(input: SenseInput, lexical: LexicalEngine): 'verb' | 'noun' | 'adjective' | 'adverb' | undefined {
  const tokens = input.sentenceAnalysis?.tokens ?? [], index = selectedTokenIndex(input);
  if (index < 0) return undefined;
  if (input.sentenceAnalysis?.grammar?.predicates.some(predicate => predicate.tokenIndex === index)) return 'verb';
  const previous = tokens[index - 1]?.normalized, next = tokens[index + 1]?.normalized, beforePrevious = tokens[index - 2]?.normalized;
  const subjects = new Set(['i', 'we', 'you', 'they', 'he', 'she', 'it']);
  const auxiliaries = new Set(['did', 'do', 'does', 'have', 'has', 'had', 'would', 'could', 'will', 'shall', 'should', 'can', 'may', 'might', 'must']);
  const determiners = new Set(['a', 'an', 'the', 'this', 'that', 'my', 'our', 'their', 'his', 'her', 'its']);
  const linking = new Set(['be', 'is', 'am', 'are', 'was', 'were', 'seem', 'seems', 'seemed', 'feel', 'feels', 'felt', 'become', 'became']);
  if ((subjects.has(previous) || auxiliaries.has(previous)) && input.candidateSenses.some(sense => sense.pos === 'adverb')
    && next && lexical.lookup(next)?.pos.includes('verb')) return 'adverb';
  if (subjects.has(previous) || auxiliaries.has(previous) || previous === 'to') return 'verb';
  // Auxiliary inversion can separate the auxiliary from its lexical verb by a subject NP.
  if (tokens.slice(0, index).some(token => auxiliaries.has(token.normalized)) && /^(?:what|why|when|where|how|who)$/.test(tokens[0]?.normalized ?? '') && (!next || next === 'to')) return 'verb';
  if (index === 0 && /^(?:about|of|to|twice|once)$/.test(next ?? '')) return 'verb';
  if (determiners.has(previous)) return (tokens[index + 1]?.pos === 'noun' || (next && lexical.lookup(next)?.pos.includes('noun') && !lexical.lookup(next)?.pos.includes('verb')))
    && input.candidateSenses.some(sense => sense.pos === 'adjective') ? 'adjective' : 'noun';
  if (tokens[index + 1]?.pos === 'noun') return 'adjective';
  if (linking.has(previous) || (linking.has(beforePrevious) && /ly$|^(?:very|quite|rather|so|too)$/.test(previous ?? ''))) return 'adjective';
  if (index === 0 && determiners.has(next) && input.candidateSenses.some(sense => sense.pos === 'verb')) return 'verb';
  return undefined;
}

function selectedTokenIndex(input: SenseInput): number {
  const tokens = input.sentenceAnalysis?.tokens ?? [];
  if (input.selectionStart !== undefined) return tokens.findIndex(token => token.start === input.selectionStart && token.normalized === input.selection.toLowerCase());
  const normalized = input.selection.toLocaleLowerCase();
  const matches = tokens.map((token, index) => token.normalized === normalized ? index : -1).filter(index => index >= 0);
  return matches.length === 1 ? matches[0] : -1;
}
function occurrenceCollocation(input: SenseInput, collocation: string, lexical: LexicalEngine): boolean {
  const tokens = input.sentenceAnalysis?.tokens ?? lexical.tokenize(input.sentence);
  const pattern = lexical.tokenize(collocation).map(token => token.lemma);
  const matches = tokens.map((token, index) => token.normalized === input.selection.toLowerCase() ? index : -1).filter(index => index >= 0);
  const index = input.selectionStart === undefined ? (matches.length === 1 ? matches[0] : -1)
    : tokens.findIndex(token => token.start === input.selectionStart);
  if (index < 0 || !pattern.length) return false;
  return tokens.some((_, start) => start <= index && index < start + pattern.length
    && pattern.every((lemma, offset) => tokens[start + offset]?.lemma === lemma));
}
function words(value: string): string[] { return value.match(/[\p{L}\p{M}]+/gu) ?? []; }
function normalizeVietnamese(value: string): string { return value.normalize('NFC').toLocaleLowerCase('vi').replace(/[^\p{L}\p{M}\s]/gu, ' ').replace(/\s+/g, ' ').trim(); }
function containsWords(haystack: string, needle: string): boolean {
  const normalizedNeedle = normalizeVietnamese(needle);
  return Boolean(normalizedNeedle) && ` ${normalizeVietnamese(haystack)} `.includes(` ${normalizedNeedle} `);
}
