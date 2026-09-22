import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { db } from '../../db/database';
import { dictionaryRegistry } from './registry';
import { dictionaryPackSchema, installDictionaryPack, loadDictionaryPacks, removeDictionaryPack } from './packs';
import { lookupLocalLexeme } from '../localLexeme';
import { LocalLanguageEngine } from '../../core/language/local-language-engine';

const pack = {
  schema: 'context-lens.dictionary-pack', version: 1, id: 'vi-test-pack', name: 'Vietnamese Test Pack', packVersion: '2026.1',
  license: { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/', attribution: 'Test data' },
  entries: [{ lemma: 'reader', partOfSpeech: 'noun', ipa: '/ˈriːdə/', definitionEn: 'a person who reads', meaningsVi: ['người đọc'] }]
} as const;

describe('installable dictionary packs', () => {
  afterEach(async () => {
    await db.dictionaryPacks.clear();
    for (const id of [pack.id, 'legacy-morphology', 'reviewed-test', 'imported-test', 'context-lens.wiktionary.en-vi.reviewed']) dictionaryRegistry.unregister(id);
  });
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
  it('rejects a reviewed label without per-sense review evidence', async () => {
    await expect(installDictionaryPack({ ...pack, id: 'reviewed-test', quality: 'reviewed' })).rejects.toThrow(/reviewed provenance/i);
  });
  it('prefers a reviewed meaning over a later imported match', async () => {
    const provenance = {
      sourceId: 'review-fixture', sourceUrl: 'https://example.com/source', sourceRevision: 'revision-1',
      license: 'CC BY-SA 4.0', retrievedAt: '2026-09-22T00:00:00.000Z', reviewStatus: 'human-reviewed', reviewerKind: 'human',
      reviewedBy: 'test-reviewer', reviewedAt: '2026-09-22T01:00:00.000Z'
    } as const;
    await installDictionaryPack({ ...pack, id: 'reviewed-test', quality: 'reviewed', entries: [
      { ...pack.entries[0], lemma: 'provenancetestword', meaningsVi: ['nghĩa đã duyệt'], provenance }
    ] });
    await installDictionaryPack({ ...pack, id: 'imported-test', quality: 'imported', entries: [
      { ...pack.entries[0], lemma: 'provenancetestword', meaningsVi: ['nghĩa máy nhập'] }
    ] });
    expect(lookupLocalLexeme('provenancetestword')?.meaningsVi).toEqual(['nghĩa đã duyệt']);
    expect(dictionaryRegistry.lookup('provenancetestword')?.entry.meaningsVi).toEqual(['nghĩa đã duyệt']);
    expect(dictionaryRegistry.lookupAll('provenancetestword').map(match => match.quality)).toContain('reviewed');
  });
  it('loads the released reviewed pack with sense-aligned provenance', async () => {
    const released = dictionaryPackSchema.parse(JSON.parse(readFileSync('release/dictionary/context-lens-wiktionary-en-vi-reviewed-2026.09.2.json', 'utf8')));
    expect(released.entries.map(entry => entry.lemma)).toContain('counterargument');
    await installDictionaryPack(released);
    expect(lookupLocalLexeme('single')?.senses).toContainEqual(expect.objectContaining({
      id: 'enwiktionary:single:Q134556', meaningVi: 'đĩa đơn'
    }));
    expect(released.entries.every(entry => entry.senses?.every(sense => sense.provenance?.reviewerKind === 'ai-assisted'))).toBe(true);
    const result = await new LocalLanguageEngine().analyzeSelection({
      selectedText: 'bore', sentence: 'Use the tool to bore a hole through the wall.', sourceLang: 'en', targetLang: 'vi'
    });
    expect(result.sense?.id).toBe('enwiktionary:bore:to-make-a-hole');
    expect(result.vietnamese).toMatchObject({ meaning: 'khoan / đục / khoét', senseAligned: true });
  });
  it('upgrades old packs with trusted redirects and keeps exact non-inflections', async () => {
    const legacy = { ...pack, id: 'legacy-morphology', entries: [
      { lemma: 'deliver', partOfSpeech: 'verb', ipa: null, definitionEn: 'to bring something', meaningsVi: ['giao', 'chuyển'] },
      { lemma: 'delivered', partOfSpeech: 'verb', ipa: null, definitionEn: '', meaningsVi: ['Quá khứ và phân từ quá khứ của deliver'] },
      { lemma: 'sing', partOfSpeech: 'verb', ipa: null, definitionEn: 'to make music with the voice', meaningsVi: ['hát'] }
    ] };
    await installDictionaryPack(legacy);
    expect(dictionaryRegistry.lookup('delivered')).toMatchObject({ entry: { lemma: 'deliver' }, morphology: { baseLemma: 'deliver' } });
    expect(dictionaryRegistry.lookup('sing')?.entry.lemma).toBe('sing');
    dictionaryRegistry.unregister(legacy.id);
    await db.dictionaryPacks.delete(legacy.id);
  });
});
