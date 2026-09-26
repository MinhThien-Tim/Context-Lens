import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { db } from '../../db/database';
import { dictionaryRegistry } from './registry';
import { dictionaryPackSchema, installDictionaryPack, loadDictionaryPacks, removeDictionaryPack } from './packs';
import { lookupLocalLexeme } from '../localLexeme';
import { LocalLanguageEngine } from '../../core/language/local-language-engine';

import * as wordnet from '../../core/language/wordnet';

const pack = {
  schema: 'context-lens.dictionary-pack', version: 1, id: 'vi-test-pack', name: 'Vietnamese Test Pack', packVersion: '2026.1',
  license: { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/', attribution: 'Test data' },
  entries: [{ lemma: 'reader', partOfSpeech: 'noun', ipa: '/ˈriːdə/', definitionEn: 'a person who reads', meaningsVi: ['người đọc'] }]
} as const;

describe('installable dictionary packs', () => {
  afterEach(async () => {
    await db.dictionaryPacks.clear();
    for (const id of [pack.id, 'sense-foundation', 'legacy-morphology', 'weak-inflection', 'reviewed-test', 'imported-test', 'context-lens.wiktionary.en-vi.reviewed']) dictionaryRegistry.unregister(id);
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
  it('reconciles an exact entry with its lemma instead of hiding richer data', async () => {
    const inflected = { ...pack, id: 'weak-inflection', entries: [
      { lemma: 'represent', partOfSpeech: 'verb', ipa: null, definitionEn: 'to speak for someone', meaningsVi: ['đại diện'],
        senses: [{ id: 'represent.agent', definitionEn: 'to speak for someone', meaningsVi: ['đại diện'] }] },
      { lemma: 'represented', partOfSpeech: 'verb', ipa: null, definitionEn: '', meaningsVi: ['Quá khứ và phân từ quá khứ của represent'] },
      { lemma: 'study', partOfSpeech: 'verb / noun', ipa: null, definitionEn: 'to learn about a subject', meaningsVi: ['nghiên cứu'] },
      { lemma: 'studies', partOfSpeech: 'verb', ipa: null, definitionEn: '', meaningsVi: ['ngôi thứ ba số ít'] },
      { lemma: 'strong', partOfSpeech: 'adjective', ipa: null, definitionEn: 'having great power', meaningsVi: ['mạnh'] },
      { lemma: 'stronger', partOfSpeech: 'adjective', ipa: null, definitionEn: '', meaningsVi: ['mạnh hơn'] },
      { lemma: 'smart', partOfSpeech: 'adjective', ipa: null, definitionEn: 'quick-witted', meaningsVi: ['thông minh'] },
      { lemma: 'smarter', partOfSpeech: 'adjective', ipa: null, definitionEn: 'quicker-witted than', meaningsVi: ['thông minh hơn'] }
    ] };
    await installDictionaryPack(inflected);
    // A morphology redirect answers with the lemma and keeps the exact form attached.
    expect(dictionaryRegistry.lookup('represented')).toMatchObject({
      entry: { lemma: 'represent' }, surfaceEntry: { lemma: 'represented' }, morphology: { baseLemma: 'represent' }
    });
    // A weak derived entry inherits the richer lemma instead of answering on its own.
    expect(dictionaryRegistry.lookup('studies')).toMatchObject({
      entry: { lemma: 'study' }, surfaceEntry: { lemma: 'studies' }, morphology: { baseLemma: 'study' }
    });
    // A rich exact entry outranks any derived lemma candidate.
    expect(dictionaryRegistry.lookup('smarter')?.entry.lemma).toBe('smarter');
    expect(dictionaryRegistry.lookup('smarter')?.morphology).toBeUndefined();
    const merged = lookupLocalLexeme('represented');
    expect(merged?.lemma).toBe('represent');
    expect(merged?.meaningsVi).toContain('đại diện');
    expect(merged?.morphology).toMatchObject({ surface: 'represented', baseLemma: 'represent' });
    expect(merged?.senses.map(sense => sense.definitionEn)).toEqual(['to speak for someone']);
    // The pipeline keeps the surface form and shows the lemma meaning with its morphology.
    const engine = new LocalLanguageEngine();
    const comparative = await engine.analyzeSelection({ selectedText: 'stronger', sentence: 'This method is stronger.', sourceLang: 'en', targetLang: 'vi' });
    expect(comparative.selection).toMatchObject({ lemma: 'strong', status: 'base-form' });
    expect(comparative.dictionary?.surfaceForm).toBe('stronger');
    expect(comparative.english?.definition).toBe('having great power');
    const participle = await engine.analyzeSelection({ selectedText: 'represented', sentence: 'The chart represented every region.', sourceLang: 'en', targetLang: 'vi' });
    expect(participle.selection).toMatchObject({ lemma: 'represent', status: 'base-form' });
    expect(participle.dictionary?.surfaceForm).toBe('represented');
    expect(participle.vietnamese?.meaning).toContain('đại diện');
  });
});

 describe('sense foundation and local Vietnamese references', () => {
  const entry = (lemma: string, meaningsVi: string[], definitionEn = '') => ({ lemma, meaningsVi, definitionEn, partOfSpeech: 'adverb', ipa: null });
  afterEach(async () => { dictionaryRegistry.unregister('sense-foundation'); await db.dictionaryPacks.delete('sense-foundation'); });
  async function install(entries: ReturnType<typeof entry>[]) {
    await installDictionaryPack({ ...pack, id: 'sense-foundation', entries });
  }
  it('preserves every represent sense and inherited represented data without position pairing', async () => {
    vi.spyOn(wordnet, 'lookupWordNet').mockImplementation(lemma => lemma === 'represent' ? {
      lemma, pos: ['verb'], senses: Array.from({ length: 8 }, (_, i) => ({ id: `wn:${i}`, pos: 'verb',
        definitionEn: i === 0 ? 'be representative or typical of' : `distinct English sense ${i}` }))
    } : undefined);
    await install([entry('represent', ['tiêu biểu cho', 'đại diện cho']),
      entry('represented', ['Quá khứ và phân từ quá khứ của represent'])]);
    for (const selectedText of ['represent', 'represented']) {
      const result = await new LocalLanguageEngine().analyzeSelection({ selectedText, sentence: `They ${selectedText} the region.`, sourceLang: 'en', targetLang: 'vi' });
      expect(result.dictionary?.senses).toHaveLength(8);
      expect(result.dictionary?.senses.every(sense => sense.meaningsVi.length === 0 && sense.source === 'wordnet')).toBe(true);
      expect(result.dictionary?.unpairedMeaningsVi).toEqual(['tiêu biểu cho', 'đại diện cho']);
      expect(result.selection.lemma).toBe('represent');
    }
  });
  it('keeps a reliable source pair and English with missing Vietnamese', async () => {
    await installDictionaryPack({ ...pack, id: 'sense-foundation', entries: [{ ...entry('pairedfixture', ['nghĩa một', 'nghĩa hai'], 'source definition'),
      senses: [{ id: 'pair:1', definitionEn: 'source definition', meaningsVi: ['nghĩa một', 'nghĩa hai'] }] }] });
    const lexeme = lookupLocalLexeme('pairedfixture');
    expect(lexeme?.senses[0].meaningsVi).toEqual(['nghĩa một', 'nghĩa hai']);
    vi.spyOn(wordnet, 'lookupWordNet').mockReturnValue({ lemma: 'englishfixture', pos: ['noun'], senses: [{ id: 'en:1', definitionEn: 'English remains available' }] });
    expect(lookupLocalLexeme('englishfixture')?.senses[0].definitionEn).toBe('English remains available');
  });
  it('resolves vicariously while retaining normal vicarious and all meanings', async () => {
    await install([entry('vicarious', ['gián tiếp', 'thay cho người khác']), entry('vicariously', ['Xem vicarious'])]);
    expect(dictionaryRegistry.lookup('vicarious')?.entry.meaningsVi).toEqual(['gián tiếp', 'thay cho người khác']);
    expect(dictionaryRegistry.lookup('vicariously')?.entry).toMatchObject({ lemma: 'vicariously', meaningsVi: ['gián tiếp', 'thay cho người khác'],
      vietnameseReferences: [{ target: 'vicarious', status: 'resolved' }] });
    expect(lookupLocalLexeme('vicariously')?.vietnameseReferences?.[0].status).toBe('resolved');
  });
  it('retains a missing reference with an explicit unresolved state', async () => {
    await install([entry('referencefixture', ['Xem absentfixture', 'nghĩa độc lập'])]);
    expect(dictionaryRegistry.lookup('referencefixture')?.entry).toMatchObject({ meaningsVi: ['Xem absentfixture', 'nghĩa độc lập'],
      vietnameseReferences: [{ status: 'unresolved', reason: 'missing' }] });
  });
  it('terminates cycles', async () => {
    await install([entry('cyclealpha', ['Xem cyclebeta']), entry('cyclebeta', ['Xem cyclealpha'])]);
    expect(dictionaryRegistry.lookup('cyclealpha')?.entry.vietnameseReferences).toContainEqual(expect.objectContaining({ status: 'unresolved', reason: 'cycle' }));
  });
  it('resolves two hops and stops before a third', async () => {
    await install([entry('hopalpha', ['Xem hopbeta']), entry('hopbeta', ['Xem hopgamma']), entry('hopgamma', ['cuối'])]);
    expect(dictionaryRegistry.lookup('hopalpha')?.entry.meaningsVi).toEqual(['cuối']);
    await install([entry('hopalpha', ['Xem hopbeta']), entry('hopbeta', ['Xem hopgamma']), entry('hopgamma', ['Xem hopdelta']), entry('hopdelta', ['cuối'])]);
    expect(dictionaryRegistry.lookup('hopalpha')?.entry.vietnameseReferences).toContainEqual(expect.objectContaining({ reason: 'depth', status: 'unresolved' }));
  });
});
