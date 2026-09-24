import { z } from 'zod';
import { db, type DocumentRecord, type NoteRecord, type VocabularyRecord } from '../db/database';

const locationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), sectionId: z.string().optional(), absoluteOffset: z.number().int().nonnegative().optional(), scrollY: z.number(), progress: z.number(), updatedAt: z.number() }),
  z.object({ kind: z.literal('pdf'), page: z.number(), absoluteOffset: z.number().int().nonnegative().optional(), pageOffset: z.number().optional(), textOffset: z.number().int().nonnegative().optional(), textSource: z.enum(['pdf', 'ocr']).optional(), viewMode: z.enum(['original', 'reading']).optional(), scrollY: z.number(), progress: z.number(), updatedAt: z.number() }),
  z.object({ kind: z.literal('epub'), chapter: z.number(), cfi: z.string().nullable(), absoluteOffset: z.number().int().nonnegative().optional(), scrollY: z.number(), progress: z.number(), updatedAt: z.number() })
]);

const backupDocumentSchema = z.object({
  id: z.string(), title: z.string(), content: z.string(), kind: z.enum(['text', 'markdown', 'article', 'pdf', 'epub', 'docx']),
  toc: z.array(z.object({ id: z.string(), title: z.string(), level: z.number().int().min(1), parentId: z.string().optional(), page: z.number().int().positive().optional(), chapter: z.number().int().positive().optional(), offset: z.number().int().nonnegative().optional(), href: z.string().optional() })).optional(),
  safeHtml: z.string().optional(), pageOffsets: z.array(z.number()).optional(), pdfHash: z.string().optional(), chapterOffsets: z.array(z.number()).optional(),
  source: z.object({ url: z.string().optional(), author: z.string().optional(), siteName: z.string().optional() }).optional(),
  createdAt: z.number(), updatedAt: z.number(), location: locationSchema
}).strict();

const vocabularySchema = z.object({
  collectionId: z.string().optional(), collectionTitle: z.string().optional(),
  id: z.string(), lemma: z.string(), surface: z.string(), pos: z.string().nullable(), ipa: z.string().nullable(),
  contextualMeaning: z.string(), meaningVi: z.array(z.string()), lexicalUnit: z.string().nullable(), originalSentence: z.string(),
  source: z.object({ document: z.string(), documentId: z.string().optional(), location: z.string(), author: z.string().optional(), type: z.string().optional(), url: z.string().optional(), page: z.number().optional(), chapter: z.union([z.string(), z.number()]).optional() }), createdAt: z.number()
}).strict();

const noteSchema = z.object({
  id: z.string(), documentId: z.string(), documentTitle: z.string(), text: z.string().min(1).max(5000),
  structuredLocation: locationSchema.optional(),
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
const backupV3Schema = backupV2Schema.extend({ version: z.literal(3) });
const backupV4Schema = backupV3Schema.extend({ version: z.literal(4), collections: z.array(z.object({ id: z.string(), title: z.string(), sourceDocumentId: z.string().optional(), sourceType: z.string().optional(), createdAt: z.number(), updatedAt: z.number() })) });
const backupSchema = z.discriminatedUnion('version', [backupV1Schema, backupV2Schema, backupV3Schema, backupV4Schema]);

export type ContextLensBackup = z.infer<typeof backupV4Schema>;

export async function buildBackup(): Promise<ContextLensBackup> {
  const [documents, vocabulary, notes, collections] = await Promise.all([db.documents.toArray(), db.vocabulary.toArray(), db.notes.toArray(), db.vocabularyCollections.toArray()]);
  return {
    schema: 'context-lens.backup', version: 4, exportedAt: new Date().toISOString(),
    documents: documents.map(({ data: _data, lastPosition: _legacy, ...document }) => document),
    vocabulary, notes, collections
  };
}

export async function restoreBackup(input: unknown): Promise<{ documents: number; vocabulary: number; notes: number }> {
  const backup = backupSchema.parse(input);
  const notes = backup.version >= 2 ? ('notes' in backup ? backup.notes : []) : [];
  await db.transaction('rw', [db.documents, db.vocabulary, db.notes, db.vocabularyCollections], async () => {
    for (const document of backup.documents) {
      const current = await db.documents.get(document.id);
      if (!current || current.updatedAt <= document.updatedAt) await db.documents.put(document as DocumentRecord);
    }
    if (backup.version === 4) await db.vocabularyCollections.bulkPut(backup.collections);
    for (const record of backup.vocabulary) {
      const id = record.collectionId ?? 'saved-vocabulary';
      if (!await db.vocabularyCollections.get(id)) await db.vocabularyCollections.put({ id, title: record.collectionTitle ?? 'Saved vocabulary', createdAt: record.createdAt, updatedAt: record.createdAt });
      await db.vocabulary.put({ ...record, collectionId: id } as VocabularyRecord);
    }
    for (const note of notes) {
      const current = await db.notes.get(note.id);
      if (!current || current.updatedAt <= note.updatedAt) await db.notes.put(note as NoteRecord);
    }
  });
  return { documents: backup.documents.length, vocabulary: backup.vocabulary.length, notes: notes.length };
}
