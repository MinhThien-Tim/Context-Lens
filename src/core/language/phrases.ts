import { LexicalEngine, normalizeLexical, phrases } from './lexicon';
import { lemmaCandidates } from '../../lookup/dictionary/seedDictionary';
import type { DetectedPhrase, PhraseEntry } from './types';

export class PhraseNormalizer {
  constructor(private lexical = new LexicalEngine()) {}
  normalize(text: string): string {
    const tokens = normalizeLexical(text).split(/\s+/);
    return tokens.map((token, index) => {
      if (/^(?:my|your|his|her|its|our|their|one's)$/.test(token)) return "one's";
      if (token === 'own' && index > 0 && /^(?:my|your|his|her|its|our|their|one's)$/.test(tokens[index - 1])) return '';
      if (index === 0) {
        if (lemmaCandidates(token).includes('account')) return 'account';
        return this.lexical.lemma(token);
      }
      return token;
    }).filter(Boolean).join(' ');
  }
}
export class PhraseDetector {
  readonly normalizer: PhraseNormalizer;
  constructor(readonly entries: PhraseEntry[] = phrases, private lexical = new LexicalEngine()) { this.normalizer = new PhraseNormalizer(lexical); }
  get version(): string { return JSON.stringify(this.entries); }
  detect(sentence: string): DetectedPhrase[] {
    const tokens = this.lexical.tokenize(sentence);
    const matches: DetectedPhrase[] = [];
    const maximum = Math.max(0, ...this.entries.map(entry => entry.lemma.split(' ').length + 1));
    for (let start = 0; start < tokens.length; start++) {
      for (let length = Math.min(maximum, tokens.length - start); length >= 2; length--) {
        const span = tokens.slice(start, start + length);
        // Never bridge punctuation or sentence boundaries.
        if (span.slice(1).some((token, i) => !/^\s+$/.test(sentence.slice(span[i].end, token.start)))) continue;
        const text = sentence.slice(span[0].start, span.at(-1)!.end);
        const canonical = this.normalizer.normalize(text);
        const known = this.entries.find(item => this.normalizer.normalize(item.lemma) === canonical);
        const entry = known;
        if (!entry) continue;
        matches.push({ canonical: entry.lemma, text, start: span[0].start, end: span.at(-1)!.end, type: entry.type });
        start += length - 1;
        break;
      }
    }
    return matches;
  }
}
