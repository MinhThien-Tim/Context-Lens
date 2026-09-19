import { db } from '../db/database';
import type { LookupResponse } from './types';

const MAX_LOOKUPS = 500;

export async function findExactLookup(key: string): Promise<LookupResponse | null> {
  const cached = await db.lookups.get(key);
  if (!cached) return null;
  void db.lookups.update(key, { accessedAt: Date.now() });
  return { ...cached.result, source: 'cache' };
}

export async function findContextLookup(contextKey: string): Promise<LookupResponse | null> {
  const matches = await db.lookups.where('contextKey').equals(contextKey).sortBy('accessedAt');
  const cached = matches.at(-1);
  if (!cached) return null;
  void db.lookups.update(cached.key, { accessedAt: Date.now() });
  return { ...cached.result, source: 'cache' };
}

export async function storeLookup(key: string, contextKey: string, result: LookupResponse): Promise<void> {
  const now = Date.now();
  await db.lookups.put({ key, contextKey, result, createdAt: now, accessedAt: now });
  const count = await db.lookups.count();
  if (count <= MAX_LOOKUPS) return;
  const excess = await db.lookups.orderBy('accessedAt').limit(count - MAX_LOOKUPS).primaryKeys();
  await db.lookups.bulkDelete(excess);
}
