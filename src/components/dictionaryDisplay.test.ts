import { expect, it } from 'vitest';
import { pairDictionarySenses } from './dictionaryDisplay';

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
