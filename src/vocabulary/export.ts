import type { VocabularyRecord } from '../db/database';

import type { English101VocabularyExportV1, English101VocabularyExportV2 } from './contract';
export type { English101VocabularyExportV1, English101VocabularyExportV2 } from './contract';

export function buildEnglish101ExportV1(records: VocabularyRecord[], now = new Date()): English101VocabularyExportV1 {
  return {
    schema: 'english101.context-vocabulary', version: 1, exportedAt: now.toISOString(),
    entries: records.map((record) => ({
      id: record.id, lemma: record.lemma, surface: record.surface, partOfSpeech: record.pos, ipa: record.ipa,
      meaningEn: record.contextualMeaning, meaningsVi: record.meaningVi, lexicalUnit: record.lexicalUnit,
      sentence: record.originalSentence, source: record.source, createdAt: new Date(record.createdAt).toISOString()
    }))
  };
}

export function vocabularyCsv(records: VocabularyRecord[]): string {
  const rows = [['lemma', 'surface', 'part_of_speech', 'ipa', 'meaning_en', 'meaning_vi', 'lexical_unit', 'sentence', 'document', 'location', 'created_at']];
  for (const record of records) rows.push([
    record.lemma, record.surface, record.pos ?? '', record.ipa ?? '', record.contextualMeaning,
    record.meaningVi.join('; '), record.lexicalUnit ?? '', record.originalSentence,
    record.source.document, record.source.location, new Date(record.createdAt).toISOString()
  ]);
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function buildEnglish101Export(records: VocabularyRecord[], now = new Date()): English101VocabularyExportV2 {
  const v1 = buildEnglish101ExportV1(records, now);
  const collections = new Map<string, English101VocabularyExportV2['collections'][number]>();
  const entries = v1.entries.map(({ sentence, source, ...entry }, index) => {
    const record = records[index];
    const collectionId = record.collectionId ?? 'saved-vocabulary';
    if (!collections.has(collectionId)) collections.set(collectionId, { id: collectionId, title: record.collectionTitle ?? 'Saved vocabulary', sourceDocumentId: source.documentId, sourceType: source.type, createdAt: record.createdAt, updatedAt: record.createdAt });
    const { document, ...metadata } = source;
    return { ...entry, context: { sentence, selectedText: entry.surface }, source: { ...metadata, title: document }, collectionId };
  });
  return { schema: v1.schema, version: 2, exportedAt: v1.exportedAt, collections: [...collections.values()], entries };
}
