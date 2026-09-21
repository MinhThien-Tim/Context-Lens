import { z } from 'zod';
import { db, type DictionaryPackRecord } from '../../db/database';
import { dictionaryRegistry } from './registry';
import { rankedLemmaCandidates } from './seedDictionary';
import type { DictionaryEntry, DictionaryMatch, DictionaryProvider } from './types';
import bundledPackUrl from '../../../release/dictionary/context-lens-en-vi-2026.09.1.json?url';

let bundledPackReady: Promise<void> | undefined;

export function loadBundledDictionary(): Promise<void> {
  if (!bundledPackReady) {
    bundledPackReady = (async () => {
      const response = await fetch(bundledPackUrl);
      if (!response.ok) throw new Error('Unable to load the offline dictionary.');
      const pack = dictionaryPackSchema.parse(await response.json());
      dictionaryRegistry.register(new InstalledDictionaryPack({
        id: `bundled.${pack.id}`, name: pack.name, version: pack.packVersion,
        license: pack.license, entries: pack.entries, installedAt: 0
      }), true);
    })().catch((error) => { bundledPackReady = undefined; throw error; });
  }
  return bundledPackReady;
}

const entrySchema = z.object({
  lemma: z.string().min(1).max(80), partOfSpeech: z.string().min(1).max(80), ipa: z.string().max(120).nullable(),
  definitionEn: z.string().max(500), meaningsVi: z.array(z.string().min(1).max(250)).min(1).max(12),
  baseLemma: z.string().min(1).max(80).optional(),
  inflection: z.enum(['past', 'past-participle', 'present-participle', 'third-person', 'plural', 'comparative', 'superlative']).optional()
}).strict();

export const dictionaryPackSchema = z.object({
  schema: z.literal('context-lens.dictionary-pack'), version: z.literal(1), id: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,63}$/),
  name: z.string().min(1).max(100), packVersion: z.string().min(1).max(40),
  license: z.object({ name: z.string().min(1), url: z.string().url(), attribution: z.string().min(1).max(1000) }).strict(),
  entries: z.array(entrySchema).min(1).max(200_000)
}).strict();

export type DictionaryPackInput = z.infer<typeof dictionaryPackSchema>;

class InstalledDictionaryPack implements DictionaryProvider {
  readonly id: string;
  readonly version: string;
  private readonly entries: Map<string, DictionaryEntry>;
  private readonly reverseHits = new Map<string, DictionaryEntry | null>();

  constructor(record: DictionaryPackRecord) {
    this.id = record.id; this.version = record.version;
    this.entries = new Map(record.entries.map((entry) => [entry.lemma.toLocaleLowerCase(), entry]));
    // Version-1 packs predate explicit morphology. Upgrade trusted redirects in memory.
    for (const entry of this.entries.values()) {
      if (entry.baseLemma) continue;
      const parsed = parseMorphologyRedirect(entry.meaningsVi);
      if (parsed && parsed.baseLemma !== entry.lemma && this.entries.has(parsed.baseLemma)) Object.assign(entry, parsed);
    }
  }

  lookup(surface: string): DictionaryMatch | null {
    const normalized = surface.toLocaleLowerCase().replace(/[^a-z'-]/g, '');
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
  ['superlative', /^(?:dạng so sánh nhất|superlative) (?:của|of) ([a-z][a-z' -]*)\.?$/i]
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
    id: pack.id, name: pack.name, version: pack.packVersion, license: pack.license,
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
