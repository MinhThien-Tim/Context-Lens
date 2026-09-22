import { describe, expect, it } from 'vitest';
import type { VocabularyRecord } from '../db/database';
import { buildEnglish101Export, buildEnglish101ExportV1, vocabularyCsv } from './export';

const record: VocabularyRecord = {
  id: 'v1', lemma: 'maintain', surface: 'maintain', pos: 'verb', ipa: '/meɪnˈteɪn/',
  contextualMeaning: 'to keep something at the same level', meaningVi: ['duy trì', 'giữ vững'],
  lexicalUnit: 'maintain public confidence', originalSentence: 'They maintain public confidence.',
  source: { document: 'Policy', documentId: 'doc-1', location: 'page 2' }, createdAt: Date.parse('2026-01-02T00:00:00Z')
};

describe('vocabulary export contracts', () => {
  it('creates a versioned English101-ready payload', () => {
    const result = buildEnglish101Export([record], new Date('2026-02-01T00:00:00Z'));
    expect(result).toEqual(expect.objectContaining({ schema: 'english101.context-vocabulary', version: 2 }));
    expect(result.entries[0]).toEqual(expect.objectContaining({ lemma: 'maintain', lexicalUnit: 'maintain public confidence' }));
  });
  it('retains V1 adapter', () => { expect(buildEnglish101ExportV1([record]).version).toBe(1); });
  it('escapes contextual CSV fields', () => {
    const csv = vocabularyCsv([{ ...record, originalSentence: 'A sentence, with "quotes".' }]);
    expect(csv).toContain('"A sentence, with ""quotes""."');
    expect(csv).toContain('"duy trì; giữ vững"');
  });
});
