import { z } from 'zod';
import { db, type DictionaryPackRecord } from '../../db/database';
import { dictionaryRegistry } from './registry';
import { rankedLemmaCandidates } from './seedDictionary';
import type { DictionaryEntry, DictionaryMatch, DictionaryProvider, DictionaryQuality } from './types';
import bundledPackUrl from '../../../release/dictionary/context-lens-en-vi-2026.09.1.json?url';
import reviewedPackUrl from '../../../release/dictionary/context-lens-wiktionary-en-vi-reviewed-2026.09.2.json?url';

let bundledPackReady: Promise<void> | undefined;

export function loadBundledDictionary(): Promise<void> {
  if (!bundledPackReady) {
    bundledPackReady = (async () => {
      const loadPack = async (url: string) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Unable to load the offline dictionary.');
        return dictionaryPackSchema.parse(await response.json());
      };
      const [pack, reviewedPack] = await Promise.all([
        loadPack(bundledPackUrl),
        loadPack(reviewedPackUrl).catch(() => null)
      ]);
      dictionaryRegistry.register(new InstalledDictionaryPack({
        id: `bundled.${pack.id}`, name: pack.name, version: pack.packVersion,
        license: pack.license, quality: 'curated', entries: pack.entries, installedAt: 0
      }), true);
      if (reviewedPack) dictionaryRegistry.register(new InstalledDictionaryPack({
        id: `bundled.${reviewedPack.id}`, name: reviewedPack.name, version: reviewedPack.packVersion,
        license: reviewedPack.license, quality: reviewedPack.quality, entries: reviewedPack.entries, installedAt: 0
      }), true);
    })().catch((error) => { bundledPackReady = undefined; throw error; });
  }
  return bundledPackReady;
}

const provenanceSchema = z.object({
  sourceId: z.string().min(1).max(100), sourceUrl: z.string().url(), sourceRevision: z.string().min(1).max(120),
  license: z.string().min(1).max(120), retrievedAt: z.string().datetime(),
  reviewStatus: z.enum(['imported', 'cross-checked', 'editor-reviewed', 'human-reviewed']),
  reviewerKind: z.enum(['human', 'ai-assisted']).optional(),
  reviewedBy: z.string().min(1).max(120).optional(), reviewedAt: z.string().datetime().optional(),
  senseIds: z.array(z.string().min(1).max(160)).max(20).optional(), notes: z.string().max(1000).optional()
}).strict();

const entrySchema = z.object({
  lemma: z.string().min(1).max(80), partOfSpeech: z.string().min(1).max(80), ipa: z.string().max(120).nullable(),
  definitionEn: z.string().max(500), meaningsVi: z.array(z.string().min(1).max(250)).min(1).max(12),
  baseLemma: z.string().min(1).max(80).optional(),
  inflection: z.enum(['past', 'past-participle', 'present-participle', 'third-person', 'plural', 'comparative', 'superlative', 'variant']).optional(),
  provenance: provenanceSchema.optional(),
  senses: z.array(z.object({
    id: z.string().min(1).max(200), definitionEn: z.string().min(1).max(500),
    meaningsVi: z.array(z.string().min(1).max(250)).min(1).max(12), partOfSpeech: z.string().min(1).max(80).optional(),
    provenance: provenanceSchema.optional()
  }).strict()).min(1).max(40).optional()
}).strict();

export const dictionaryPackSchema = z.object({
  schema: z.literal('context-lens.dictionary-pack'), version: z.literal(1), id: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,63}$/),
  name: z.string().min(1).max(100), packVersion: z.string().min(1).max(40),
  quality: z.enum(['reviewed', 'curated', 'imported']).default('imported'),
  license: z.object({ name: z.string().min(1), url: z.string().url(), attribution: z.string().min(1).max(1000) }).strict(),
  entries: z.array(entrySchema).min(1).max(200_000)
}).strict().superRefine((pack, context) => {
  if (pack.quality !== 'reviewed') return;
  pack.entries.forEach((entry, index) => {
    const provenances = entry.senses?.map(sense => sense.provenance) ?? [entry.provenance];
    if (provenances.some(provenance => !provenance || !['editor-reviewed', 'human-reviewed'].includes(provenance.reviewStatus)
      || !provenance.reviewedBy || !provenance.reviewedAt || !provenance.reviewerKind)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['entries', index, 'provenance'], message: 'Reviewed packs require reviewed provenance, reviewer identity/type, and review time for every sense.' });
    }
  });
});

export type DictionaryPackInput = z.infer<typeof dictionaryPackSchema>;

class InstalledDictionaryPack implements DictionaryProvider {
  readonly id: string;
  readonly version: string;
  readonly quality: DictionaryQuality;
  private readonly entries: Map<string, DictionaryEntry>;
  private readonly reverseHits = new Map<string, DictionaryEntry | null>();

  constructor(record: DictionaryPackRecord) {
    this.id = record.id; this.version = record.version; this.quality = record.quality ?? 'imported';
    this.entries = new Map(record.entries.map((entry) => [entry.lemma.toLocaleLowerCase(), entry]));
    // Version-1 packs predate explicit morphology. Upgrade trusted redirects in memory.
    for (const entry of this.entries.values()) {
      if (entry.baseLemma) continue;
      const parsed = parseMorphologyRedirect(entry.meaningsVi);
      if (parsed && parsed.baseLemma !== entry.lemma && this.entries.has(parsed.baseLemma)) {
        Object.assign(entry, parsed);
        continue;
      }
      if (!isWeakInflectedEntry(entry)) continue;
      for (const candidate of rankedLemmaCandidates(entry.lemma).slice(1)) {
        const base = this.entries.get(candidate);
        if (base && isVerbEntry(base)) {
          Object.assign(entry, { baseLemma: base.lemma, inflection: inferInflection(entry.lemma, entry.partOfSpeech) });
          break;
        }
      }
    }
  }

  lookup(surface: string): DictionaryMatch | null {
    const normalized = surface.toLocaleLowerCase().trim().replace(/[^a-z' -]/g, '').replace(/\s+/g, ' ');
    const exact = this.entries.get(normalized);
    if (exact?.baseLemma) {
      const base = this.entries.get(exact.baseLemma);
      if (base) return { entry: base, surface, surfaceEntry: exact, morphology: { baseLemma: base.lemma, inflection: exact.inflection ?? 'past-participle' } };
    }
    for (const candidate of rankedLemmaCandidates(normalized)) {
      const entry = this.entries.get(candidate);
      if (!entry) continue;
      if (candidate === normalized) return { entry, surface };
      return { entry, surface, surfaceEntry: exact, morphology: { baseLemma: entry.lemma, inflection: inferInflection(normalized, exact?.partOfSpeech) } };
    }
    return null;
  }

  lookupReverse(surface: string): DictionaryMatch | null {
    const normalized = normalizeVietnamese(surface);
    let entry = this.reverseHits.get(normalized);
    if (entry === undefined) {
      entry = [...this.entries.values()].find(candidate => candidate.meaningsVi.some(meaning => normalizeVietnamese(meaning) === normalized)) ?? null;
      this.reverseHits.set(normalized, entry);
      if (this.reverseHits.size > 256) this.reverseHits.delete(this.reverseHits.keys().next().value!);
    }
    return entry ? { entry, surface } : null;
  }
}

function isVerbEntry(entry: DictionaryEntry): boolean {
  return /(?:^|[ /,])(?:v|verb)(?:$|[ /,])/i.test(entry.partOfSpeech);
}

function isWeakInflectedEntry(entry: DictionaryEntry): boolean {
  return isVerbEntry(entry) && !entry.definitionEn.trim() && entry.meaningsVi.length === 1 && /(?:ed|ing|s)$/i.test(entry.lemma);
}

function inferInflection(surface: string, partOfSpeech?: string): import('./types').InflectionType {
  if (surface.endsWith('ing')) return 'present-participle';
  if (surface.endsWith('ed') || surface.endsWith('ied')) return 'past-participle';
  if (surface.endsWith('est')) return 'superlative';
  if (surface.endsWith('er')) return 'comparative';
  return surface.endsWith('s') && /(?:noun|^N$)/i.test(partOfSpeech ?? '') ? 'plural' : 'third-person';
}

const redirectPatterns: Array<[import('./types').InflectionType, RegExp]> = [
  ['past-participle', /^(?:quá khứ và phân từ quá khứ|dạng quá khứ(?: và phân từ quá khứ)?|động từ quá khứ|past tense and past participle|past tense|past participle) (?:của|of) ([a-z][a-z' -]*)\.?$/i],
  ['present-participle', /^(?:dạng phân từ hiện tại(?: và danh động từ \(gerund\))?|hiện tại phân từ|present participle(?: and gerund)?) (?:của|of) ([a-z][a-z' -]*)\.?$/i],
  ['third-person', /^(?:động từ chia ở ngôi thứ ba số ít|third-person singular(?: simple present)?) (?:của|of) ([a-z][a-z' -]*)\.?$/i],
  ['plural', /^(?:số nhiều|danh từ số nhiều|plural) (?:của|of) ([a-z][a-z' -]*)\.?$/i],
  ['comparative', /^(?:dạng so sánh hơn|comparative) (?:của|of) ([a-z][a-z' -]*)\.?$/i],
  ['superlative', /^(?:dạng so sánh nhất|superlative) (?:của|of) ([a-z][a-z' -]*)\.?$/i],
  ['variant', /^dạng viết khác của ([a-z][a-z' -]*)\.?$/i]
];

function parseMorphologyRedirect(meanings: string[]): { baseLemma: string; inflection: import('./types').InflectionType } | undefined {
  const hits = meanings.flatMap(meaning => redirectPatterns.flatMap(([inflection, pattern]) => {
    const match = pattern.exec(meaning.trim());
    return match ? [{ baseLemma: match[1].trim().toLocaleLowerCase(), inflection }] : [];
  }));
  return hits.length && hits.every(hit => hit.baseLemma === hits[0].baseLemma && hit.inflection === hits[0].inflection) ? hits[0] : undefined;
}

function normalizeVietnamese(value: string): string { return value.normalize('NFC').toLocaleLowerCase('vi').trim().replace(/\s+/g, ' '); }

export async function installDictionaryPack(input: unknown): Promise<DictionaryPackRecord> {
  const pack = dictionaryPackSchema.parse(input);
  const record: DictionaryPackRecord = {
    id: pack.id, name: pack.name, version: pack.packVersion, quality: pack.quality, license: pack.license,
    entries: pack.entries, installedAt: Date.now()
  };
  await db.dictionaryPacks.put(record);
  dictionaryRegistry.register(new InstalledDictionaryPack(record));
  return record;
}

export async function loadDictionaryPacks(): Promise<DictionaryPackRecord[]> {
  const records = await db.dictionaryPacks.toArray();
  for (const record of records) dictionaryRegistry.register(new InstalledDictionaryPack(record));
  return records;
}

export async function removeDictionaryPack(id: string): Promise<void> {
  await db.dictionaryPacks.delete(id);
  dictionaryRegistry.unregister(id);
}
