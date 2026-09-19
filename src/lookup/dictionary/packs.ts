import { z } from 'zod';
import { db, type DictionaryPackRecord } from '../../db/database';
import { dictionaryRegistry } from './registry';
import { lemmaCandidates } from './seedDictionary';
import type { DictionaryEntry, DictionaryMatch, DictionaryProvider } from './types';

const entrySchema = z.object({
  lemma: z.string().min(1).max(80), partOfSpeech: z.string().min(1).max(80), ipa: z.string().max(120).nullable(),
  definitionEn: z.string().max(500), meaningsVi: z.array(z.string().min(1).max(250)).min(1).max(12)
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

  constructor(record: DictionaryPackRecord) {
    this.id = record.id; this.version = record.version;
    this.entries = new Map(record.entries.map((entry) => [entry.lemma.toLocaleLowerCase(), entry]));
  }

  lookup(surface: string): DictionaryMatch | null {
    const normalized = surface.toLocaleLowerCase().replace(/[^a-z'-]/g, '');
    for (const candidate of lemmaCandidates(normalized)) {
      const entry = this.entries.get(candidate);
      if (entry) return { entry, surface };
    }
    return null;
  }
}

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
