import { afterEach, describe, expect, it } from 'vitest';
import { db, type DocumentRecord, type VocabularyRecord } from '../db/database';
import { buildBackup, restoreBackup } from './backup';

const documentRecord: DocumentRecord = { id: 'backup-doc', title: 'Reading', content: 'Text.', kind: 'text', createdAt: 1, updatedAt: 2, location: { kind: 'text', scrollY: 0, progress: 0, updatedAt: 2 }, data: new Blob(['private binary']) };
const vocabularyRecord: VocabularyRecord = { id: 'backup-word', lemma: 'read', surface: 'read', pos: 'verb', ipa: null, contextualMeaning: 'look at written words', meaningVi: ['đọc'], lexicalUnit: null, originalSentence: 'I read.', source: { document: 'Reading', documentId: 'backup-doc', location: '0%' }, createdAt: 3 };

describe('portable backup', () => {
  afterEach(async () => { await db.documents.clear(); await db.vocabulary.clear(); await db.settings.clear(); });
  it('exports user content without binary files, keys, or cache data', async () => {
    await db.documents.put(documentRecord); await db.vocabulary.put(vocabularyRecord);
    await db.settings.put({ key: 'ai-settings', value: { apiKey: 'secret-key' } });
    const backup = await buildBackup();
    const serialized = JSON.stringify(backup);
    expect(backup.documents[0]).not.toHaveProperty('data');
    expect(serialized).not.toContain('secret-key');
    expect(backup.vocabulary[0].lemma).toBe('read');
  });
  it('validates and restores a versioned backup', async () => {
    await db.documents.put(documentRecord); await db.vocabulary.put(vocabularyRecord);
    const backup = await buildBackup();
    await db.documents.clear(); await db.vocabulary.clear();
    await restoreBackup(backup);
    expect((await db.documents.get('backup-doc'))?.content).toBe('Text.');
    expect((await db.vocabulary.get('backup-word'))?.meaningVi).toEqual(['đọc']);
    await expect(restoreBackup({ schema: 'unknown' })).rejects.toBeTruthy();
  });
});
