import { afterEach, describe, expect, it } from 'vitest';
import { db, type DocumentRecord, type NoteRecord, type VocabularyRecord } from '../db/database';
import { buildBackup, restoreBackup } from './backup';

const documentRecord: DocumentRecord = { id: 'backup-doc', title: 'Reading', content: 'Text.', kind: 'text', createdAt: 1, updatedAt: 2, location: { kind: 'text', scrollY: 0, progress: 0, updatedAt: 2 }, data: new Blob(['private binary']) };
const vocabularyRecord: VocabularyRecord = { id: 'backup-word', lemma: 'read', surface: 'read', pos: 'verb', ipa: null, contextualMeaning: 'look at written words', meaningVi: ['đọc'], lexicalUnit: null, originalSentence: 'I read.', source: { document: 'Reading', documentId: 'backup-doc', location: '0%' }, createdAt: 3 };
const noteRecord: NoteRecord = { id: 'note-1', documentId: 'backup-doc', documentTitle: 'Reading', text: 'Private note', selectedText: 'read', sentence: 'I read.', location: '0%', createdAt: 3, updatedAt: 4 };

describe('portable backup', () => {
  afterEach(async () => { await db.documents.clear(); await db.vocabulary.clear(); await db.notes.clear(); await db.settings.clear(); });
  it('exports user content without binary files, keys, or cache data', async () => {
    await db.documents.put(documentRecord); await db.vocabulary.put(vocabularyRecord); await db.notes.put(noteRecord);
    await db.settings.put({ key: 'ai-settings', value: { apiKey: 'secret-key' } });
    const backup = await buildBackup();
    const serialized = JSON.stringify(backup);
    expect(backup.documents[0]).not.toHaveProperty('data');
    expect(serialized).not.toContain('secret-key');
    expect(backup.vocabulary[0].lemma).toBe('read');
    expect(backup.notes[0].text).toBe('Private note');
  });
  it('validates and restores a versioned backup', async () => {
    await db.documents.put(documentRecord); await db.vocabulary.put(vocabularyRecord); await db.notes.put(noteRecord);
    const backup = await buildBackup();
    await db.documents.clear(); await db.vocabulary.clear(); await db.notes.clear();
    await restoreBackup(backup);
    expect((await db.documents.get('backup-doc'))?.content).toBe('Text.');
    expect((await db.vocabulary.get('backup-word'))?.meaningVi).toEqual(['đọc']);
    expect((await db.notes.get('note-1'))?.text).toBe('Private note');
    await expect(restoreBackup({ schema: 'unknown' })).rejects.toBeTruthy();
  });
  it('accepts a version 1 backup and restores zero notes', async () => {
    const result = await restoreBackup({ schema: 'context-lens.backup', version: 1, exportedAt: new Date().toISOString(), documents: [], vocabulary: [] });
    expect(result.notes).toBe(0);
  });
});

it('round-trips TOC and structured note locations with backup v3', async () => {
  const location = { kind: 'text' as const, absoluteOffset: 3, sectionId: 's1', scrollY: 20, progress: .5, updatedAt: 8 };
  const toc = [{ id: 's1', title: 'Section', level: 1, offset: 3 }];
  await db.documents.put({ ...documentRecord, toc, location });
  await db.notes.put({ ...noteRecord, structuredLocation: location });
  const backup = await buildBackup();
  expect(backup.version).toBe(3);
  await db.documents.clear(); await db.notes.clear();
  await restoreBackup(backup);
  expect((await db.documents.get(documentRecord.id))?.toc).toEqual(toc);
  expect((await db.notes.get(noteRecord.id))?.structuredLocation).toEqual(location);
  await db.documents.clear(); await db.notes.clear();
});

it('still restores legacy version 2 notes without invented anchors', async () => {
  await restoreBackup({ schema: 'context-lens.backup', version: 2, exportedAt: '', documents: [], vocabulary: [], notes: [noteRecord] });
  expect((await db.notes.get(noteRecord.id))?.structuredLocation).toBeUndefined();
  await db.notes.clear();
});
