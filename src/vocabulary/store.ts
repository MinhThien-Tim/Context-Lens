import { db, type DocumentRecord, type VocabularyRecord } from '../db/database';
import { hashText } from '../lookup/cache';
import type { LookupResponse } from '../lookup/types';

export async function vocabularyId(documentId: string, result: LookupResponse): Promise<string> {
  return `vocab_${await hashText(`${documentId}\n${result.selection.lemma}\n${result.context.sentence}`)}`;
}

export async function isVocabularySaved(documentId: string, result: LookupResponse): Promise<boolean> {
  return Boolean(await db.vocabulary.get(await vocabularyId(documentId, result)));
}

export async function saveVocabulary(documentRecord: DocumentRecord, result: LookupResponse): Promise<string> {
  const id = await vocabularyId(documentRecord.id, result);
  const location = formatLocation(documentRecord);
  const collectionId = `document:${documentRecord.id}`;
  const title = collectionTitle(documentRecord);
  const record: VocabularyRecord = {
    collectionId, collectionTitle: title,
    id,
    lemma: result.selection.lemma,
    surface: result.selection.surface,
    pos: result.selection.part_of_speech,
    ipa: result.selection.ipa_us ?? result.selection.ipa_uk,
    contextualMeaning: result.quick.definition_en,
    meaningVi: result.quick.meaning_vi,
    lexicalUnit: result.quick.lexical_unit?.text ?? null,
    originalSentence: result.context.sentence,
    source: { document: title, documentId: documentRecord.id, location, type: documentRecord.kind, ...documentRecord.source, ...(documentRecord.location.kind === 'pdf' ? { page: documentRecord.location.page } : {}), ...(documentRecord.location.kind === 'epub' ? { chapter: documentRecord.location.chapter } : {}) },
    createdAt: Date.now()
  };
  // TODO: merge richer multi-context senses; exact lemma/sentence saves retain their ID.
  await db.transaction('rw', [db.vocabulary, db.vocabularyCollections], async () => {
    const existing = await db.vocabularyCollections.get(collectionId);
    await db.vocabularyCollections.put(existing ? { ...existing, updatedAt: Date.now() } : { id: collectionId, title, sourceDocumentId: documentRecord.id, sourceType: documentRecord.kind, createdAt: Date.now(), updatedAt: Date.now() });
    if (!await db.vocabulary.get(id)) await localVocabularySink.save(record);
  });
  return id;
}

export async function removeVocabulary(documentId: string, result: LookupResponse): Promise<void> {
  await localVocabularySink.remove(await vocabularyId(documentId, result));
}

function formatLocation(documentRecord: DocumentRecord): string {
  const location = documentRecord.location;
  if (location.kind === 'pdf') return `page ${location.page}`;
  if (location.kind === 'epub') return `chapter ${location.chapter}`;
  return `${Math.round(location.progress * 100)}%`;
}

export function collectionTitle(document: { title?: unknown; filename?: unknown }): string {
  for (const value of [document.title, document.filename]) if (typeof value === 'string' && value.trim()) return value.trim();
  return 'Saved vocabulary';
}
export interface VocabularySink {
  save(entry: VocabularyRecord): Promise<void>;
  remove(id: string): Promise<void>;
}
export const localVocabularySink: VocabularySink = {
  async save(entry) { await db.vocabulary.put(entry); },
  async remove(id) { await db.vocabulary.delete(id); }
};
