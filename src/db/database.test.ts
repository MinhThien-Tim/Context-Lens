import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { db, defaultPreferences, loadPreferences, savePreferences, ContextLensDatabase } from './database';

const legacyVocabulary = {
  id: 'word', lemma: 'read', surface: 'reading', pos: 'verb', ipa: null,
  contextualMeaning: 'understand text', meaningVi: ['read'], lexicalUnit: null,
  originalSentence: 'I am reading.',
  source: { document: 'Book', documentId: 'doc', location: '25%', page: 2 }, createdAt: 3
};

async function upgradeFrom(version: number, stores: Record<string, string>, seed: (legacy: Dexie) => Promise<void>, check: (current: ContextLensDatabase) => Promise<void>) {
  const name = `migration-${crypto.randomUUID()}`;
  const legacy = new Dexie(name);
  legacy.version(version).stores(stores);
  let current: ContextLensDatabase | undefined;
  try {
    await seed(legacy);
    legacy.close();
    current = new ContextLensDatabase(name);
    await current.open();
    expect(current.verno).toBe(15);
    await check(current);
  } finally {
    legacy.close();
    current?.close();
    await Dexie.delete(name);
  }
}

describe('historical database upgrades', () => {
  it('upgrades v1 positions and vocabulary while preserving other rows', async () => {
    const document = { id: 'doc', title: 'Book', content: 'Original text', kind: 'text', createdAt: 1, updatedAt: 2, lastPosition: 420, source: { author: 'Author' } };
    const lookup = { key: 'read', result: { marker: 'cached' }, createdAt: 1, accessedAt: 2 };
    await upgradeFrom(1, {
      documents: 'id, updatedAt', lookups: 'key, accessedAt', settings: 'key', vocabulary: 'id, lemma, createdAt'
    }, async legacy => {
      await legacy.table('documents').put(document);
      await legacy.table('lookups').put(lookup);
      await legacy.table('settings').put({ key: 'custom', value: 'kept' });
      await legacy.table('vocabulary').put(legacyVocabulary);
    }, async current => {
      const stored = await current.documents.get('doc');
      expect(stored).toMatchObject({ id: 'doc', title: 'Book', content: 'Original text', source: { author: 'Author' }, location: { kind: 'text', scrollY: 420, progress: 0 } });
      expect(stored?.location.updatedAt).toEqual(expect.any(Number));
      expect(stored).not.toHaveProperty('lastPosition');
      expect(await current.lookups.get('read')).toEqual(lookup);
      expect(await current.settings.get('custom')).toEqual({ key: 'custom', value: 'kept' });
      expect(await current.vocabularyCollections.get('saved-vocabulary')).toMatchObject({ title: 'Saved vocabulary' });
      expect(await current.vocabulary.get('word')).toEqual({ ...legacyVocabulary, collectionId: 'saved-vocabulary', collectionTitle: 'Saved vocabulary' });
      expect((await current.vocabulary.where('collectionId').equals('saved-vocabulary').toArray()).map(row => row.id)).toEqual(['word']);
      expect((await current.documents.where('title').equals('Book').first())?.id).toBe('doc');
      expect((await current.documents.where('[kind+updatedAt]').equals(['text', 2]).first())?.id).toBe('doc');
    });
  });

  it('upgrades v10 collections and makes modern indexes and tables usable', async () => {
    const document = { id: 'doc', title: 'Book', content: 'Original text', kind: 'text', createdAt: 1, updatedAt: 2, location: { kind: 'text', scrollY: 42, progress: .25, updatedAt: 2 } };
    const note = { id: 'note', documentId: 'doc', documentTitle: 'Book', text: 'Keep this', location: '25%', createdAt: 3, updatedAt: 4 };
    await upgradeFrom(10, {
      documents: 'id, kind, updatedAt', lookups: 'key, contextKey, accessedAt', settings: 'key', vocabulary: 'id, lemma, createdAt',
      dictionaryPacks: 'id, installedAt', translations: 'key, lastUsedAt, provider, languagePair, hits',
      contexts: 'key, lastUsedAt, provider, languagePair, hits', notes: 'id, documentId, updatedAt, [documentId+updatedAt]',
      sentenceAnalyses: 'key, lastUsedAt, provider, languagePair, hits'
    }, async legacy => {
      await legacy.table('documents').put(document);
      await legacy.table('vocabulary').put(legacyVocabulary);
      await legacy.table('notes').put(note);
    }, async current => {
      expect(await current.documents.get('doc')).toEqual(document);
      expect(await current.notes.get('note')).toEqual(note);
      expect(await current.vocabulary.get('word')).toEqual({ ...legacyVocabulary, collectionId: 'saved-vocabulary', collectionTitle: 'Saved vocabulary' });
      expect((await current.documents.where('title').equals('Book').first())?.id).toBe('doc');
      expect((await current.documents.where('[kind+updatedAt]').equals(['text', 2]).first())?.id).toBe('doc');
      const learned = { key: 'read', normalizedKey: 'read', lemma: 'read', surfaceForms: ['reading'], partOfSpeech: ['verb'], meaningsVi: ['read'], source: ['local'], version: 'v1', entry: { lemma: 'read', pos: ['verb'], senses: [] }, updatedAt: 5 };
      await current.learnedLexicon.put(learned);
      expect((await current.learnedLexicon.where('normalizedKey').equals('read').first())?.entry).toEqual(learned.entry);
      const usage = { provider: 'local', model: 'test', task: 'context', latencyMs: 1, cacheHit: true, createdAt: 6 };
      const usageId = await current.aiUsage.add(usage);
      expect(await current.aiUsage.get(usageId)).toMatchObject(usage);
      const ocr = { key: 'doc:1', documentId: 'doc', page: 1, language: 'eng' as const, configVersion: 1, text: 'Words', createdAt: 7 };
      await current.pdfOcr.put(ocr);
      expect((await current.pdfOcr.where('documentId').equals('doc').first())?.text).toBe('Words');
    });
  });

  it('upgrades v14 PDF data and retains current-era records when OCR is added', async () => {
    const document = { id: 'doc', title: 'Scan', content: 'Native text', kind: 'pdf', pdfHash: 'hash', pageOffsets: [0], pdfTextSources: { 1: 'pdf' }, createdAt: 1, updatedAt: 2, location: { kind: 'pdf', page: 1, scrollY: 10, progress: .5, updatedAt: 2 } };
    const collection = { id: 'book', title: 'Book words', createdAt: 1, updatedAt: 2 };
    const vocabulary = { ...legacyVocabulary, collectionId: 'book', collectionTitle: 'Book words' };
    const learned = { key: 'read', normalizedKey: 'read', lemma: 'read', surfaceForms: ['reading'], partOfSpeech: ['verb'], meaningsVi: ['read'], source: ['local'], version: 'v1', entry: { lemma: 'read', pos: ['verb'], senses: [] }, updatedAt: 3 };
    const usage = { id: 1, provider: 'local', model: 'test', task: 'context', latencyMs: 1, cacheHit: true, createdAt: 4 };
    await upgradeFrom(14, {
      documents: 'id, kind, title, updatedAt, [kind+updatedAt]', lookups: 'key, contextKey, accessedAt', settings: 'key',
      vocabulary: 'id, lemma, createdAt, collectionId', vocabularyCollections: 'id, sourceDocumentId, updatedAt',
      dictionaryPacks: 'id, installedAt', translations: 'key, lastUsedAt, provider, languagePair, hits',
      contexts: 'key, lastUsedAt, provider, languagePair, hits', notes: 'id, documentId, updatedAt, [documentId+updatedAt]',
      sentenceAnalyses: 'key, lastUsedAt, provider, languagePair, hits', learnedLexicon: 'key, normalizedKey, lemma, updatedAt',
      aiUsage: '++id, createdAt, provider, task'
    }, async legacy => {
      await legacy.table('documents').put(document);
      await legacy.table('vocabularyCollections').put(collection);
      await legacy.table('vocabulary').put(vocabulary);
      await legacy.table('learnedLexicon').put(learned);
      await legacy.table('aiUsage').put(usage);
    }, async current => {
      expect(await current.documents.get('doc')).toEqual(document);
      expect(await current.vocabularyCollections.get('book')).toEqual(collection);
      expect(await current.vocabulary.get('word')).toEqual(vocabulary);
      expect(await current.learnedLexicon.get('read')).toEqual(learned);
      expect(await current.aiUsage.get(1)).toEqual(usage);
      const ocr = { key: 'doc:1', documentId: 'doc', page: 1, language: 'eng' as const, configVersion: 1, text: 'Recognized text', createdAt: 5 };
      await current.pdfOcr.put(ocr);
      expect(await current.pdfOcr.where('documentId').equals('doc').toArray()).toEqual([ocr]);
      expect(await current.pdfOcr.where('[documentId+page]').equals(['doc', 1]).first()).toEqual(ocr);
      expect(await current.documents.get('doc')).toEqual(document);
    });
  });
});

describe('document storage', () => {
  const database = new ContextLensDatabase(`test-${crypto.randomUUID()}`);
  afterEach(async () => { await database.documents.clear(); await database.pdfOcr.clear(); });
  it('persists text and reading position', async () => {
    await database.documents.put({ id: 'doc-1', title: 'Test', content: 'English text', kind: 'text', createdAt: 1, updatedAt: 1, location: { kind: 'text', scrollY: 0, progress: 0, updatedAt: 1 } });
    await database.documents.update('doc-1', { location: { kind: 'text', scrollY: 420, progress: 0.5, updatedAt: 2 } });
    expect((await database.documents.get('doc-1'))?.location).toEqual(expect.objectContaining({ scrollY: 420, progress: 0.5 }));
  });
  it('keeps OCR text separate from the original PDF record', async () => {
    const original = { id: 'scan', title: 'Scan', content: '', kind: 'pdf' as const, createdAt: 1, updatedAt: 1, pageOffsets: [0], location: { kind: 'pdf' as const, page: 1, scrollY: 0, progress: 0, updatedAt: 1 } };
    await database.documents.put(original);
    await database.pdfOcr.put({ key: 'scan:1:eng:1', documentId: 'scan', page: 1, language: 'eng', configVersion: 1, text: 'Recognized words', createdAt: 2 });
    expect((await database.documents.get('scan'))?.content).toBe('');
    expect((await database.pdfOcr.where('[documentId+page]').equals(['scan', 1]).first())?.text).toBe('Recognized words');
  });
});

describe('reader interface preferences', () => {
  it('persists pinned placement while preserving other preferences', async () => {
    const preferences = { ...defaultPreferences, lookupPopupPlacement: { mode: 'pinned' as const, xRatio: 0.8, yRatio: 0.3 } };
    await savePreferences(preferences);
    expect(await loadPreferences()).toEqual(preferences);
  });
  it.each([undefined, { mode: 'pinned', xRatio: -1, yRatio: 0 }, { mode: 'unknown' }])('defaults invalid placement to Auto (%j)', async lookupPopupPlacement => {
    await db.settings.put({ key: 'reader-preferences', value: { ...defaultPreferences, lookupPopupPlacement } });
    expect((await loadPreferences()).lookupPopupPlacement).toEqual({ mode: 'auto' });
  });
  afterEach(async () => { await db.settings.clear(); });
  it('remembers lookup view and language across preference reloads', async () => {
    await savePreferences({ ...defaultPreferences, lookupViewMode: 'full', languageMode: 'vi' });
    expect(await loadPreferences()).toMatchObject({ lookupViewMode: 'full', languageMode: 'vi' });
    await savePreferences({ ...defaultPreferences, lookupViewMode: 'quick', languageMode: 'bilingual' });
    expect(await loadPreferences()).toMatchObject({ lookupViewMode: 'quick', languageMode: 'bilingual' });
  });
  it.each([undefined, 'invalid'])('defaults missing or invalid lookup view to Quick (%s)', async lookupViewMode => {
    await db.settings.put({ key: 'reader-preferences', value: { ...defaultPreferences, lookupViewMode } });
    expect((await loadPreferences()).lookupViewMode).toBe('quick');
  });
  it('defaults to Advanced and System without legacy settings', async () => {
    await db.settings.clear();
    expect(await loadPreferences()).toEqual(defaultPreferences);
  });
  it('does not overwrite an existing persisted Simple choice with the Advanced default', async () => {
    await db.settings.put({ key: 'reader-preferences', value: { ...defaultPreferences, interfaceMode: 'simple' } });
    const loaded = await loadPreferences();
    expect(loaded.interfaceMode).toBe('simple');
    expect((await db.settings.get('reader-preferences'))?.value).toMatchObject({ interfaceMode: 'simple' });
  });
  it('does not overwrite an existing persisted Advanced choice with the Advanced default', async () => {
    await db.settings.put({ key: 'reader-preferences', value: { ...defaultPreferences, interfaceMode: 'advanced' } });
    const loaded = await loadPreferences();
    expect(loaded.interfaceMode).toBe('advanced');
    expect((await db.settings.get('reader-preferences'))?.value).toMatchObject({ interfaceMode: 'advanced' });
  });
  it('round-trips Simple through savePreferences and reload', async () => {
    await savePreferences({ ...defaultPreferences, interfaceMode: 'simple' });
    expect((await loadPreferences()).interfaceMode).toBe('simple');
  });
  it('round-trips Advanced through savePreferences and reload', async () => {
    await savePreferences({ ...defaultPreferences, interfaceMode: 'advanced' });
    expect((await loadPreferences()).interfaceMode).toBe('advanced');
  });
  it.each([['calm', 'advanced'], ['bright', 'advanced']])('migrates %s without changing appearance', async (legacy, mode) => {
    await db.settings.put({ key: 'homepage.theme', value: legacy });
    const { interfaceMode: _, ...oldPreferences } = defaultPreferences;
    await db.settings.put({ key: 'reader-preferences', value: { ...oldPreferences, theme: 'dark', fontSize: 23 } });
    expect(await loadPreferences()).toMatchObject({ interfaceMode: mode, theme: 'dark', fontSize: 23 });
    expect(await db.settings.get('homepage.theme')).toBeUndefined();
    expect((await db.settings.get('reader-preferences'))?.value).toMatchObject({ interfaceMode: mode });
  });
  it('preserves explicit density over legacy and persists appearance independently', async () => {
    await db.settings.put({ key: 'homepage.theme', value: 'bright' });
    await savePreferences({ ...defaultPreferences, interfaceMode: 'simple', theme: 'light' });
    expect(await loadPreferences()).toMatchObject({ interfaceMode: 'simple', theme: 'light' });
    await savePreferences({ ...defaultPreferences, interfaceMode: 'advanced', theme: 'system' });
    expect(await loadPreferences()).toMatchObject({ interfaceMode: 'advanced', theme: 'system' });
  });
  it('normalizes legacy density and invalid appearance in reader preferences', async () => {
    await db.settings.put({ key: 'reader-preferences', value: { interfaceMode: 'bright', theme: 'unknown' } });
    expect(await loadPreferences()).toMatchObject({ interfaceMode: 'advanced', theme: 'system' });
  });
});

it('defaults Quick to Simple and preserves explicit Standard independently of other preferences', async () => {
  expect(defaultPreferences.lookupQuickMode).toBe('simple');
  await db.settings.clear();
  expect((await loadPreferences()).lookupQuickMode).toBe('simple');
  await savePreferences({ ...defaultPreferences, lookupQuickMode: 'standard', languageMode: 'vi', lookupViewMode: 'full' });
  expect(await loadPreferences()).toMatchObject({ lookupQuickMode: 'standard', languageMode: 'vi', lookupViewMode: 'full' });
});
it.each([undefined, 'invalid'])('normalizes invalid Quick presentation (%s)', async lookupQuickMode => {
  await db.settings.put({ key: 'reader-preferences', value: { ...defaultPreferences, lookupQuickMode } });
  expect((await loadPreferences()).lookupQuickMode).toBe('simple');
});
