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
  const record: VocabularyRecord = {
    id,
    lemma: result.selection.lemma,
    surface: result.selection.surface,
    pos: result.selection.part_of_speech,
    ipa: result.selection.ipa_us ?? result.selection.ipa_uk,
    contextualMeaning: result.quick.definition_en,
    meaningVi: result.quick.meaning_vi,
    lexicalUnit: result.quick.lexical_unit?.text ?? null,
    originalSentence: result.context.sentence,
    source: { document: documentRecord.title, documentId: documentRecord.id, location },
    createdAt: Date.now()
  };
  await db.vocabulary.put(record);
  return id;
}

export async function removeVocabulary(documentId: string, result: LookupResponse): Promise<void> {
  await db.vocabulary.delete(await vocabularyId(documentId, result));
}

function formatLocation(documentRecord: DocumentRecord): string {
  const location = documentRecord.location;
  if (location.kind === 'pdf') return `page ${location.page}`;
  if (location.kind === 'epub') return `chapter ${location.chapter}`;
  return `${Math.round(location.progress * 100)}%`;
}
