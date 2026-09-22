import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { loadBundledDictionary } from './packs';
import { dictionaryRegistry } from './registry';
import { localLookup } from '../localDictionary';
import { validLookup } from '../../test/fixtures';

afterEach(() => vi.unstubAllGlobals());

it('loads the released dictionary once and resolves happened without network access', async () => {
  const source = readFileSync('release/dictionary/context-lens-en-vi-2026.09.1.json', 'utf8');
  const reviewed = readFileSync('release/dictionary/context-lens-wiktionary-en-vi-reviewed-2026.09.2.json', 'utf8');
  const fetchMock = vi.fn(async (url: string) => new Response(url.includes('wiktionary') ? reviewed : source));
  vi.stubGlobal('fetch', fetchMock);
  await Promise.all([loadBundledDictionary(), loadBundledDictionary()]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Offline')));
  await loadBundledDictionary();
  expect(dictionaryRegistry.lookup('happened')?.entry.lemma).toBe('happen');
  expect(dictionaryRegistry.lookup('happened')?.entry.meaningsVi.length).toBeGreaterThan(0);
  const result = localLookup({ selection: 'happened', selection_type: 'word', sentence: validLookup.context.sentence,
    previous_sentence: null, next_sentence: null, language_mode: 'en', learner: { native_language: 'vi', english_level: 'B2-C1' },
    options: { include_ipa: true, include_contrast: true, include_grammar: true, include_sentence_translation: true } });
  expect(result.quick.definition_en).toBe('');
  expect(result.quick.meaning_vi.length).toBeGreaterThan(0);
  expect(dictionaryRegistry.lookup('maintain')?.entry.definitionEn).toContain('keep');
  expect(dictionaryRegistry.lookup('counterargument')?.entry.meaningsVi).toContain('lập luận phản biện');
});

it('resolves bundled morphology to the base lexical meaning', async () => {
  const source = readFileSync('release/dictionary/context-lens-en-vi-2026.09.1.json', 'utf8');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(source)));
  await loadBundledDictionary();
  for (const [surface, lemma] of [['indicated', 'indicate'], ['delivered', 'deliver'], ['studied', 'study'], ['interested', 'interest'], ['tired', 'tire'], ['went', 'go']]) {
    const match = dictionaryRegistry.lookup(surface);
    expect(match?.entry.lemma).toBe(lemma);
    expect(match?.morphology?.baseLemma).toBe(lemma);
    expect(match?.entry.meaningsVi.some(meaning => !/quá khứ|phân từ/i.test(meaning))).toBe(true);
  }
});

it.each([
  ['abated', 'abate'], ['abducted', 'abduct'], ['allowed', 'allow'], ['attended', 'attend']
])('repairs missed or low-quality redirect %s -> %s', async (surface, lemma) => {
  const source = readFileSync('release/dictionary/context-lens-en-vi-2026.09.1.json', 'utf8');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(source)));
  await loadBundledDictionary();
  const match = dictionaryRegistry.lookup(surface);
  expect(match?.entry.lemma).toBe(lemma);
  expect(match?.morphology?.baseLemma).toBe(lemma);
});
