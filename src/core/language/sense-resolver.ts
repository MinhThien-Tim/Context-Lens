import { LexicalEngine } from './lexicon';
import type { LexicalSense, SentenceAnalysis } from './types';

export interface SenseInput {
  selection: string; lemma: string; canonicalPhrase?: string; sentence: string;
  sentenceAnalysis?: SentenceAnalysis; pos?: string; candidateSenses: LexicalSense[];
}
const stop = new Set('a an the to of for in on or and be something someone particular'.split(' '));
export class SenseResolver {
  constructor(private lexical = new LexicalEngine()) {}
  resolve(input: SenseInput): { selectedSense?: LexicalSense; confidence: number; alternatives: LexicalSense[]; reasons: string[] } {
    const selectedWords = new Set(this.lexical.tokenize(input.canonicalPhrase ?? input.lemma).map(t => t.lemma));
    const context = new Set(this.lexical.tokenize(input.sentence).map(t => t.lemma).filter(word => !stop.has(word) && !selectedWords.has(word)));
    const syntacticRole = inferSyntacticRole(input);
    const ranked = input.candidateSenses.map(sense => {
      let score = 0;
      const reasons: string[] = [];
      if (input.pos && sense.pos === input.pos) { score += 2; reasons.push('Matching part of speech'); }
      if (syntacticRole === 'verb') {
        if (sense.pos === 'verb') { score += 0.5; reasons.push('Verb position in sentence'); }
        if (sense.pos === 'adjective') score -= 0.4;
      } else if (syntacticRole === 'adjective' && sense.pos === 'adjective') {
        score += 0.5; reasons.push('Adjective position in sentence');
      }
      for (const collocation of sense.collocations ?? []) {
        if (input.sentence.toLowerCase().includes(collocation.toLowerCase())) { score += 4; reasons.push(`Collocation: ${collocation}`); }
      }
      const words = new Set(this.lexical.tokenize([sense.definitionEn, ...(sense.examples ?? []), ...(sense.synonyms ?? []), ...(sense.domains ?? []), ...(sense.keywords ?? [])].join(' ')).map(t => t.lemma));
      const overlap = [...words].filter(word => context.has(word));
      score += overlap.length;
      if (overlap.length) reasons.push(`Context overlap: ${overlap.join(', ')}`);
      if (input.canonicalPhrase === 'account for') {
        const proportion = /\baccount(?:s|ed|ing)?\s+for\s+(?:(?:about|approximately|over|nearly|only)\s+)?\d+(?:\.\d+)?\s*(?:%|percent)/i.test(input.sentence);
        if (sense.id === 'account-for.proportion' && proportion) { score += 10; reasons.push('A percentage follows account for'); }
        if (sense.id === 'account-for.explain' && !proportion && /\b(?:factors?|reasons?|causes?|decline|increase|discrepancy)\b/i.test(input.sentence)) { score += 6; reasons.push('Cause or outcome in the containing sentence'); }
      }
      return { sense, score, reasons };
    }).sort((a, b) => b.score - a.score || (b.sense.frequency ?? 0) - (a.sense.frequency ?? 0));
    const best = ranked[0];
    if (!best) return { confidence: 0, alternatives: [], reasons: ['No local entry'] };
    const margin = best.score - (ranked[1]?.score ?? 0);
    const confidence = best.score > 0 ? Math.min(0.97, 0.6 + Math.min(best.score, 10) * 0.02 + Math.min(margin, 6) * 0.03) : ranked.length === 1 ? 0.72 : 0.45;
    return { selectedSense: best.sense, confidence, alternatives: ranked.slice(1).map(item => item.sense), reasons: best.reasons.length ? best.reasons : ['Dictionary sense; no disambiguating context'] };
  }
}

function inferSyntacticRole(input: SenseInput): 'verb' | 'adjective' | undefined {
  const tokens = input.sentenceAnalysis?.tokens ?? [];
  const normalized = input.selection.toLocaleLowerCase();
  const index = tokens.findIndex(token => token.normalized === normalized || token.start === input.sentence.toLocaleLowerCase().indexOf(normalized));
  if (index < 0) return undefined;
  const previous = tokens[index - 1]?.normalized;
  const next = tokens[index + 1]?.normalized;
  const beforePrevious = tokens[index - 2]?.normalized;
  const subjects = new Set(['i', 'we', 'you', 'they', 'he', 'she', 'it']);
  const auxiliaries = new Set(['did', 'do', 'does', 'have', 'has', 'had', 'would', 'could', 'will', 'shall', 'should', 'can', 'may', 'might', 'must']);
  const determiners = new Set(['a', 'an', 'the', 'this', 'that', 'my', 'our', 'their', 'his', 'her', 'its']);
  const linking = new Set(['be', 'is', 'am', 'are', 'was', 'were', 'seem', 'seems', 'seemed', 'feel', 'feels', 'felt', 'become', 'became']);
  if (subjects.has(previous) || auxiliaries.has(previous) || determiners.has(next)) return 'verb';
  // An adverb between a copula and participial adjective: "was very tired".
  if (linking.has(previous) || (linking.has(beforePrevious) && /ly$|^(?:very|quite|rather|so|too)$/.test(previous ?? ''))) return 'adjective';
  return undefined;
}
