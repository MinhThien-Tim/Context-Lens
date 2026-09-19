import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { ContextLensDatabase } from '../db/database';
import { EngineCache, clearEngineMemory } from './cache';
import type { TranslationResult } from './translation/types';
import { validLookup } from '../test/fixtures';
const databases: ContextLensDatabase[] = [];
afterEach(async () => { clearEngineMemory(); await Promise.all(databases.splice(0).map(db => db.delete())); });
const result: TranslationResult = { text: 'điều kiện', sourceText: 'condition', targetLang: 'vi', provider: 'dictionary' };
describe('engine persistence', () => {
  it('upgrades existing v5 data without replacing the database', async () => {
    const name = `migration-${crypto.randomUUID()}`;
    const old = new Dexie(name); old.version(5).stores({ documents: 'id, kind, updatedAt', lookups: 'key, contextKey, accessedAt', settings: 'key', vocabulary: 'id, lemma, createdAt', dictionaryPacks: 'id, installedAt' });
    await old.table('documents').put({ id: 'keep', title: 'My reading' }); old.close();
    const db = new ContextLensDatabase(name); databases.push(db);
    expect((await db.documents.get('keep'))?.title).toBe('My reading');
    expect(await db.translations.count()).toBe(0); expect(await db.contexts.count()).toBe(0);
    expect(await db.notes.count()).toBe(0);
  });
  it('persists results and evicts old low-hit entries', async () => {
    const db = new ContextLensDatabase(`cache-${crypto.randomUUID()}`); databases.push(db);
    const store = new EngineCache(db.translations, 'v1', 2);
    await store.put('one', result, 'dictionary', 'en>vi');
    clearEngineMemory(); expect(await store.get('one')).toEqual(result);
    await store.put('two', result, 'dictionary', 'en>vi');
    await store.put('three', result, 'dictionary', 'en>vi');
    await store.cleanup(); expect(await db.translations.count()).toBe(2);
  });
  it('migrates version 3 context cache records to the compact version 4 contract', async () => {
    const name = `context-migration-${crypto.randomUUID()}`;
    const old = new Dexie(name); old.version(7).stores({ contexts: 'key, lastUsedAt, provider, languagePair, hits', notes: 'id, documentId, updatedAt, [documentId+updatedAt]' });
    await old.table('contexts').put({ key: 'legacy', result: { result: validLookup, provider: 'user-api', model: 'old' }, provider: 'user-api', languagePair: 'en>vi', version: 'context-v3', createdAt: 1, lastUsedAt: 1, hits: 1 }); old.close();
    const db = new ContextLensDatabase(name); databases.push(db);
    const migrated = await db.contexts.get('legacy');
    expect(migrated?.version).toBe('context-v4');
    expect(migrated?.result).toEqual(expect.objectContaining({ provider: 'user-api', explanation: expect.objectContaining({ confidence: validLookup.confidence }) }));
  });
});
