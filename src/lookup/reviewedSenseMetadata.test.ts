import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { loadWordNet } from '../core/language/wordnet';
import { loadBundledDictionary } from './dictionary/packs';
import { LexicalEngine } from '../core/language/lexicon';
import { LocalLanguageEngine } from '../core/language/local-language-engine';
import { SenseResolver } from '../core/language/sense-resolver';
import { applyReviewedLinks, enrichReviewedSenses } from './reviewedSenseMetadata';
import type { LexicalSense } from '../core/language/types';
import overlay from '../../release/dictionary/context-lens-sense-metadata-reviewed.json';

let assetFetch: ReturnType<typeof vi.fn>;
beforeAll(async () => {
  assetFetch = vi.fn(async (url: string) => {
    const wordnet = url.match(/wordnet-(noun|verb|adj|adv)/)?.[1];
    const path = wordnet ? `release/wordnet/wordnet-${wordnet}.json`
      : url.includes('wiktionary') ? 'release/dictionary/context-lens-wiktionary-en-vi-reviewed-2026.09.2.json'
        : 'release/dictionary/context-lens-en-vi-2026.09.3.json';
    return new Response(readFileSync(path, 'utf8'));
  });
  vi.stubGlobal('fetch', assetFetch);
  await Promise.all([loadWordNet(), loadBundledDictionary()]);
}, 20_000);
afterAll(() => vi.unstubAllGlobals());

it('merges reviewed deltas by stable ID, with source IDs and no new lexical senses or requests', () => {
  const before = assetFetch.mock.calls.length;
  const lexical = new LexicalEngine();
  for (const lemma of ['think', 'run', 'mean', 'consider', 'take', 'hold']) {
    const entry = lexical.lookup(lemma);
    expect(entry?.senses.some(sense => sense.id.startsWith('wn3:'))).toBe(true);
  }
  const run = lexical.lookup('run')!;
  expect(run.senses.find(sense => sense.id === 'wn3:v:02443849')).toMatchObject({
    definitionEn: 'direct or control; projects, businesses, etc.',
    collocations: expect.arrayContaining(['run a relief operation']),
    meaningsVi: ['Chỉ huy, điều khiển, quản lý, trông nom.'],
    alignment: { kind: 'reviewed', confidence: 'high', evidence: expect.arrayContaining(['bundled.context-lens.skypedia.en-vi:run:300494']) }
  });
  expect(run.senses.find(sense => sense.id === 'wn3:v:01926311')?.alignment?.kind).toBe('unresolved');
  expect(assetFetch.mock.calls.length).toBe(before);
});

it('preserves explicit data and refuses missing or wrong-POS source links', () => {
  const explicit: LexicalSense = { id: 'wn3:v:02443849', definitionEn: 'direct or control', source: 'wordnet', pos: 'verb', meaningVi: 'explicit', alignment: { kind: 'explicit', confidence: 'high', evidence: ['source'] } };
  const source = { id: 'bundled.context-lens.skypedia.en-vi:run:300494', lemma: 'run', pos: 'verb', glosses: ['quản lý'], source: 'bundled.context-lens.skypedia.en-vi' };
  expect(applyReviewedLinks('run', [explicit], [source])[0]).toEqual(explicit);
  const plain = { ...explicit, meaningVi: undefined, alignment: undefined };
  expect(applyReviewedLinks('run', [plain], [])[0]).toEqual(plain);
  expect(applyReviewedLinks('run', [plain], [{ ...source, pos: 'noun' }])[0]).toEqual(plain);
  expect(enrichReviewedSenses('run', [plain])).toHaveLength(1);
});

it('resolves every shipped reviewed source ID and preserves all other meanings', () => {
  const lexical = new LexicalEngine();
  const linkedIds = new Set<string>();
  for (const [lemma, entry] of Object.entries(overlay.entries)) {
    const result = lexical.lookup(lemma)!;
    for (const [id, delta] of Object.entries(entry.senses)) {
      const sense = result.senses.find(item => item.id === id);
      expect(sense, `${lemma} ${id}`).toBeDefined();
      if ('viSenseIds' in delta) {
        expect(sense?.alignment?.kind, `${lemma} ${id}`).toBe('reviewed');
        for (const sourceId of delta.viSenseIds) {
          expect(linkedIds.has(sourceId), `${lemma} ${id} reused VI source ID ${sourceId}`).toBe(false);
          linkedIds.add(sourceId);
          expect(sense?.alignment?.evidence).toContain(`bundled.context-lens.skypedia.en-vi:${lemma}:${sourceId}`);
        }
      }
    }
    expect(result.senses.filter(sense => sense.source === 'wordnet').length).toBeGreaterThanOrEqual(Object.keys(entry.senses).length);
  }
});

it('does not treat a collocation shared by two meanings as unique evidence', () => {
  const result = new SenseResolver().resolve({ selection: 'zorp', lemma: 'zorp', sentence: 'They zorp a widget.',
    candidateSenses: [
      { id: 'one', pos: 'verb', definitionEn: 'to fasten mechanically', collocations: ['zorp a widget'] },
      { id: 'two', pos: 'verb', definitionEn: 'to decorate artistically', collocations: ['zorp a widget'] }
    ] });
  expect(result).toMatchObject({ contextMatch: false, status: 'ambiguous' });
});

it('keeps the six difficult pilot lemmas and checks discriminative and unresolved contexts', async () => {
  const engine = new LocalLanguageEngine();
  const cases = [
    ['think', 'I think highly of her.', 'context'],
    ['think', 'Think about the consequences.', 'context'],
    ['run', 'She is running a relief operation in the Sudan.', 'context'],
    ['run', 'She will run a company.', 'context'],
    ['mean', 'I only meant to help you.', 'context'],
    ['consider', 'I consider her to be shallow.', 'context'],
    ['consider', 'I consider doing the work.', 'ambiguous'],
    ['consider', 'I consider her foolish.', 'ambiguous'],
    ['take', 'I take sugar in my coffee.', 'ambiguous'],
    ['hold', 'Hold your breath.', 'context'],
    ['pitch', 'They pitch a tent.', 'context'],
    ['flight', 'It was a flight of fancy.', 'context'],
    ['run', 'The machine will run on fuel.', 'ambiguous'],
    ['mean', 'I mean doing the work now.', 'ambiguous']
  ] as const;
  for (const [lemma, sentence, status] of cases) {
    const selected = sentence.match(new RegExp(`\\b${lemma}(?:ning|t)?\\b`, 'i'))?.[0] ?? lemma;
    const result = await engine.analyzeSelection({ selectedText: selected, sentence, selectionStart: sentence.toLowerCase().indexOf(selected.toLowerCase()), sourceLang: 'en', targetLang: 'vi' });
    expect(result.selection.lemma).toBe(lemma);
    expect(result.dictionary?.senseStatus, sentence).toBe(status);
    if (sentence.includes('relief operation')) expect(result.sense?.reasons).toContain('Collocation: run a relief operation');
    if (sentence.includes('meant to help')) expect(result.sense?.reasons).toContain('Collocation: mean to help');
    if (sentence.includes('pitch a tent')) expect(result.sense?.reasons).toContain('Collocation: pitch a tent');
  }
}, 40_000);
