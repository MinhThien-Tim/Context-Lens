import overlay from '../../release/dictionary/context-lens-sense-metadata-reviewed.json';
import type { LexicalEntry, LexicalSense, StableGrammarPattern } from '../core/language/types';
import { senseVietnameseMeanings } from '../core/language/sense-meanings';
import { dictionaryRegistry } from './dictionary/registry';

interface ReviewedDelta {
  viSenseIds?: string[];
  collocations?: string[];
  grammarPatterns?: StableGrammarPattern[];
  examples?: string[];
  domains?: string[];
  evidence?: string[];
}
const reviewed = overlay as { version: number; sources: { vietnamese: string }; entries: Record<string, { senses: Record<string, ReviewedDelta> }> };
const skypediaProvider = 'bundled.context-lens.skypedia.en-vi';
const skypediaRevision = reviewed.sources.vietnamese.split('@')[1];

/** Source-checked deltas. The asset has no definitions or synthetic senses. */
export function enrichReviewedSenses(lemma: string, senses: LexicalSense[]): LexicalSense[] {
  if (reviewed.version !== 1) return senses;
  const deltas = reviewed.entries[lemma]?.senses;
  if (!deltas) return senses;
  return senses.map(sense => {
    const delta = deltas[sense.id];
    if (!delta || sense.source !== 'wordnet') return sense;
    const merge = (prior: string[] | undefined, added: string[]) => [...new Set([...(prior ?? []), ...added])];
    return { ...sense,
      ...(delta.collocations?.length ? { collocations: merge(sense.collocations, delta.collocations) } : {}),
      ...(delta.grammarPatterns?.length ? { grammarPatterns: [...(sense.grammarPatterns ?? []), ...delta.grammarPatterns] } : {}),
      ...(delta.examples?.length ? { examples: merge(sense.examples, delta.examples) } : {}),
      ...(delta.domains?.length ? { domains: merge(sense.domains, delta.domains) } : {})
    };
  });
}

/** Explicit dictionary pairs keep precedence; missing source IDs remain unresolved. */
export function applyReviewedLinks(lemma: string, senses: LexicalSense[], vietnamese: NonNullable<LexicalEntry['vietnameseSenses']>): LexicalSense[] {
  if (reviewed.version !== 1 || !skypediaRevision
    || !dictionaryRegistry.versions().some(version => version.startsWith(`${skypediaProvider}@${skypediaRevision}:`))) return senses;
  const deltas = reviewed.entries[lemma]?.senses;
  if (!deltas) return senses;
  return senses.map(sense => {
    const delta = deltas[sense.id];
    if (!delta?.viSenseIds?.length || sense.source !== 'wordnet'
      || sense.alignment?.kind === 'explicit' || sense.alignment?.kind === 'identical-gloss') return sense;
    const sources = delta.viSenseIds.map(id => vietnamese.find(source => source.source === skypediaProvider
      && source.id === `${skypediaProvider}:${lemma}:${id}` && source.pos === sense.pos));
    if (sources.some(source => !source)) return sense;
    const matched = sources.filter((source): source is NonNullable<typeof source> => Boolean(source));
    const meaningsVi = [...new Set(matched.flatMap(source => source.glosses))];
    if (!meaningsVi.length || senseVietnameseMeanings(sense).length && sense.alignment?.kind !== 'inferred') return sense;
    return { ...sense, meaningsVi, meaningVi: meaningsVi.join(' / '), alignment: {
      kind: 'reviewed', confidence: 'high',
      evidence: ['reviewed-source-ID', `overlay-v${reviewed.version}`, reviewed.sources.vietnamese,
        ...matched.map(source => source.id), ...(delta.evidence ?? [])]
    } };
  });
}
