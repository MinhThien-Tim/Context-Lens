import { db } from '../db/database';

export interface StorageSnapshot {
  documents: number;
  vocabulary: number;
  cachedLookups: number;
  dictionaryPacks: number;
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
}

export async function storageSnapshot(): Promise<StorageSnapshot> {
  const [documents, vocabulary, cachedLookups, dictionaryPacks] = await Promise.all([db.documents.count(), db.vocabulary.count(), db.lookups.count(), db.dictionaryPacks.count()]);
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  const persisted = await navigator.storage?.persisted?.().catch(() => undefined);
  return {
    documents, vocabulary, cachedLookups, dictionaryPacks,
    usage: estimate?.usage ?? null, quota: estimate?.quota ?? null,
    persisted: persisted ?? null
  };
}

export async function requestPersistentStorage(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  return navigator.storage.persist();
}

export async function clearLookupCache(): Promise<void> {
  await db.lookups.clear();
}

export async function maintainStorageBudget(): Promise<boolean> {
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  if (!estimate?.usage || !estimate.quota || estimate.usage / estimate.quota < 0.85) return false;
  const count = await db.lookups.count();
  if (!count) return false;
  const keys = await db.lookups.orderBy('accessedAt').limit(Math.max(1, Math.ceil(count / 2))).primaryKeys();
  await db.lookups.bulkDelete(keys);
  return true;
}
