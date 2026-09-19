import type { VocabularyRecord } from '../db/database';

export interface English101VocabularyExportV1 {
  schema: 'english101.context-vocabulary';
  version: 1;
  exportedAt: string;
  entries: Array<{
    id: string;
    lemma: string;
    surface: string;
    partOfSpeech: string | null;
    ipa: string | null;
    meaningEn: string;
    meaningsVi: string[];
    lexicalUnit: string | null;
    sentence: string;
    source: VocabularyRecord['source'];
    createdAt: string;
  }>;
}

export function buildEnglish101Export(records: VocabularyRecord[], now = new Date()): English101VocabularyExportV1 {
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
