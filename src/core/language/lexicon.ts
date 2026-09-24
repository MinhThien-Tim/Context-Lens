import { rankedLemmaCandidates } from '../../lookup/dictionary/seedDictionary';
import type { LexicalEntry, PhraseEntry, TokenInfo } from './types';
import { wordNetVersion } from './wordnet';
import { normalizeSelection } from '../../lookup/normalization/normalizeSelection';
import { lookupLocalLexeme } from '../../lookup/localLexeme';
import { dictionaryRegistry } from '../../lookup/dictionary/registry';

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
  { lemma: 'maintain public confidence', pos: ['verb'], type: 'collocation', senses: [{ id: 'maintain-confidence.trust', definitionEn: 'to keep public trust from weakening', meaningVi: 'duy trì lòng tin của công chúng' }] },
  { lemma: 'rhetorical moves', pos: ['noun'], type: 'collocation', senses: [{
    id: 'rhetorical-moves.techniques', definitionEn: 'rhetorical techniques or choices used to influence an audience',
    meaningVi: 'thủ pháp tu từ / chiêu thức tu từ', collocations: ['rhetorical moves'], keywords: ['argument', 'persuade', 'audience', 'writing']
  }] }
];
const words: LexicalEntry[] = [
  { lemma: 'constrain', pos: ['verb'], senses: [{ id: 'constrain.limit', definitionEn: 'to limit what someone or something can do', meaningVi: 'hạn chế / giới hạn', synonyms: ['restrict', 'limit'], collocations: ['constrain investment'] }] },
  { lemma: 'constraint', pos: ['noun'], senses: [{ id: 'constraint.limit', definitionEn: 'something that limits what can happen', meaningVi: 'sự hạn chế / ràng buộc' }] },
  { lemma: 'run', pos: ['verb'], senses: [{ id: 'run.move', definitionEn: 'to move on foot faster than walking', meaningVi: 'chạy', keywords: ['race', 'road', 'fast'] }, { id: 'run.manage', definitionEn: 'to manage or operate something', meaningVi: 'điều hành', keywords: ['company', 'business', 'organization'] }] },
  { lemma: 'good', pos: ['adjective'], senses: [{ id: 'good.quality', definitionEn: 'of a high or satisfactory quality', meaningVi: 'tốt' }] },
  { lemma: 'notwithstanding', pos: ['preposition'], senses: [{ id: 'notwithstanding.despite', definitionEn: 'despite', meaningVi: 'mặc dù' }] },
  { lemma: 'still', pos: ['adverb'], senses: [
    { id: 'still.continuing', definitionEn: 'continuing up to this time or without a change or interruption', meaningVi: 'vẫn', keywords: ['continue', 'remain', 'yet'], frequency: 1 },
    { id: 'still.contrast', definitionEn: 'despite that; nevertheless', meaningVi: 'tuy nhiên / dẫu vậy', keywords: ['although', 'despite', 'nevertheless'] },
    { id: 'still.degree', definitionEn: 'to an even greater degree, especially with a comparison', meaningVi: 'còn / hơn nữa', keywords: ['more', 'less', 'another', 'comparison'] },
    { id: 'still.motionless', definitionEn: 'without moving or making a sound', meaningVi: 'yên / bất động', keywords: ['sit', 'stand', 'hold', 'motionless'] }
  ] }
];
const irregular: Record<string, string> = { made: 'make', makes: 'make', making: 'make', ran: 'run', running: 'run', better: 'good', best: 'good', was: 'be', were: 'be', is: 'be', are: 'be', had: 'have' };
export function normalizeLexical(text: string): string { return normalizeSelection(text).normalized; }
export class LexicalEngine {
  private learned = new Map<string, LexicalEntry>();
  constructor(private entries: LexicalEntry[] = words) {}
  get version(): string { return JSON.stringify(['local-lexicon-6', this.entries.map(entry => entry.lemma), dictionaryRegistry.versions(), wordNetVersion()]); }
  async prime(surface: string): Promise<void> {
    const normalized = normalizeLexical(surface);
    if (this.learned.has(normalized)) return;
    const { readLearnedLexeme } = await import('../../lookup/learnedLexicon');
    const cached = await readLearnedLexeme(normalized, this.version);
    if (cached) this.learned.set(normalized, cached);
  }
  remember(surface: string, entry: LexicalEntry): void {
    const normalized = normalizeLexical(surface);
    this.learned.set(normalized, entry);
    void import('../../lookup/learnedLexicon').then(({ storeLearnedLexeme }) => storeLearnedLexeme(normalized, surface, entry, this.version));
  }
  lookup(surface: string): LexicalEntry | undefined {
    const normalized = normalizeLexical(surface);
    const learned = this.learned.get(normalized);
    if (learned) return learned;
    const candidates = [...new Set([irregular[normalized], normalized, ...rankedLemmaCandidates(normalized)].filter((v): v is string => Boolean(v)))];
    for (const candidate of candidates) {
      const curated = this.entries.find(item => item.lemma === candidate || item.forms?.includes(candidate));
      const merged = lookupLocalLexeme(candidate, normalized, curated);
      if (merged) return merged;
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
