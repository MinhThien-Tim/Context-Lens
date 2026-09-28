import type { LexicalEntry, LexicalSense } from '../../core/language/types';
import type { SenseAlignment } from './types';
import { frameCompatibility, occurrenceConstruction, patternEvidence } from '../../core/language/constructions';
import type { StableGrammarPattern } from '../../core/language/types';
import { senseVietnameseMeanings } from '../../core/language/sense-meanings';

export const ALIGNMENT_VERSION = 'bilingual-alignment-3';

const alignmentCache = new Map<string, LexicalSense[]>();
const normalize = (text: string) => text.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const fragments = (gloss: string) => gloss.split(/[,;\/]/).map(normalize).filter(Boolean);
type SourceSense = NonNullable<LexicalEntry['vietnameseSenses']>[number];

/** Stable lexical alignment. No sentence, occurrence, provider or mutable resolver result. */
export function alignBilingualSenses(senses: LexicalSense[], vietnamese: SourceSense[], anchors: (lemma: string) => LexicalEntry | undefined, version?: string): LexicalSense[] {
  const cacheKey = version ? JSON.stringify([ALIGNMENT_VERSION, version, senses, vietnamese]) : undefined;
  if (cacheKey && alignmentCache.has(cacheKey)) return structuredClone(alignmentCache.get(cacheKey)!);
  const exact = senses.map(sense => {
    if (senseVietnameseMeanings(sense).length) return { ...sense, alignment: sense.alignment ?? {
      kind: 'explicit', confidence: 'high', evidence: [sense.id, sense.source ?? 'local']
    } as SenseAlignment };
    const matches = senses.filter(other => other.pos && other.pos === sense.pos && senseVietnameseMeanings(other).length
      && other.alignment?.kind !== 'translated-definition' && !other.alignment?.dependsOnSenseId
      && normalize(other.definitionEn) === normalize(sense.definitionEn));
    const meanings = new Set(matches.map(other => senseVietnameseMeanings(other).map(normalize).join('|')));
    return meanings.size === 1 ? { ...sense, meaningVi: matches[0].meaningVi ?? senseVietnameseMeanings(matches[0]).join(' / '), meaningsVi: senseVietnameseMeanings(matches[0]),
      alignment: { kind: 'identical-gloss', confidence: 'high', evidence: matches.map(other => other.id) } as SenseAlignment }
      : { ...sense, alignment: { kind: 'unresolved', confidence: 'low', evidence: [] } as SenseAlignment };
  });
  const anchorEntries = new Map<string, LexicalEntry | undefined>();
  const anchorGlosses = new Map<string, Set<string>>();
  const sourceGlosses = vietnamese.map(source => new Set(source.glosses.flatMap(fragments)));
  // Source examples are stable lexical data. Prepare each once, outside candidate scoring.
  const sourcePatterns = vietnamese.map(source => source.grammarPatterns ?? examplePatterns(source.examples ?? [], [source.lemma]));
  const sensePatterns = exact.map(sense => sense.grammarPatterns ?? examplePatterns(sense.examples ?? [], sense.synonyms ?? []));
  const grammar = exact.map((sense, index) => vietnamese.map((source, sourceIndex) => {
    if (sense.pos !== 'verb') return 0;
    const patterns = sourcePatterns[sourceIndex];
    const frames = sense.verbFrames ?? [];
    // Only explicit, single controlled patterns can establish a contradiction.
    // Extracted examples and disjoint frame lists are incomplete usage evidence.
    if (source.grammarPatterns?.length === 1 && sense.grammarPatterns?.length === 1
      && patternEvidence(source.grammarPatterns[0], sense.grammarPatterns[0]) === 'HARD_CONFLICT') return -1;
    return patterns.some(pattern => frameCompatibility(features(pattern), frames) > 0 || sensePatterns[index].some(other => samePattern(pattern, other)))
      || Boolean(frames.length && source.verbFrames?.some(frame => frames.includes(frame))) ? 1 : 0;
  }));
  const support = exact.map(sense => {
    const terms = [...new Set([...(sense.synonyms ?? []), ...(sense.definitionEn.match(/[a-z]+(?:-[a-z]+)*/gi) ?? [])])]
      .filter(term => term.length > 3);
    return vietnamese.map((source, sourceIndex) => {
      if (!sense.pos || source.pos !== sense.pos || grammar[exact.indexOf(sense)][sourceIndex] < 0) return [];
      return terms.filter(term => {
        if (!anchorEntries.has(term)) {
          const entry = anchors(term);
          anchorEntries.set(term, entry);
          anchorGlosses.set(term, new Set((entry?.meaningsVi ?? []).flatMap(fragments)
            .filter(anchor => anchor.split(' ').length >= 2 && anchor.length >= 6)));
        }
        const entry = anchorEntries.get(term);
        return entry?.lemma !== source.lemma && entry?.pos.includes(sense.pos!) && [...sourceGlosses[sourceIndex]].some(gloss => anchorGlosses.get(term)?.has(gloss));
      });
    });
  });
  const result = exact.map((sense, index) => {
    if (sense.alignment.kind !== 'unresolved') return sense;
    const matches = vietnamese.filter((_, sourceIndex) => support[index][sourceIndex].length >= 2
      && support.every((other, competitor) => competitor === index || grammar[competitor][sourceIndex] < 0 || other[sourceIndex].length + grammar[competitor][sourceIndex] <= support[index][sourceIndex].length + grammar[index][sourceIndex] - 2));
    if (!matches.length) return sense;
    const meaningsVi = [...new Set(matches.flatMap(source => source.glosses.flatMap(fragments).filter(fragment =>
      support[index][vietnamese.indexOf(source)].filter(term =>
        anchorGlosses.get(term)?.has(fragment)).length >= 2)))];
    if (!meaningsVi.length) return sense;
    return { ...sense, meaningsVi, meaningVi: meaningsVi.join(' / '), alignment: {
      kind: 'inferred', confidence: 'high', evidence: ['compatible POS', ALIGNMENT_VERSION, ...(matches.some(source => grammar[index][vietnamese.indexOf(source)] > 0) ? ['stable grammar/frame match'] : []), ...(version ? [version] : []), ...matches.map(source => source.id), ...matches.flatMap(source => support[index][vietnamese.indexOf(source)])]
    } as SenseAlignment };
  });
  if (cacheKey) {
    alignmentCache.set(cacheKey, result);
    if (alignmentCache.size > 512) alignmentCache.delete(alignmentCache.keys().next().value!);
  }
  return structuredClone(result);
}

function features(pattern: StableGrammarPattern) {
  return { ...pattern, imperative: false, passive: false, predicative: false, evaluationModifier: false };
}
function samePattern(a: StableGrammarPattern, b: StableGrammarPattern): boolean {
  return a.complement === b.complement && a.preposition === b.preposition && a.particle === b.particle;
}
function examplePatterns(examples: string[], lemmas: string[]): StableGrammarPattern[] {
  return examples.slice(0, 8).flatMap(example => {
    const tokens = [...example.slice(0, 240).matchAll(/[a-z]+/gi)].map(match => ({ text: match[0], normalized: match[0].toLowerCase(), lemma: match[0].toLowerCase(), start: match.index!, end: match.index! + match[0].length }));
    const matches = tokens.map((token, i) => lemmas.includes(token.lemma) ? i : -1).filter(i => i >= 0);
    if (matches.length !== 1) return [];
    const pattern = occurrenceConstruction(tokens, matches[0]);
    // Generic or unknown object shapes cannot constrain stable alignment.
    return ['clause', 'wh-clause', 'infinitive', 'gerund', 'prepositional'].includes(pattern.complement)
      ? [{ complement: pattern.complement, preposition: pattern.preposition, particle: pattern.particle }] : [];
  });
}
