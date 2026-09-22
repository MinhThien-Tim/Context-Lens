import { expect, it } from 'vitest';
import { pairDictionarySenses } from './dictionaryDisplay';

it('places short legacy Vietnamese meanings beside English definitions without duplication', () => {
  const paired = pairDictionarySenses([
    { id: 'v1', pos: 'verb', definitionEn: 'make less natural or innocent', meaningsVi: [], source: 'local', contextScore: 0.8, contextMatch: true },
    { id: 'v2', pos: 'verb', definitionEn: 'change meaning in order to mislead', meaningsVi: [], source: 'local', contextScore: 0, contextMatch: false },
    { id: 'vi', pos: 'verb', definitionEn: '', meaningsVi: ['làm mất vẻ tự nhiên', 'ngụy biện'], source: 'local', contextScore: 0, contextMatch: false }
  ]);
  expect(paired).toHaveLength(2);
  expect(paired.map(sense => sense.meaningsVi)).toEqual([['làm mất vẻ tự nhiên'], ['ngụy biện']]);
});
