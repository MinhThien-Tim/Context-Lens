import { dictionaryRegistry } from './dictionary/registry';
import type { InflectionType } from './dictionary/types';
import type { LexicalEntry } from '../core/language/types';
import { lookupWordNet } from '../core/language/wordnet';

const qualityRank = { reviewed: 0, curated: 1, imported: 2 } as const;

const posNames: Record<string, string> = { n: 'noun', noun: 'noun', v: 'verb', verb: 'verb', adj: 'adjective', adjective: 'adjective', adv: 'adverb', adverb: 'adverb' };
function normalizePos(values: string[]): string[] {
  return [...new Set(values.flatMap(value => value.toLowerCase().split(/[\s/,]+/)).map(value => posNames[value]).filter(Boolean))];
}

export function inferInflection(surface: string, lemma: string, pos: string[]): InflectionType {
  if (surface.endsWith('ing')) return 'present-participle';
  if (surface.endsWith('ed') || surface.endsWith('ied')) return 'past-participle';
  if (surface.endsWith('est')) return 'superlative';
  if (surface.endsWith('er')) return 'comparative';
  if (surface.endsWith('s')) return pos.includes('noun') && !pos.includes('verb') ? 'plural' : 'third-person';
  return surface === lemma ? 'variant' : 'variant';
}

/** Merge fields from every local source for one candidate. No source must be complete by itself. */
export function lookupLocalLexeme(candidate: string, surface = candidate, curated?: LexicalEntry): LexicalEntry | undefined {
  const matches = dictionaryRegistry.lookupAll(candidate);
  const preferred = [...matches].sort((a, b) => qualityRank[a.quality] - qualityRank[b.quality]
    || Number(a.providerId.includes('seed')) - Number(b.providerId.includes('seed')));
  const bestDictionaryMatches = preferred.length ? preferred.filter(match => match.quality === preferred[0].quality) : [];
  const dictionaryLemma = preferred[0]?.entry.lemma;
  const lemma = curated?.lemma ?? dictionaryLemma ?? candidate;
  const wordnet = lookupWordNet(lemma);
  const dictionaryEnglish = bestDictionaryMatches.find(match => match.entry.definitionEn.trim())?.entry.definitionEn.trim();
  const dictionarySenses = bestDictionaryMatches.flatMap(match => (match.entry.senses ?? []).map(sense => ({
    id: sense.id, definitionEn: sense.definitionEn, meaningVi: sense.meaningsVi.join(' / '),
    pos: normalizePos([sense.partOfSpeech ?? match.entry.partOfSpeech])[0]
  })));
  // WordNet and entry-level bilingual dictionaries do not share sense IDs.
  // Keep them independent instead of manufacturing a bilingual pair from
  // definition similarity or source order.
  const wordNetSenses = wordnet?.senses ?? [];
  const senses = [
    ...(curated?.senses.map(sense => ({ ...sense, pos: sense.pos ?? (curated.pos.length === 1 ? curated.pos[0] : undefined) })) ?? []),
    ...dictionarySenses,
    ...wordNetSenses,
    ...(dictionaryEnglish && !curated?.senses.some(sense => sense.definitionEn === dictionaryEnglish) && !wordnet?.senses.some(sense => sense.definitionEn === dictionaryEnglish)
      ? [{ id: `${lemma}.dictionary`, definitionEn: dictionaryEnglish }] : [])
  ].filter((sense, index, all) => all.findIndex(other => other.id === sense.id) === index);
  const meaningsVi = [...new Set([...bestDictionaryMatches.flatMap(match => match.entry.meaningsVi), ...(curated?.senses.flatMap(sense => sense.meaningVi ? [sense.meaningVi] : []) ?? [])].filter(Boolean))];
  if (!senses.length && !meaningsVi.length) return undefined;
  const pos = normalizePos([...(curated?.pos ?? []), ...(wordnet?.pos ?? []), ...preferred.map(match => match.entry.partOfSpeech)]);
  const morphologyMatch = preferred.find(match => match.morphology)?.morphology;
  const morphology = morphologyMatch
    ? { surface, ...morphologyMatch }
    : surface !== lemma ? { surface, baseLemma: lemma, inflection: inferInflection(surface, lemma, pos) } : undefined;
  return {
    lemma, pos, senses, meaningsVi,
    morphology,
    sources: {
      english: [...new Set([...(curated?.senses.length ? ['curated'] : []), ...(wordnet?.senses.length ? ['wordnet-3.0'] : []), ...(dictionaryEnglish ? preferred.filter(match => match.entry.definitionEn.trim()).map(match => match.providerId) : [])])],
      vietnamese: [...new Set([...bestDictionaryMatches.filter(match => match.entry.meaningsVi.length).map(match => match.providerId), ...(curated?.senses.some(sense => sense.meaningVi) ? ['curated'] : [])])],
      morphology: morphologyMatch ? preferred.find(match => match.morphology)?.providerId : morphology ? 'rules' : undefined
    }
  };
}
