import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { loadBundledDictionary } from './dictionary/packs';
import { loadWordNet } from '../core/language/wordnet';
import { LookupService } from './service';
import { defaultEngineSettings } from '../settings/engines';
import type { LookupRequest } from './types';
import { dictionaryRegistry } from './dictionary/registry';

interface AuditCase { surface: string; lemma: string; meaningVi?: string; definitionEn?: string; sentence?: string; expected: 'usable' | 'fragment' }
interface PackEntry { lemma: string; meaningsVi: string[]; definitionEn: string }
const required: AuditCase[] = [
  { surface: 'counterargument', lemma: 'counterargument', definitionEn: 'argument', meaningVi: 'lập luận phản biện', expected: 'usable' },
  { surface: 'counterarguments', lemma: 'counterargument', definitionEn: 'argument', meaningVi: 'lập luận phản biện', expected: 'usable' },
  { surface: 'lowest-common-denominator', lemma: 'common denominator', definitionEn: 'common', expected: 'usable' },
  { surface: 'lowest-commondenominator', lemma: 'common denominator', definitionEn: 'common', expected: 'usable' },
  { surface: 'lowest common denominator', lemma: 'common denominator', definitionEn: 'common', expected: 'usable' },
  { surface: 'summarizing', lemma: 'summarize', meaningVi: 'Tóm tắt', expected: 'usable' },
  { surface: 'indicated', lemma: 'indicate', expected: 'usable' }, { surface: 'delivered', lemma: 'deliver', expected: 'usable' },
  { surface: 'attended', lemma: 'attend', expected: 'usable' }, { surface: 'attempted', lemma: 'attempt', expected: 'usable' },
  { surface: 'maintaining', lemma: 'maintain', expected: 'usable' }, { surface: 'constraints', lemma: 'constraint', expected: 'usable' },
  { surface: 'institutional constraints', lemma: 'institutional constraints', meaningVi: 'hạn chế', expected: 'usable' },
  { surface: 'account for', lemma: 'account for', meaningVi: 'nguyên nhân', sentence: 'Several factors account for the decline.', expected: 'usable' },
  { surface: "make up one's mind", lemma: "make up one's mind", definitionEn: 'decision', expected: 'usable' },
  { surface: 'marizing', lemma: 'marizing', expected: 'fragment' }
];
const makeRequest = (item: AuditCase): LookupRequest => ({ selection: item.surface, selection_type: item.surface.includes(' ') ? 'phrase' : 'word',
  sentence: item.sentence ?? `The selected expression is ${item.surface}.`, previous_sentence: null, next_sentence: null, language_mode: 'bilingual',
  learner: { native_language: 'vi', english_level: 'B2' }, options: { include_ipa: true, include_contrast: true, include_grammar: true, include_sentence_translation: false } });
const enabled = process.env.RUN_DICTIONARY_AUDIT === '1';

(enabled ? it : it.skip)('audits 800 local entries through the production lookup pipeline', async () => {
  const pack = JSON.parse(readFileSync('release/dictionary/context-lens-en-vi-2026.09.1.json', 'utf8')) as { entries: PackEntry[] };
  const external = process.env.DICTIONARY_AUDIT_INPUT
    ? readFileSync(process.env.DICTIONARY_AUDIT_INPUT, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as AuditCase) : [];
  const usable = pack.entries.filter(entry => entry.lemma && entry.meaningsVi[0] && /^[a-z'-]+$/.test(entry.lemma)
    && !/(?:ed|ing|ies|s)$/.test(entry.lemma) && !/^(?:số nhiều|dạng|quá khứ|plural|past|present)\b/i.test(entry.meaningsVi[0])
    && dictionaryRegistry.lookup(entry.lemma)?.entry.lemma === entry.lemma);
  const count = Math.max(0, 800 - required.length - external.length);
  const step = usable.length / Math.max(1, count);
  const sampled: AuditCase[] = Array.from({ length: count }, (_, index) => usable[Math.floor(index * step)]).map(entry => ({
    surface: entry.lemma, lemma: entry.lemma, meaningVi: entry.meaningsVi[0], definitionEn: entry.definitionEn || undefined, expected: 'usable'
  }));
  const corpus = [...required, ...external, ...sampled].slice(0, 1000);
  const service = new LookupService();
  const rows = [];
  for (const item of corpus) {
    const result = await service.quick(makeRequest(item), { ...defaultEngineSettings, quickEngine: 'offline' });
    const textEn = result.quick.definition_en.toLocaleLowerCase();
    const textVi = result.quick.meaning_vi.join(' ').toLocaleLowerCase();
    const correctLemma = result.selection.lemma === item.lemma;
    const correctMeaning = (!item.definitionEn || textEn.includes(item.definitionEn.toLocaleLowerCase())) && (!item.meaningVi || textVi.includes(item.meaningVi.toLocaleLowerCase()));
    const fragment = result.lens?.selection.status === 'fragment-or-unknown';
    rows.push({ input: item.surface, lemma: result.selection.lemma, expectedLemma: item.lemma, correctLemma, correctMeaning, fragment, usable: Boolean(result.quick.definition_en || result.quick.meaning_vi.length) });
  }
  const passed = rows.filter((row, index) => corpus[index].expected === 'fragment' ? row.fragment : row.usable && row.correctLemma && row.correctMeaning).length;
  const failures = rows.filter((row, index) => corpus[index].expected === 'fragment' ? !row.fragment : !(row.usable && row.correctLemma && row.correctMeaning));
  const report = { total: rows.length, passed, accuracy: passed / rows.length, failures: failures.slice(0, 50) };
  process.stdout.write(`DICTIONARY_AUDIT_JSON ${JSON.stringify(report)}\n`);
  expect(report.total).toBeGreaterThanOrEqual(500);
  expect(report.accuracy).toBeGreaterThanOrEqual(0.99);
}, 120_000);

beforeAll(async () => {
  if (!enabled) return;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const wordnet = url.match(/wordnet-(noun|verb|adj|adv)/)?.[1];
    const path = wordnet ? `release/wordnet/wordnet-${wordnet}.json`
      : url.includes('wiktionary') ? 'release/dictionary/context-lens-wiktionary-en-vi-reviewed-2026.09.2.json'
        : 'release/dictionary/context-lens-en-vi-2026.09.1.json';
    return new Response(readFileSync(path, 'utf8'));
  }));
  await Promise.all([loadWordNet(), loadBundledDictionary()]);
}, 30_000);
afterAll(() => { if (enabled) vi.unstubAllGlobals(); });
