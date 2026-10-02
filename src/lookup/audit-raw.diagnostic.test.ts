/**
 * Phase 1 raw metric reproduction for the dictionary-coverage audit.
 *
 * Read-only probe. It replicates the *exact* semantics of
 * src/lookup/dictionary-coverage.audit.test.ts (same corpus construction, same
 * usable filter, same expectation of meaningsVi[0], same exact-substring
 * comparison, same settings) and only adds what the raw metric must preserve:
 * the un-capped failure list and the per-occurrence evidence.
 *
 * The original audit file is never modified and stays independently reproducible.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { afterAll, beforeAll, it, vi } from 'vitest';
import { loadBundledDictionary } from './dictionary/packs';
import { loadWordNet, wordNetVersion } from '../core/language/wordnet';
import { LookupService } from './service';
import { defaultEngineSettings } from '../settings/engines';
import type { LookupRequest } from './types';
import { dictionaryRegistry } from './dictionary/registry';

interface AuditCase {
  surface: string;
  lemma: string;
  meaningVi?: string;
  definitionEn?: string;
  sentence?: string;
  expected: 'usable' | 'fragment' | 'unknown';
}
interface PackEntry {
  lemma: string;
  meaningsVi: string[];
  definitionEn: string;
  viSenses?: [number, string, number, string?][];
}

const PACK = 'release/dictionary/context-lens-en-vi-2026.09.3.json';

const required: AuditCase[] = [
  { surface: 'counterargument', lemma: 'counterargument', definitionEn: 'argument', meaningVi: 'lập luận phản biện', expected: 'usable' },
  { surface: 'counterarguments', lemma: 'counterargument', definitionEn: 'argument', meaningVi: 'lập luận phản biện', expected: 'usable' },
  { surface: 'lowest-common-denominator', lemma: 'common denominator', definitionEn: 'common', expected: 'usable' },
  { surface: 'lowest-commondenominator', lemma: 'common denominator', definitionEn: 'common', expected: 'usable' },
  { surface: 'lowest common denominator', lemma: 'common denominator', definitionEn: 'common', expected: 'usable' },
  { surface: 'summarizing', lemma: 'summarize', meaningVi: 'Tóm tắt', expected: 'usable' },
  { surface: 'indicated', lemma: 'indicate', expected: 'usable' },
  { surface: 'delivered', lemma: 'deliver', expected: 'usable' },
  { surface: 'attended', lemma: 'attend', expected: 'usable' },
  { surface: 'attempted', lemma: 'attempt', expected: 'usable' },
  { surface: 'maintaining', lemma: 'maintain', expected: 'usable' },
  { surface: 'constraints', lemma: 'constraint', expected: 'usable' },
  { surface: 'institutional constraints', lemma: 'institutional constraints', meaningVi: 'hạn chế', expected: 'usable' },
  { surface: 'account for', lemma: 'account for', meaningVi: 'nguyên nhân', sentence: 'Several factors account for the decline.', expected: 'usable' },
  { surface: "make up one's mind", lemma: "make up one's mind", definitionEn: 'decision', expected: 'usable' },
  { surface: 'marizing', lemma: 'marizing', sentence: 'We are summarizing and resummarizing the same paragraph.', expected: 'fragment' },
  { surface: 'marizing', lemma: 'marizing', expected: 'unknown' }
];

/** Identical to the production audit: a contentless synthetic copula frame. */
const makeRequest = (item: AuditCase): LookupRequest => ({
  selection: item.surface,
  selection_type: item.surface.includes(' ') ? 'phrase' : 'word',
  sentence: item.sentence ?? `The selected expression is ${item.surface}.`,
  previous_sentence: null,
  next_sentence: null,
  language_mode: 'bilingual',
  learner: { native_language: 'vi', english_level: 'B2' },
  options: { include_ipa: true, include_contrast: true, include_grammar: true, include_sentence_translation: false }
});

const enabled = process.env.RUN_AUDIT_RAW === '1';

(enabled ? it : it.skip)('reproduces the raw dictionary-coverage metric without truncation', async () => {
  const packFile = JSON.parse(readFileSync(PACK, 'utf8')) as {
    entries: PackEntry[];
    packVersion: string;
    version: number;
    id: string;
  };
  const external = process.env.DICTIONARY_AUDIT_INPUT
    ? readFileSync(process.env.DICTIONARY_AUDIT_INPUT, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line => JSON.parse(line) as AuditCase)
    : [];

  // Byte-for-byte the same usable filter as the production audit.
  const usable = packFile.entries.filter(
    entry =>
      entry.lemma &&
      entry.meaningsVi[0] &&
      /^[a-z'-]+$/.test(entry.lemma) &&
      !/(?:ed|ing|ies|s)$/.test(entry.lemma) &&
      !/^(?:số nhiều|dạng|quá khứ|plural|past|present)\b/i.test(entry.meaningsVi[0]) &&
      dictionaryRegistry.lookup(entry.lemma)?.entry.lemma === entry.lemma
  );
  const count = Math.max(0, 800 - required.length - external.length);
  const step = usable.length / Math.max(1, count);
  const sampled: AuditCase[] = Array.from({ length: count }, (_, index) => usable[Math.floor(index * step)]).map(entry => ({
    surface: entry.lemma,
    lemma: entry.lemma,
    meaningVi: entry.meaningsVi[0],
    definitionEn: entry.definitionEn || undefined,
    expected: 'usable' as const
  }));
  const corpus = [...required, ...external, ...sampled].slice(0, 1000);
  const packByLemma = new Map(packFile.entries.map(entry => [entry.lemma, entry]));

  const service = new LookupService();
  const occurrences: Array<Record<string, unknown>> = [];
  for (const item of corpus) {
    const result = await service.quick(makeRequest(item), { ...defaultEngineSettings, quickEngine: 'offline' });
    const textEn = result.quick.definition_en.toLocaleLowerCase();
    const textVi = result.quick.meaning_vi.join(' ').toLocaleLowerCase();
    const correctLemma = result.selection.lemma === item.lemma;
    const defOk = !item.definitionEn || textEn.includes(item.definitionEn.toLocaleLowerCase());
    const viOk = !item.meaningVi || textVi.includes(item.meaningVi.toLocaleLowerCase());
    const correctMeaning = defOk && viOk;
    const fragment = result.lens?.selection.status === 'fragment';
    const usableRow = Boolean(result.quick.definition_en || result.quick.meaning_vi.length);
    const passed =
      item.expected === 'fragment'
        ? Boolean(fragment)
        : item.expected === 'unknown'
          ? !fragment && !usableRow
          : usableRow && correctLemma && correctMeaning;

    const packEntry = packByLemma.get(item.lemma);
    const wantVi = item.meaningVi ?? packEntry?.meaningsVi[0] ?? '';
    occurrences.push({
      input: item.surface,
      expectedKind: item.expected,
      sentence: item.sentence ?? `The selected expression is ${item.surface}.`,
      expectedLemma: item.lemma,
      lemma: result.selection.lemma,
      correctLemma,
      defOk,
      viOk,
      correctMeaning,
      fragment: Boolean(fragment),
      usable: usableRow,
      pass: Boolean(passed),
      // Raw metric fields, verbatim from the response.
      wantEn: item.definitionEn ?? packEntry?.definitionEn ?? '',
      wantVi,
      gotEn: result.quick.definition_en,
      gotVi: result.quick.meaning_vi,
      // Extra evidence retained for Phase 3/4 (does not affect the raw pass/fail).
      wantViIdxInPack: packEntry ? packEntry.meaningsVi.indexOf(wantVi) : -1,
      packMeaningsVi: packEntry?.meaningsVi ?? [],
      packViSenses: packEntry?.viSenses ?? [],
      lensStatus: result.lens?.selection.status ?? null,
      lensSenseId: result.lens?.sense?.id ?? result.dictionary?.senses?.find(s => s.contextMatch)?.id ?? null,
      lensSenseAligned: result.lens?.vietnamese?.senseAligned ?? null,
      lensMeaning: result.lens?.vietnamese?.meaning ?? null,
      senseAlternatives: result.lens?.sense?.alternatives ?? [],
      senseReasons: result.lens?.sense?.reasons ?? [],
      senseStatus: result.dictionary?.senseStatus ?? null,
      senseConfidence: result.dictionary?.senseConfidence ?? null,
      posConfidence: result.dictionary?.partOfSpeechConfidence ?? null,
      candidateSenses: (result.dictionary?.senses ?? []).map(sense => ({
        id: sense.id,
        pos: sense.pos,
        definitionEn: sense.definitionEn,
        meaningsVi: sense.meaningsVi,
        alignment: (sense.alignment ?? null) as unknown,
        pairingState: sense.pairingState,
        contextScore: sense.contextScore,
        contextMatch: sense.contextMatch
      })),
      unpairedMeaningsVi: result.dictionary?.unpairedMeaningsVi ?? [],
      vietnameseReferences: result.dictionary?.vietnameseReferences ?? []
    });
  }

  const passed = occurrences.filter(o => o.pass).length;
  const failures = occurrences.filter(o => !o.pass);
  const report = {
    kind: 'raw',
    generatedAt: new Date().toISOString(),
    metric: 'immutable raw metric of src/lookup/dictionary-coverage.audit.test.ts',
    config: {
      sourceAuditFile: 'src/lookup/dictionary-coverage.audit.test.ts',
      quickEngine: 'offline',
      settings: 'defaultEngineSettings',
      expectedMeaning: 'entry.meaningsVi[0]',
      comparison: 'lowercased exact substring (textEn/textVi joined by " ")',
      truncation: 'none (original audit truncates the report at failures.slice(0, 50))',
      externalInput: process.env.DICTIONARY_AUDIT_INPUT ?? null
    },
    versions: {
      packFile: PACK,
      packId: packFile.id,
      packVersion: packFile.packVersion,
      packSchemaVersion: packFile.version,
      wordnet: wordNetVersion(),
      registry: dictionaryRegistry.versions()
    },
    corpus: {
      total: occurrences.length,
      required: required.length,
      external: external.length,
      sampled: sampled.length,
      usablePackEntries: usable.length
    },
    total: occurrences.length,
    passed,
    accuracy: passed / occurrences.length,
    failing: failures.length,
    // Un-capped: the production audit reports at most 50 of these.
    productionReportFailureCount: Math.min(50, failures.length),
    failures: failures.map(o => o.input),
    occurrences
  };

  mkdirSync('tmp', { recursive: true });
  writeFileSync('tmp/audit-raw.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`AUDIT_RAW_JSON {"total":${report.total},"passed":${report.passed},"failing":${report.failing}}\n`);
}, 300_000);

beforeAll(async () => {
  if (!enabled) return;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const wordnet = url.match(/wordnet-(noun|verb|adj|adv)/)?.[1];
    const path = wordnet
      ? `release/wordnet/wordnet-${wordnet}.json`
      : url.includes('wiktionary')
        ? 'release/dictionary/context-lens-wiktionary-en-vi-reviewed-2026.09.2.json'
        : PACK;
    return new Response(readFileSync(path, 'utf8'));
  }));
  await Promise.all([loadWordNet(), loadBundledDictionary()]);
}, 30_000);

afterAll(() => {
  if (enabled) vi.unstubAllGlobals();
});