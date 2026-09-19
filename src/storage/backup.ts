import { z } from 'zod';
import { db, type DocumentRecord, type VocabularyRecord } from '../db/database';

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

const backupSchema = z.object({
  schema: z.literal('context-lens.backup'), version: z.literal(1), exportedAt: z.string(),
  documents: z.array(backupDocumentSchema), vocabulary: z.array(vocabularySchema)
}).strict();

export type ContextLensBackupV1 = z.infer<typeof backupSchema>;

export async function buildBackup(): Promise<ContextLensBackupV1> {
  const [documents, vocabulary] = await Promise.all([db.documents.toArray(), db.vocabulary.toArray()]);
  return {
    schema: 'context-lens.backup', version: 1, exportedAt: new Date().toISOString(),
    documents: documents.map(({ data: _data, lastPosition: _legacy, ...document }) => document),
    vocabulary
  };
}

export async function restoreBackup(input: unknown): Promise<{ documents: number; vocabulary: number }> {
  const backup = backupSchema.parse(input);
  await db.transaction('rw', [db.documents, db.vocabulary], async () => {
    for (const document of backup.documents) {
      const current = await db.documents.get(document.id);
      if (!current || current.updatedAt <= document.updatedAt) await db.documents.put(document as DocumentRecord);
    }
    await db.vocabulary.bulkPut(backup.vocabulary as VocabularyRecord[]);
  });
  return { documents: backup.documents.length, vocabulary: backup.vocabulary.length };
}
