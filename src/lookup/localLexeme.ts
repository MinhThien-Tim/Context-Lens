import { dictionaryRegistry } from './dictionary/registry';
import type { InflectionType } from './dictionary/types';
import type { LexicalEntry, LexicalSense } from '../core/language/types';
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
  // A weak inflected form answers with its lemma. The exact entry is kept, not dropped, so it
  // can still supply what the lemma lacks. It never overrides the lemma: pack inflected forms
  // usually repeat the lemma's meaning list, and merging both would duplicate it.
  const lemmaEntries = bestDictionaryMatches.map(match => match.entry);
  const exactEntries = bestDictionaryMatches.flatMap(match => match.surfaceEntry && match.surfaceEntry !== match.entry ? [match.surfaceEntry] : []);
  const contentEntries = [...lemmaEntries, ...exactEntries];
  const dictionaryEnglish = contentEntries.find(entry => entry.definitionEn.trim())?.definitionEn.trim();
  const senseOwners = lemmaEntries.some(entry => entry.senses?.length) ? lemmaEntries : exactEntries;
  const dictionarySenses = senseOwners.flatMap(entry => (entry.senses ?? []).map(sense => ({
    id: sense.id, definitionEn: sense.definitionEn, meaningVi: sense.meaningsVi.join(' / '), meaningsVi: sense.meaningsVi, source: 'local' as const,
    pos: normalizePos([sense.partOfSpeech ?? entry.partOfSpeech])[0]
  })));
  // WordNet and entry-level bilingual dictionaries do not share sense IDs.
  // Keep them independent instead of manufacturing a bilingual pair from
  // definition similarity or source order.
  const wordNetSenses = (wordnet?.senses ?? []).map(sense => ({ ...sense, source: 'wordnet' as const }));
  const senses: LexicalSense[] = [
    ...(curated?.senses.map(sense => ({ ...sense, pos: sense.pos ?? (curated.pos.length === 1 ? curated.pos[0] : undefined) })) ?? []),
    ...dictionarySenses,
    ...wordNetSenses,
    ...(dictionaryEnglish && !dictionarySenses.some(sense => sense.definitionEn === dictionaryEnglish) && !curated?.senses.some(sense => sense.definitionEn === dictionaryEnglish) && !wordnet?.senses.some(sense => sense.definitionEn === dictionaryEnglish)
      ? [{ id: `${lemma}.dictionary`, definitionEn: dictionaryEnglish, meaningVi: undefined }] : [])
  // Inheriting lemma data must not repeat a sense the exact form already contributed.
  ].filter((sense, index, all) => {
    const earlier = all.findIndex(other => other.id === sense.id
      || (sense.definitionEn && other.definitionEn?.toLocaleLowerCase() === sense.definitionEn.toLocaleLowerCase()
        && other.meaningVi === sense.meaningVi));
    return earlier === index;
  });
  const meaningOwners = lemmaEntries.some(entry => entry.meaningsVi.length) ? lemmaEntries : exactEntries;
  const meaningsVi = [...new Set([...meaningOwners.flatMap(entry => entry.meaningsVi), ...(curated?.meaningsVi ?? []), ...(curated?.senses.flatMap(sense => sense.meaningVi ? [sense.meaningVi] : []) ?? [])].filter(Boolean))];
  if (!senses.length && !meaningsVi.length) return undefined;
  const pos = normalizePos([...(curated?.pos ?? []), ...(wordnet?.pos ?? []), ...preferred.map(match => match.entry.partOfSpeech)]);
  const morphologyMatch = preferred.find(match => match.morphology)?.morphology;
  const morphology = morphologyMatch
    ? { surface, ...morphologyMatch }
    : surface !== lemma ? { surface, baseLemma: lemma, inflection: inferInflection(surface, lemma, pos) } : undefined;
  return {
    lemma, pos, senses, meaningsVi,
    morphology,
    vietnameseReferences: meaningOwners.flatMap(entry => entry.vietnameseReferences ?? []),
    sources: {
      english: [...new Set([...(curated?.senses.length ? ['curated'] : []), ...(wordnet?.senses.length ? ['wordnet-3.0'] : []), ...(dictionaryEnglish ? preferred.filter(match => match.entry.definitionEn.trim()).map(match => match.providerId) : [])])],
      vietnamese: [...new Set([...bestDictionaryMatches.filter(match => match.entry.meaningsVi.length).map(match => match.providerId), ...(curated?.senses.some(sense => sense.meaningVi) ? ['curated'] : [])])],
      morphology: morphologyMatch ? preferred.find(match => match.morphology)?.providerId : morphology ? 'rules' : undefined
    }
  };
}
