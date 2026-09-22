import { db } from '../db/database';
import type { LexicalEntry } from '../core/language/types';

const MAX_ENTRIES = 2000;
const keyFor = (normalizedKey: string, version: string) => `${version}:${normalizedKey}`;

export async function readLearnedLexeme(normalizedKey: string, version: string): Promise<LexicalEntry | undefined> {
  try { return (await db.learnedLexicon.get(keyFor(normalizedKey, version)))?.entry; } catch { return undefined; }
}

export async function storeLearnedLexeme(normalizedKey: string, surface: string, entry: LexicalEntry, version: string): Promise<void> {
  try {
    const key = keyFor(normalizedKey, version);
    const existing = await db.learnedLexicon.get(key);
    const sources = [...new Set([...(entry.sources?.english ?? []), ...(entry.sources?.vietnamese ?? []), entry.sources?.morphology].filter((value): value is string => Boolean(value)))];
    await db.learnedLexicon.put({ key, normalizedKey, lemma: entry.lemma,
      surfaceForms: [...new Set([...(existing?.surfaceForms ?? []), surface])].slice(-12), partOfSpeech: entry.pos,
      definitionEn: entry.senses[0]?.definitionEn, meaningsVi: entry.meaningsVi ?? [], source: sources,
      version, entry, updatedAt: Date.now() });
    const count = await db.learnedLexicon.count();
    if (count > MAX_ENTRIES) {
      const keys = await db.learnedLexicon.orderBy('updatedAt').limit(count - MAX_ENTRIES).primaryKeys();
      await db.learnedLexicon.bulkDelete(keys);
    }
  } catch { /* Persistence is optional; memory lookup remains authoritative. */ }
}
