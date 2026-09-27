import { expect, it } from 'vitest';
import { compactDictionarySenses, pairDictionarySenses, unpairedVietnameseMeanings } from './dictionaryDisplay';
import { validLookup } from '../test/fixtures';

it('keeps every POS in Quick while limiting ordinary meanings', () => {
  const senses = ['noun', 'noun', 'noun', 'verb', 'verb', 'adjective', 'adverb'].map((pos, index) => ({
    id: String(index), pos, definitionEn: `Meaning ${index}`, meaningsVi: [], source: 'local' as const, contextScore: 0, contextMatch: false
  }));
  const compact = compactDictionarySenses(senses, 'noun');
  expect(compact.map(sense => sense.pos)).toEqual(['noun', 'noun', 'verb', 'adjective', 'adverb']);
  expect(compact.map(sense => sense.id)).not.toContain('2');
});

it('retains local Vietnamese glosses when context has no dictionary, without inventing pairs', () => {
  const result = { ...validLookup, dictionary: { word: 'maintain', surfaceForm: 'maintain', lemma: 'maintain', pronunciation: null, contextConfidence: 0,
    senses: [{ id: 'paired', pos: 'verb', definitionEn: 'Keep going', meaningsVi: ['duy trì'], source: 'local' as const, contextScore: 0, contextMatch: false }],
    unpairedMeaningsVi: ['bảo dưỡng', ' BẢO DƯỠNG ', 'duy trì'] } };
  expect(unpairedVietnameseMeanings(result, { ...validLookup, dictionary: undefined })).toEqual(['bảo dưỡng']);
  expect(result.dictionary.senses[0].meaningsVi).toEqual(['duy trì']);
});

it('uses available aggregate glosses for an English-only dictionary', () => {
  const result = { ...validLookup, dictionary: { word: 'maintain', surfaceForm: 'maintain', lemma: 'maintain', pronunciation: null, contextConfidence: 0,
    senses: [{ id: 'english', pos: 'verb', definitionEn: 'Keep going', meaningsVi: [], source: 'wordnet' as const, contextScore: 0, contextMatch: false }] } };
  expect(unpairedVietnameseMeanings(result)).toEqual(validLookup.quick.meaning_vi);
  expect(result.dictionary.senses[0].meaningsVi).toEqual([]);
});

it('does not manufacture bilingual pairs from aggregate Vietnamese meaning order', () => {
  const paired = pairDictionarySenses([
    { id: 'v1', pos: 'verb', definitionEn: 'make less natural or innocent', meaningsVi: [], source: 'local', contextScore: 0.8, contextMatch: true },
    { id: 'v2', pos: 'verb', definitionEn: 'change meaning in order to mislead', meaningsVi: [], source: 'local', contextScore: 0, contextMatch: false },
    { id: 'vi', pos: 'verb', definitionEn: '', meaningsVi: ['làm mất vẻ tự nhiên', 'ngụy biện'], source: 'local', contextScore: 0, contextMatch: false }
  ]);
  expect(paired).toHaveLength(3);
  expect(paired.slice(0, 2).map(sense => sense.meaningsVi)).toEqual([[], []]);
  expect(paired[2]).toMatchObject({ definitionEn: '', meaningsVi: ['làm mất vẻ tự nhiên', 'ngụy biện'] });
});
