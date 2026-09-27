import { expect, it } from 'vitest';
import { alignBilingualSenses } from './alignment';
import type { LexicalSense, LexicalEntry } from '../../core/language/types';

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

it.each(['think', 'mean', 'run', 'take', 'hold', 'consider', 'remember', 'stop'])('uses stable frames without occurrence input for %s', lemma => {
  const source = [{ id: 'source', lemma, pos: 'verb', glosses: ['cho rằng'], examples: [`They ${lemma} that it works.`], source: 'dictionary' }];
  const anchor = (word: string): LexicalEntry => ({ lemma: word, pos: ['verb'], senses: [], meaningsVi: ['cho rằng'] });
  const candidates: LexicalSense[] = [
    { id: 'clause', pos: 'verb', definitionEn: 'believe suppose', verbFrames: [26] },
    { id: 'infinitive', pos: 'verb', definitionEn: 'believe suppose', verbFrames: [28] }
  ];
  const result = alignBilingualSenses(candidates, source, anchor, lemma);
  expect(result[0]).toMatchObject({ meaningVi: 'cho rằng', alignment: { kind: 'inferred' } });
  expect(result[0].alignment?.evidence).toContain('stable grammar/frame match');
  expect(result[1].alignment?.kind).toBe('unresolved');
  expect(alignBilingualSenses(candidates, [{ ...source[0], glosses: ['nghĩ'] }], anchor)[0].alignment?.kind).toBe('unresolved');
});

it('preserves one-to-many meanings and does not merge English senses sharing VI', () => {
  const source = [{ id: 'levels', lemma: 'level', pos: 'noun', glosses: ['trình độ', 'bình diện'], source: 'dictionary' }];
  const anchor = (lemma: string): LexicalEntry => ({ lemma, pos: ['noun'], senses: [], meaningsVi: source[0].glosses });
  const result = alignBilingualSenses([{ id: 'level', pos: 'noun', definitionEn: 'sphere degree' }], source, anchor);
  expect(result[0].meaningsVi).toEqual(['trình độ', 'bình diện']);
  const shared = alignBilingualSenses([{ id: 'a', pos: 'verb', definitionEn: 'believe', meaningVi: 'nghĩ' },
    { id: 'b', pos: 'verb', definitionEn: 'reflect', meaningVi: 'nghĩ' }], [], anchor);
  expect(shared.map(sense => sense.id)).toEqual(['a', 'b']);
});

it('rejects mismatching anchor POS and grammar-only alignment', () => {
  const sense: LexicalSense = { id: 'consider', pos: 'verb', definitionEn: 'believe suppose', verbFrames: [26] };
  const source = [{ id: 'vi', lemma: 'consider', pos: 'verb', glosses: ['cho rằng'], verbFrames: [26], source: 'dictionary' }];
  expect(alignBilingualSenses([sense], source, word => ({ lemma: word, pos: ['noun'], senses: [], meaningsVi: ['cho rằng'] }))[0].alignment?.kind).toBe('unresolved');
  expect(alignBilingualSenses([sense], source, () => undefined)[0].alignment?.kind).toBe('unresolved');
});

it('allows distinct frame-supported senses to share VI and rejects preposition conflicts', () => {
  const anchor = (lemma: string): LexicalEntry => ({ lemma, pos: ['verb'], senses: [], meaningsVi: ['suy nghĩ'] });
  const candidates: LexicalSense[] = [
    { id: 'clause', pos: 'verb', definitionEn: 'reflect ponder', verbFrames: [26] },
    { id: 'gerund', pos: 'verb', definitionEn: 'reflect ponder', verbFrames: [33] }
  ];
  const source = [26, 33].map(frame => ({ id: String(frame), lemma: 'think', pos: 'verb', glosses: ['suy nghĩ'], verbFrames: [frame], source: 'dictionary' }));
  expect(alignBilingualSenses(candidates, source, anchor).map(sense => sense.meaningVi)).toEqual(['suy nghĩ', 'suy nghĩ']);
  const mismatch = alignBilingualSenses([{ ...candidates[0], verbFrames: [15], grammarPatterns: [{ complement: 'prepositional', preposition: 'about' }] }],
    [{ ...source[0], verbFrames: [15], grammarPatterns: [{ complement: 'prepositional', preposition: 'of' }] }], anchor);
  expect(mismatch[0].alignment?.kind).toBe('unresolved');
});

it('separates plane noun/tool/action and capital meanings using lexical anchors', () => {
  const rows = [
    ['aircraft airplane', 'máy bay', 'noun'], ['geometry surface', 'mặt phẳng', 'noun'],
    ['tool implement', 'cái bào', 'noun'], ['smooth flatten', 'làm bằng phẳng', 'verb'],
    ['finance money', 'nguồn vốn', 'noun'], ['city metropolis', 'thủ đô', 'noun']
  ];
  const candidates = rows.map(([definitionEn, , pos], i) => ({ id: String(i), definitionEn, pos }));
  const source = rows.map(([, gloss, pos], i) => ({ id: `vi:${i}`, lemma: i < 4 ? 'plane' : 'capital', pos, glosses: [gloss], source: 'dictionary' }));
  const anchor = (lemma: string): LexicalEntry | undefined => {
    const row = rows.find(([definition]) => definition.split(' ').includes(lemma));
    return row ? { lemma, pos: [row[2]], senses: [], meaningsVi: [row[1]] } : undefined;
  };
  expect(alignBilingualSenses(candidates, source, anchor).map(sense => sense.meaningVi)).toEqual(rows.map(row => row[1]));
  expect(alignBilingualSenses(candidates, [...source].reverse(), anchor).map(sense => sense.meaningVi)).toEqual(rows.map(row => row[1]));
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
