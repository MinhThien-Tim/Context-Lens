import type { VocabularyRecord, VocabularyCollection } from '../db/database';
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

export interface English101VocabularyExportV2 {
  schema: 'english101.context-vocabulary'; version: 2; exportedAt: string;
  collections: VocabularyCollection[];
  entries: Array<Omit<English101VocabularyExportV1['entries'][number], 'sentence' | 'source'> & {
    context: { sentence: string; selectedText: string };
    source: Omit<VocabularyRecord['source'], 'document'> & { title: string };
    collectionId: string;
  }>;
}
