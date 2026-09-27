import { afterEach, expect, it } from 'vitest';
import { db, queryDocumentLibrary, type DocumentRecord } from '../db/database';
import { dismissContinueReading, queryContinueReading } from './continueReading';

afterEach(async () => { await db.documents.clear(); await db.notes.clear(); });

it('persists dismissal without modifying reading data, notes or Library membership', async () => {
  const doc: DocumentRecord = { id: 'book', title: 'Book', content: 'Original text', kind: 'pdf', data: new Blob(['file']), highlights: [], createdAt: 1, updatedAt: 2, location: { kind: 'pdf', page: 2, scrollY: 0, progress: 0.5, updatedAt: 2 } };
  await db.documents.put(doc);
  await db.notes.put({ id: 'note', documentId: doc.id, documentTitle: doc.title, text: 'Keep this note', createdAt: 1, updatedAt: 1, location: 'Page 2', structuredLocation: doc.location });
  const storedBefore = await db.documents.get(doc.id);
  expect(await queryContinueReading()).toHaveLength(1);
  await dismissContinueReading(doc.id);
  expect(await queryContinueReading()).toEqual([]);
  expect(await db.documents.get(doc.id)).toEqual({ ...storedBefore, continueReadingDismissed: true });
  expect(await db.notes.get('note')).toBeDefined();
  expect((await queryDocumentLibrary()).items.map(item => item.id)).toContain(doc.id);
  await db.documents.update(doc.id, { updatedAt: 3 });
  expect(await queryContinueReading()).toEqual([]);
});

it('keeps ten reading documents available and excludes unstarted documents', async () => {
  await db.documents.bulkPut(Array.from({ length: 11 }, (_, i) => ({ id: `book-${i}`, title: `Book ${i}`, kind: 'text' as const, content: 'Text', createdAt: i, updatedAt: i, location: { kind: 'text' as const, scrollY: i, progress: i ? 0.2 : 0, updatedAt: i } })));
  expect(await queryContinueReading()).toHaveLength(10);
});
