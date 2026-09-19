import { z } from 'zod';
import { db, type DocumentRecord, type NoteRecord, type VocabularyRecord } from '../db/database';

const locationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), scrollY: z.number(), progress: z.number(), updatedAt: z.number() }),
  z.object({ kind: z.literal('pdf'), page: z.number(), scrollY: z.number(), progress: z.number(), updatedAt: z.number() }),
  z.object({ kind: z.literal('epub'), chapter: z.number(), cfi: z.string().nullable(), scrollY: z.number(), progress: z.number(), updatedAt: z.number() })
]);

const backupDocumentSchema = z.object({
  id: z.string(), title: z.string(), content: z.string(), kind: z.enum(['text', 'markdown', 'article', 'pdf', 'epub', 'docx']),
  safeHtml: z.string().optional(), pageOffsets: z.array(z.number()).optional(), chapterOffsets: z.array(z.number()).optional(),
  source: z.object({ url: z.string().optional(), author: z.string().optional(), siteName: z.string().optional() }).optional(),
  createdAt: z.number(), updatedAt: z.number(), location: locationSchema
}).strict();

const vocabularySchema = z.object({
  id: z.string(), lemma: z.string(), surface: z.string(), pos: z.string().nullable(), ipa: z.string().nullable(),
  contextualMeaning: z.string(), meaningVi: z.array(z.string()), lexicalUnit: z.string().nullable(), originalSentence: z.string(),
  source: z.object({ document: z.string(), documentId: z.string().optional(), location: z.string() }), createdAt: z.number()
}).strict();

const noteSchema = z.object({
  id: z.string(), documentId: z.string(), documentTitle: z.string(), text: z.string().min(1).max(5000),
  selectedText: z.string().optional(), sentence: z.string().optional(), location: z.string(), createdAt: z.number(), updatedAt: z.number()
}).strict();

const backupV1Schema = z.object({
  schema: z.literal('context-lens.backup'), version: z.literal(1), exportedAt: z.string(),
  documents: z.array(backupDocumentSchema), vocabulary: z.array(vocabularySchema)
}).strict();
const backupV2Schema = z.object({
  schema: z.literal('context-lens.backup'), version: z.literal(2), exportedAt: z.string(),
  documents: z.array(backupDocumentSchema), vocabulary: z.array(vocabularySchema), notes: z.array(noteSchema)
}).strict();
const backupSchema = z.discriminatedUnion('version', [backupV1Schema, backupV2Schema]);

export type ContextLensBackup = z.infer<typeof backupV2Schema>;

export async function buildBackup(): Promise<ContextLensBackup> {
  const [documents, vocabulary, notes] = await Promise.all([db.documents.toArray(), db.vocabulary.toArray(), db.notes.toArray()]);
  return {
    schema: 'context-lens.backup', version: 2, exportedAt: new Date().toISOString(),
    documents: documents.map(({ data: _data, lastPosition: _legacy, ...document }) => document),
    vocabulary, notes
  };
}

export async function restoreBackup(input: unknown): Promise<{ documents: number; vocabulary: number; notes: number }> {
  const backup = backupSchema.parse(input);
  const notes = backup.version === 2 ? backup.notes : [];
  await db.transaction('rw', [db.documents, db.vocabulary, db.notes], async () => {
    for (const document of backup.documents) {
      const current = await db.documents.get(document.id);
      if (!current || current.updatedAt <= document.updatedAt) await db.documents.put(document as DocumentRecord);
    }
    await db.vocabulary.bulkPut(backup.vocabulary as VocabularyRecord[]);
    for (const note of notes) {
      const current = await db.notes.get(note.id);
      if (!current || current.updatedAt <= note.updatedAt) await db.notes.put(note as NoteRecord);
    }
  });
  return { documents: backup.documents.length, vocabulary: backup.vocabulary.length, notes: notes.length };
}
