import { db, type NoteRecord } from '../db/database';

export function listNotes(documentId: string): Promise<NoteRecord[]> {
  return db.notes.where('documentId').equals(documentId).reverse().sortBy('updatedAt');
}

export async function saveNote(input: Omit<NoteRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<NoteRecord> {
  const text = input.text.trim();
  if (!text) throw new Error('EMPTY_NOTE');
  const existing = input.id ? await db.notes.get(input.id) : undefined;
  const now = Date.now();
  const note: NoteRecord = { ...input, id: input.id ?? crypto.randomUUID(), text, createdAt: existing?.createdAt ?? now, updatedAt: now };
  await db.notes.put(note);
  return note;
}

export function deleteNote(id: string): Promise<void> { return db.notes.delete(id); }
