import { expect, it } from 'vitest';
import { alignBilingualSenses } from './alignment';
import type { LexicalSense } from '../../core/language/types';

const sources = [{ id: 'vi:air', lemma: 'plane', pos: 'noun', glosses: ['máy bay'], source: 'test' },
  { id: 'vi:action', lemma: 'plane', pos: 'verb', glosses: ['máy bay'], source: 'test' },
  { id: 'vi:unknown', lemma: 'plane', pos: 'noun', glosses: ['nghĩ'], source: 'test' }];
const anchors = (lemma: string) => ({ lemma, pos: ['noun'], senses: [], meaningsVi: /^(?:aircraft|airplane)$/.test(lemma) ? ['máy bay'] : [] });
it('requires multiple lexical anchors, compatible POS and no competing sense', () => {
  const senses: LexicalSense[] = [{ id: 'air', pos: 'noun', definitionEn: 'an aircraft', synonyms: ['airplane'] },
    { id: 'tool', pos: 'noun', definitionEn: 'tool' }];
  const result = alignBilingualSenses(senses, sources, anchors);
  expect(result[0]).toMatchObject({ meaningVi: 'máy bay', alignment: { kind: 'inferred', confidence: 'high' } });
  expect(result[0].alignment?.evidence).not.toContain('vi:action');
  expect(result[1].alignment?.kind).toBe('unresolved');
  const competing = alignBilingualSenses([...senses, { ...senses[0], id: 'competitor' }], sources, anchors);
  expect(competing.every(sense => sense.alignment?.kind === 'unresolved')).toBe(true);
});
it('never overwrites explicit links and reuses only unique exact glosses', () => {
  const senses: LexicalSense[] = [{ id: 'source', pos: 'noun', definitionEn: 'an aircraft', meaningVi: 'tàu bay' },
    { id: 'copy', pos: 'noun', definitionEn: 'an aircraft' }, { id: 'wrong-pos', pos: 'verb', definitionEn: 'an aircraft' }];
  const result = alignBilingualSenses(senses, [], anchors);
  expect(result[0]).toMatchObject({ meaningVi: 'tàu bay', alignment: { kind: 'explicit' } });
  expect(result[1]).toMatchObject({ meaningVi: 'tàu bay', alignment: { kind: 'identical-gloss' } });
  expect(result[2].alignment?.kind).toBe('unresolved');
});
it('does not reuse generated translations as exact source links', () => {
  const result = alignBilingualSenses([{ id: 'generated', pos: 'verb', definitionEn: 'reflect', meaningVi: 'nghĩ',
    alignment: { kind: 'translated-definition', confidence: 'low', evidence: ['provider'], dependsOnSenseId: 'generated' } },
  { id: 'copy', pos: 'verb', definitionEn: 'reflect' }], [], anchors);
  expect(result[1].alignment?.kind).toBe('unresolved');
});
