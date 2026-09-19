import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../../db/database';
import { dictionaryRegistry } from './registry';
import { installDictionaryPack, loadDictionaryPacks, removeDictionaryPack } from './packs';

const pack = {
  schema: 'context-lens.dictionary-pack', version: 1, id: 'vi-test-pack', name: 'Vietnamese Test Pack', packVersion: '2026.1',
  license: { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/', attribution: 'Test data' },
  entries: [{ lemma: 'reader', partOfSpeech: 'noun', ipa: '/ˈriːdə/', definitionEn: 'a person who reads', meaningsVi: ['người đọc'] }]
} as const;

describe('installable dictionary packs', () => {
  afterEach(async () => { await db.dictionaryPacks.clear(); dictionaryRegistry.unregister(pack.id); });
  it('validates, persists, loads, and removes a licensed pack', async () => {
    await installDictionaryPack(pack);
    expect(dictionaryRegistry.lookup('readers')?.entry.meaningsVi).toEqual(['người đọc']);
    expect((await loadDictionaryPacks())[0].license.name).toBe('CC BY-SA 4.0');
    await removeDictionaryPack(pack.id);
    expect(dictionaryRegistry.lookup('reader')).toBeNull();
  });
  it('rejects packs without attribution', async () => {
    await expect(installDictionaryPack({ ...pack, license: { ...pack.license, attribution: '' } })).rejects.toBeTruthy();
  });
});
