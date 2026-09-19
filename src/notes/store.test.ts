import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../db/database';
import { deleteNote, listNotes, saveNote } from './store';

describe('offline notes', () => {
  afterEach(() => db.notes.clear());
  it('creates, edits, lists and deletes a document selection note', async () => {
    const created = await saveNote({ documentId: 'doc', documentTitle: 'Reading', text: ' First note ', selectedText: 'account for', sentence: 'It accounts for 40%.', location: '25%' });
    expect((await listNotes('doc'))[0]).toMatchObject({ text: 'First note', selectedText: 'account for' });
    const updated = await saveNote({ ...created, text: 'Updated' });
    expect(updated.createdAt).toBe(created.createdAt);
    expect((await db.notes.get(created.id))?.text).toBe('Updated');
    await deleteNote(created.id); expect(await db.notes.count()).toBe(0);
  });
  it('rejects empty notes', async () => {
    await expect(saveNote({ documentId: 'doc', documentTitle: 'Reading', text: '  ', location: '0%' })).rejects.toThrow('EMPTY_NOTE');
  });
});
