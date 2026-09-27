import type { LexicalEntry, LexicalSense } from '../../core/language/types';
import type { SenseAlignment } from './types';

const alignmentCache = new Map<string, LexicalSense[]>();
const normalize = (text: string) => text.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const fragments = (gloss: string) => gloss.split(/[,;\/]/).map(normalize).filter(Boolean);
type SourceSense = NonNullable<LexicalEntry['vietnameseSenses']>[number];

/** Stable lexical alignment. No sentence, occurrence, provider or mutable resolver result. */
export function alignBilingualSenses(senses: LexicalSense[], vietnamese: SourceSense[], anchors: (lemma: string) => LexicalEntry | undefined, version?: string): LexicalSense[] {
  const cacheKey = version ? JSON.stringify([version, senses, vietnamese]) : undefined;
  if (cacheKey && alignmentCache.has(cacheKey)) return structuredClone(alignmentCache.get(cacheKey)!);
  const exact = senses.map(sense => {
    if (sense.meaningVi || sense.meaningsVi?.length) return { ...sense, alignment: sense.alignment ?? {
      kind: 'explicit', confidence: 'high', evidence: [sense.id, sense.source ?? 'local']
    } as SenseAlignment };
    const matches = senses.filter(other => other.pos && other.pos === sense.pos && other.meaningVi
      && other.alignment?.kind !== 'translated-definition' && !other.alignment?.dependsOnSenseId
      && normalize(other.definitionEn) === normalize(sense.definitionEn));
    const meanings = new Set(matches.map(other => normalize(other.meaningVi!)));
    return meanings.size === 1 ? { ...sense, meaningVi: matches[0].meaningVi, meaningsVi: matches[0].meaningsVi,
      alignment: { kind: 'identical-gloss', confidence: 'high', evidence: matches.map(other => other.id) } as SenseAlignment }
      : { ...sense, alignment: { kind: 'unresolved', confidence: 'low', evidence: [] } as SenseAlignment };
  });
  const anchorEntries = new Map<string, LexicalEntry | undefined>();
  const anchorGlosses = new Map<string, Set<string>>();
  const sourceGlosses = vietnamese.map(source => new Set(source.glosses.flatMap(fragments)));
  const support = exact.map(sense => {
    const terms = [...new Set([...(sense.synonyms ?? []), ...(sense.definitionEn.match(/[a-z]+(?:-[a-z]+)*/gi) ?? [])])]
      .filter(term => term.length > 3);
    return vietnamese.map((source, sourceIndex) => {
      if (!sense.pos || source.pos !== sense.pos) return [];
      return terms.filter(term => {
        if (!anchorEntries.has(term)) {
          const entry = anchors(term);
          anchorEntries.set(term, entry);
          anchorGlosses.set(term, new Set((entry?.meaningsVi ?? []).flatMap(fragments)
            .filter(anchor => anchor.split(' ').length >= 2 && anchor.length >= 6)));
        }
        const entry = anchorEntries.get(term);
        return entry?.lemma !== source.lemma && [...sourceGlosses[sourceIndex]].some(gloss => anchorGlosses.get(term)?.has(gloss));
      });
    });
  });
  const result = exact.map((sense, index) => {
    if (sense.alignment.kind !== 'unresolved') return sense;
    const matches = vietnamese.filter((_, sourceIndex) => support[index][sourceIndex].length >= 2
      && support.every((other, competitor) => competitor === index || other[sourceIndex].length <= support[index][sourceIndex].length - 2));
    if (!matches.length) return sense;
    const meaningsVi = [...new Set(matches.flatMap(source => source.glosses.flatMap(fragments).filter(fragment =>
      support[index][vietnamese.indexOf(source)].filter(term =>
        anchorGlosses.get(term)?.has(fragment)).length >= 2)))];
    if (!meaningsVi.length) return sense;
    return { ...sense, meaningsVi, meaningVi: meaningsVi.join(' / '), alignment: {
      kind: 'inferred', confidence: 'high', evidence: ['compatible POS', ...(version ? [version] : []), ...matches.map(source => source.id), ...matches.flatMap(source => support[index][vietnamese.indexOf(source)])]
    } as SenseAlignment };
  });
  if (cacheKey) {
    alignmentCache.set(cacheKey, result);
    if (alignmentCache.size > 512) alignmentCache.delete(alignmentCache.keys().next().value!);
  }
  return structuredClone(result);
}
