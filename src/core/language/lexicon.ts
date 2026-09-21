import { dictionaryRegistry } from '../../lookup/dictionary/registry';
import { rankedLemmaCandidates } from '../../lookup/dictionary/seedDictionary';
import type { LexicalEntry, PhraseEntry, TokenInfo } from './types';
import { lookupWordNet, wordNetVersion } from './wordnet';

/** Small original sense pack; legacy installed packs remain available through the adapter. */
export const phrases: PhraseEntry[] = [
  { lemma: 'account for', pos: ['verb'], type: 'phrasal verb', senses: [
    { id: 'account-for.explain', definitionEn: 'to explain or be responsible for something', meaningVi: 'giải thích / là nguyên nhân của', keywords: ['factor', 'reason', 'cause', 'decline', 'increase', 'discrepancy'], frequency: 1 },
    { id: 'account-for.proportion', definitionEn: 'to constitute or represent a particular proportion', meaningVi: 'chiếm / tạo nên', keywords: ['percent', 'percentage', 'total', 'share', 'proportion'] },
    { id: 'account-for.destroy', definitionEn: 'to destroy or put someone or something out of action', meaningVi: 'tiêu diệt / loại khỏi vòng chiến', keywords: ['destroy', 'enemy', 'aircraft', 'shot', 'kill'] }
  ] },
  { lemma: "make up one's mind", pos: ['verb'], type: 'idiom', senses: [{ id: 'make-up-mind.decide', definitionEn: 'to make a decision', meaningVi: 'đưa ra quyết định', synonyms: ['decide'] }] },
  { lemma: 'institutional constraints', pos: ['noun'], type: 'collocation', senses: [{ id: 'institutional-constraints.limits', definitionEn: 'limits imposed by institutions, rules, or established practices', meaningVi: 'những hạn chế về thể chế', domains: ['policy', 'economics'] }] },
  { lemma: 'asset prices', pos: ['noun'], type: 'collocation', senses: [{ id: 'asset-prices.value', definitionEn: 'the prices of assets such as property or financial investments', meaningVi: 'giá tài sản', domains: ['finance'] }] },
  { lemma: 'economic growth', pos: ['noun'], type: 'collocation', senses: [{ id: 'economic-growth.output', definitionEn: 'an increase in the production of goods and services', meaningVi: 'tăng trưởng kinh tế', domains: ['economics'] }] },
  { lemma: 'maintain public confidence', pos: ['verb'], type: 'collocation', senses: [{ id: 'maintain-confidence.trust', definitionEn: 'to keep public trust from weakening', meaningVi: 'duy trì lòng tin của công chúng' }] }
];
const words: LexicalEntry[] = [
  { lemma: 'constrain', pos: ['verb'], senses: [{ id: 'constrain.limit', definitionEn: 'to limit what someone or something can do', meaningVi: 'hạn chế / giới hạn', synonyms: ['restrict', 'limit'], collocations: ['constrain investment'] }] },
  { lemma: 'constraint', pos: ['noun'], senses: [{ id: 'constraint.limit', definitionEn: 'something that limits what can happen', meaningVi: 'sự hạn chế / ràng buộc' }] },
  { lemma: 'run', pos: ['verb'], senses: [{ id: 'run.move', definitionEn: 'to move on foot faster than walking', meaningVi: 'chạy', keywords: ['race', 'road', 'fast'] }, { id: 'run.manage', definitionEn: 'to manage or operate something', meaningVi: 'điều hành', keywords: ['company', 'business', 'organization'] }] },
  { lemma: 'good', pos: ['adjective'], senses: [{ id: 'good.quality', definitionEn: 'of a high or satisfactory quality', meaningVi: 'tốt' }] },
  { lemma: 'notwithstanding', pos: ['preposition'], senses: [{ id: 'notwithstanding.despite', definitionEn: 'despite', meaningVi: 'mặc dù' }] }
];
const irregular: Record<string, string> = { made: 'make', makes: 'make', making: 'make', ran: 'run', running: 'run', better: 'good', best: 'good', was: 'be', were: 'be', is: 'be', are: 'be', had: 'have' };
export function normalizeLexical(text: string): string { return text.normalize('NFC').toLowerCase().replace(/’/g, "'").trim().replace(/\s+/g, ' '); }
export class LexicalEngine {
  constructor(private entries: LexicalEntry[] = words) {}
  get version(): string { return JSON.stringify(['local-lexicon-3', this.entries, dictionaryRegistry.versions(), wordNetVersion()]); }
  lookup(surface: string): LexicalEntry | undefined {
    const normalized = normalizeLexical(surface);
    const candidates = [...new Set([normalized, irregular[normalized], ...rankedLemmaCandidates(normalized)].filter((v): v is string => Boolean(v)))];
    for (const candidate of candidates) {
      const entry = this.entries.find(item => item.lemma === candidate || item.forms?.includes(candidate));
      if (entry) {
        if (candidate === normalized) return entry;
        const lexicalized = lookupWordNet(normalized);
        return lexicalized ? { ...entry, pos: [...new Set([...lexicalized.pos, ...entry.pos])], senses: [...lexicalized.senses, ...entry.senses],
          morphology: { surface: normalized, baseLemma: entry.lemma, inflection: normalized === 'best' ? 'superlative' : normalized === 'better' ? 'comparative' : 'past-participle' } } : entry;
      }
    }
    for (const candidate of candidates) {
      if (candidate.includes(' ')) continue;
      const match = dictionaryRegistry.lookup(candidate);
      const legacy = match?.entry;
      const baseEnglish = lookupWordNet(legacy?.lemma ?? candidate);
      const surfaceEnglish = match?.morphology ? lookupWordNet(normalized) : undefined;
      const senses = [...(surfaceEnglish?.senses ?? []), ...(baseEnglish?.senses ?? [])]
        .filter((sense, index, all) => all.findIndex(other => other.id === sense.id) === index);
      if (senses.length) return { lemma: legacy?.lemma ?? baseEnglish!.lemma, pos: [...new Set([...(surfaceEnglish?.pos ?? []), ...(baseEnglish?.pos ?? [])])], senses,
        meaningsVi: legacy?.meaningsVi, morphology: match?.morphology ? { surface: normalized, ...match.morphology } : undefined };
      if (legacy) return { lemma: legacy.lemma, pos: legacy.partOfSpeech.split(/\s*\/\s*/), senses: [{ id: `${legacy.lemma}.legacy`, definitionEn: legacy.definitionEn, meaningVi: legacy.meaningsVi.join(' / ') }],
        morphology: match?.morphology ? { surface: normalized, ...match.morphology } : undefined };
    }
    return undefined;
  }
  lemma(surface: string): string { return this.lookup(surface)?.lemma ?? irregular[normalizeLexical(surface)] ?? normalizeLexical(surface); }
  tokenize(text: string): TokenInfo[] {
    return Array.from(text.matchAll(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*|\d+(?:\.\d+)?%?/gu), match => {
      const entry = this.lookup(match[0]);
      return { text: match[0], normalized: normalizeLexical(match[0]), lemma: entry?.lemma ?? this.lemma(match[0]), start: match.index!, end: match.index! + match[0].length, pos: entry?.pos.length === 1 ? entry.pos[0] : undefined };
    });
  }
}
