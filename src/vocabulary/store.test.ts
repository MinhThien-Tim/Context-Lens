import { afterEach, describe, expect, it } from 'vitest';
import { db, type DocumentRecord } from '../db/database';
import { validLookup } from '../test/fixtures';
import { isVocabularySaved, removeVocabulary, saveVocabulary } from './store';

const documentRecord: DocumentRecord = {
  id: 'doc-vocab', title: 'Policy article', kind: 'text', content: validLookup.context.sentence,
  createdAt: 1, updatedAt: 1, location: { kind: 'text', scrollY: 100, progress: 0.4, updatedAt: 1 }
};

describe('contextual vocabulary store', () => {
  afterEach(async () => db.vocabulary.clear());
  it('saves full context and toggles the deterministic record', async () => {
    await saveVocabulary(documentRecord, validLookup);
    expect(await isVocabularySaved(documentRecord.id, validLookup)).toBe(true);
    const saved = (await db.vocabulary.toArray())[0];
    expect(saved).toEqual(expect.objectContaining({ lemma: 'maintain', originalSentence: validLookup.context.sentence, lexicalUnit: 'maintain public confidence' }));
    expect(saved.source).toEqual(expect.objectContaining({ document: 'Policy article', location: '40%' }));
    await removeVocabulary(documentRecord.id, validLookup);
    expect(await isVocabularySaved(documentRecord.id, validLookup)).toBe(false);
  });
});
