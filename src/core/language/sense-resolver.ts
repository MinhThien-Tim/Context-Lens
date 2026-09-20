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
    const ranked = input.candidateSenses.map(sense => {
      let score = 0;
      const reasons: string[] = [];
      if (input.pos && sense.pos === input.pos) { score += 2; reasons.push('Matching part of speech'); }
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
