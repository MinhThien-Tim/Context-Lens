/**
 * Phase 2 + Phase 3 corrected measurement for the dictionary-coverage audit.
 *
 * This file is a SEPARATE audit path. It never modifies, wraps or replaces
 * src/lookup/dictionary-coverage.audit.test.ts, the dictionary pack, the
 * resolver, the alignment code or any product data. It re-measures the identical
 * corpus under six explicit corrections and writes its own artefact next to the
 * immutable raw one.
 *
 * C1  `Xem <target>` cross-reference stubs are excluded from usable expected
 *     meanings; the production-dereferenced gloss is used instead.
 * C2  case normalization (NFC + lowercase vi + whitespace collapse).
 * C3  terminal punctuation normalization.
 * C4  every usable `meaningsVi` of the entry is an acceptable expectation and
 *     every gloss of the SELECTED sense is acceptable evidence, compared at the
 *     fragment granularity production actually uses.
 * C5  whole-lemma fallback is detected structurally and is never treated as
 *     evidence that the selected sense carries usable VI.
 * C6  raw and corrected results are preserved per occurrence.
 *
 * Outputs: tmp/audit-corrected.json, tmp/audit-summary.json
 * Env:    RUN_AUDIT_CORRECTED=1
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { afterAll, beforeAll, it, vi } from 'vitest';
import { loadBundledDictionary } from './dictionary/packs';
import { loadWordNet, wordNetVersion } from '../core/language/wordnet';
import { LookupService } from './service';
import { defaultEngineSettings } from '../settings/engines';
import type { LookupRequest } from './types';
import { dictionaryRegistry } from './dictionary/registry';

interface AuditCase { surface: string; lemma: string; meaningVi?: string; definitionEn?: string; sentence?: string; expected: 'usable' | 'fragment' | 'unknown' }
interface PackEntry { lemma: string; meaningsVi: string[]; definitionEn: string }

const PACK = 'release/dictionary/context-lens-en-vi-2026.09.3.json';
const XEM_STUB = /^Xem ([a-z][a-z' -]*)\.?$/i;

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
  { surface: 'marizing', lemma: 'marizing', sentence: 'We are summarizing and resummarizing the same paragraph.', expected: 'fragment' },
  { surface: 'marizing', lemma: 'marizing', expected: 'unknown' }
];

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

/** C2 + C3, mirroring production `normalizeMeaning` plus terminal-punctuation trimming. */
const normalize = (value: string) =>
  value.normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g, ' ')
    .replace(/^[\s.,;:!?]+/, '').replace(/[\s.,;:!?]+$/, '').trim();

/** C4 fragment granularity: union of alignment.ts `[,;\/]` and sense-meanings.ts `/ ; ·`. */
const FRAGMENT_SPLIT = /\s*(?:[,;\/]|·)\s*/;
const fragmentsOf = (value: string) => value.split(FRAGMENT_SPLIT).map(normalize).filter(Boolean);

/** C1: a `Xem <target>` stub is never a usable expected meaning on its own. */
const isXemStub = (value: string) => XEM_STUB.test(value.trim());

type ValidityLabel = 'FALLBACK_PASS' | 'MEASUREMENT_PASS' | 'VALID_SENSE_PASS' | 'VALID_ALTERNATIVE_GLOSS_PASS';
type ViEvidence = 'sense-gloss' | 'fallback' | 'vacuous' | 'none';

interface GlossMatch { ok: boolean; mode: 'exact-gloss' | 'gloss-contained' | 'fragment-overlap' | 'supported-subset' | 'none' }

/**
 * C4. Does `candidates` (acceptable glosses) validate `evidence` (glosses actually
 * attributable to the returned meaning), at production fragment granularity?
 */
function matchGlosses(evidence: string[], candidates: string[]): GlossMatch {
  const evNorm = evidence.map(normalize).filter(Boolean);
  const evFrags = [...new Set(evidence.flatMap(fragmentsOf))];
  const candNorm = candidates.map(normalize).filter(Boolean);
  const candFrags = [...new Set(candidates.flatMap(fragmentsOf))];
  if (!candNorm.length) return { ok: false, mode: 'none' };
  if (evNorm.some(e => candNorm.includes(e))) return { ok: true, mode: 'exact-gloss' };
  if (evNorm.some(e => candNorm.some(c => c.includes(e)))) return { ok: true, mode: 'gloss-contained' };
  if (candFrags.some(f => evFrags.includes(f))) return { ok: true, mode: 'fragment-overlap' };
  if (evFrags.length > 0 && evFrags.every(f => candFrags.includes(f))) return { ok: true, mode: 'supported-subset' };
  return { ok: false, mode: 'none' };
}

const enabled = process.env.RUN_AUDIT_CORRECTED === '1';

(enabled ? it : it.skip)('re-measures the audit corpus under the corrected comparison', async () => {
  const pack = JSON.parse(readFileSync(PACK, 'utf8')) as { entries: PackEntry[]; packVersion?: string; version?: number; id?: string };
  const external = process.env.DICTIONARY_AUDIT_INPUT
    ? readFileSync(process.env.DICTIONARY_AUDIT_INPUT, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as AuditCase)
    : [];

  // Raw corpus construction is byte-identical to the production audit.
  const usable = pack.entries.filter(entry => entry.lemma && entry.lemma && entry.meaningsVi[0] && /^[a-z'-]+$/.test(entry.lemma)
    && !/(?:ed|ing|ies|s)$/.test(entry.lemma) && !/^(?:số nhiều|dạng|quá khứ|plural|past|present)\b/i.test(entry.meaningsVi[0])
    && dictionaryRegistry.lookup(entry.lemma)?.entry.lemma === entry.lemma);
  const count = Math.max(0, 800 - required.length - external.length);
  const step = usable.length / Math.max(1, count);
  const sampled: AuditCase[] = Array.from({ length: count }, (_, index) => usable[Math.floor(index * step)]).map(entry => ({
    surface: entry.lemma, lemma: entry.lemma, meaningVi: entry.meaningsVi[0], definitionEn: entry.definitionEn || undefined, expected: 'usable' as const
  }));
  const corpus = [...required, ...external, ...sampled].slice(0, 1000);
  const packByLemma = new Map(pack.entries.map(entry => [entry.lemma, entry]));

  const service = new LookupService();
  const occurrences: Array<Record<string, unknown>> = [];

  for (const item of corpus) {
    const result = await service.quick(makeRequest(item), { ...defaultEngineSettings, quickEngine: 'offline' });
    const packEntry = packByLemma.get(item.lemma);
    const sentence = item.sentence ?? `The selected expression is ${item.surface}.`;

    // ---------- expectations ------------------------------------------------
    // Raw expectation is EXACTLY what the production audit uses: `item.meaningVi`,
    // absent for required cases that do not declare one.
    const rawWantVi = item.meaningVi;
    // C1: the production registry entry is the dereferenced view of the pack.
    const resolvedMeanings = dictionaryRegistry.lookup(item.lemma)?.entry?.meaningsVi ?? packEntry?.meaningsVi ?? [];
    const rawWantIsStub = rawWantVi ? isXemStub(rawWantVi) : false;
    const expectedUsable = resolvedMeanings.filter(v => v.trim() && !isXemStub(v));
    const usableExpectation = expectedUsable.length > 0;
    const correctedWantVi = expectedUsable[0] ?? '';

    // ---------- returned ----------------------------------------------------
    const gotEn = result.quick.definition_en;
    const gotVi = result.quick.meaning_vi;
    const lensSenseAligned = result.lens?.vietnamese?.senseAligned ?? null;
    const senses = result.dictionary?.senses ?? [];
    const selectedId = result.lens?.sense?.id ?? null;
    const selected = senses.find(s => s.id === selectedId) ?? null;
    const selectedGlosses = selected?.meaningsVi ?? [];
    const selectedHasUsableVi = selectedGlosses.some(g => g.trim());

    // C5 (structural): local-language-engine sets senseAligned:false and emits the
    // entry's full meaningsVi list when the selected sense contributes no VI;
    // service.applyLocalResult then keeps base.quick (the whole-lemma list).
    const gotMatchesWholeLemma = normalize(gotVi.join(' / ')) === normalize(resolvedMeanings.join(' / '));
    const fallbackReturn = gotVi.length > 0 && !selectedHasUsableVi && (lensSenseAligned === false || gotMatchesWholeLemma);

    // ---------- RAW comparison (semantics untouched) ------------------------
    const textEn = gotEn.toLocaleLowerCase();
    const textVi = gotVi.join(' ').toLocaleLowerCase();
    const rawCorrectLemma = result.selection.lemma === item.lemma;
    const rawDefOk = !item.definitionEn || textEn.includes(item.definitionEn.toLocaleLowerCase());
    const rawViOk = !rawWantVi || textVi.includes(rawWantVi.toLocaleLowerCase());
    const rawCorrectMeaning = rawDefOk && rawViOk;
    const rawFragment = result.lens?.selection.status === 'fragment';
    const rawUsable = Boolean(gotEn || gotVi.length);
    const rawPass = item.expected === 'fragment' ? Boolean(rawFragment)
      : item.expected === 'unknown' ? !rawFragment && !rawUsable
      : rawUsable && rawCorrectLemma && rawCorrectMeaning;

    // ---------- CORRECTED comparison ---------------------------------------
    const defOkCorrected = !item.definitionEn ? true : normalize(gotEn).includes(normalize(item.definitionEn));
    // Evidence attributable to the SELECTED SENSE (C4 + C5).
    const senseMatch = matchGlosses(selectedGlosses, expectedUsable);
    // Evidence actually returned, attributed to fallback when that is its origin.
    const returnedMatch = matchGlosses(gotVi, expectedUsable);

    let viEvidence: ViEvidence = 'none';
    if (!usableExpectation) viEvidence = 'vacuous';
    else if (selectedHasUsableVi && senseMatch.ok) viEvidence = 'sense-gloss';
    else if (fallbackReturn && returnedMatch.ok) viEvidence = 'fallback';

        // C5: whole-lemma fallback is NOT acceptable VI evidence. The fallback list is
        // the entry's own meaningsVi, so it contains the expectation by construction —
        // accepting it would make the check tautological. Only a matching gloss bound
        // to the selected sense proves selected-sense VI.
        const viOkCorrected = viEvidence === 'sense-gloss' || viEvidence === 'vacuous';
    const correctedCorrectMeaning = defOkCorrected && viOkCorrected;
    const correctedFragment = result.lens?.selection.status === 'fragment';
    const correctedUsable = Boolean(gotEn || gotVi.length);
    const correctedCorrectLemma = result.selection.lemma === item.lemma;
    const correctedPass = item.expected === 'fragment' ? Boolean(correctedFragment)
      : item.expected === 'unknown' ? !correctedFragment && !correctedUsable
      : correctedUsable && correctedCorrectLemma && correctedCorrectMeaning;

    // ---------- C6 + Phase 3: exactly one validity label per passing occurrence
    const factors: string[] = [];
    if (fallbackReturn) factors.push('meaning_vi came from whole-lemma fallback (selected sense has no usable VI)');
    if (rawWantIsStub) factors.push('raw expectation was an unresolved `Xem <target>` stub');
    if (expectedUsable.some(m => normalize(m) !== m.toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim())) factors.push('case/terminal-punctuation normalization changed the expectation');
    if (expectedUsable.length > 1) factors.push(`pass validated against one of ${expectedUsable.length} usable entry glosses`);
    if (senseMatch.mode === 'fragment-overlap') factors.push('matched on a shared gloss fragment, not a whole gloss');
    if (senseMatch.mode === 'supported-subset') factors.push('selected sense carries a supported subset of the multi-fragment expectation');
    if (!rawPass && correctedPass) factors.push('only the corrected comparison passes this occurrence');
    if (rawPass && !correctedPass) factors.push('raw comparison passes but the corrected one does not');
    if (selectedGlosses.length > 0 && selected?.pairingState === 'missing') factors.push('selected sense is marked pairingState=missing');
    if (viEvidence === 'vacuous') factors.push('no usable VI expectation exists for this entry');

    let validityLabel: ValidityLabel | null = null;
    if (rawPass || correctedPass) {
      if (viEvidence === 'fallback') validityLabel = 'FALLBACK_PASS';
      else if (!rawPass && correctedPass) validityLabel = 'MEASUREMENT_PASS';
      else if (rawCorrectMeaning && viEvidence === 'sense-gloss') validityLabel = 'VALID_SENSE_PASS';
      else if (viEvidence === 'sense-gloss') validityLabel = 'VALID_ALTERNATIVE_GLOSS_PASS';
      else validityLabel = 'FALLBACK_PASS';
    }
        // FALLBACK_PASS is the highest-precedence label, so it applies to every
        // occurrence whose meaning_vi came from the whole-lemma fallback, whether or
        // not the raw comparison happened to pass it.
        const fallbackBacked = viEvidence === 'fallback' || (Boolean(rawWantVi) && fallbackReturn && rawPass);
        if (fallbackBacked) validityLabel = 'FALLBACK_PASS';

    const marginReason = (result.lens?.sense?.reasons ?? []).find(r => r.startsWith('Semantic margin')) ?? null;
    occurrences.push({
      input: item.surface,
      expectedKind: item.expected,
      sentence,
      expectedLemma: item.lemma,
      lemma: result.selection.lemma,
      correctLemma: correctedCorrectLemma,
      rawWantVi: rawWantVi ?? null,
      rawWantIsStub: rawWantIsStub,
      entryMeanings: resolvedMeanings,
      usableExpectations: expectedUsable,
      correctedWantVi,
      usableExpectation,
      gotEn,
      gotVi,
      selectedSenseId: selectedId,
      selectedPos: selected?.pos ?? null,
      selectedGlosses,
      selectedPairingState: selected?.pairingState ?? null,
      selectedHasUsableVi,
      selectedContextScore: selected?.contextScore ?? null,
      selectedContextMatch: selected?.contextMatch ?? null,
      selectedAlignmentKind: selected?.alignment?.kind ?? null,
      selectedAlignmentEvidence: selected?.alignment?.evidence ?? [],
      lensSenseAligned,
      fallbackReturn,
      senseStatus: result.dictionary?.senseStatus ?? null,
      senseConfidence: result.dictionary?.senseConfidence ?? null,
      semanticMarginReason: marginReason,
      senseReasons: result.lens?.sense?.reasons ?? [],
      senseAlternatives: result.lens?.sense?.alternatives ?? [],
      candidateCount: senses.length,
      candidatePosSet: [...new Set(senses.map(s => s.pos ?? 'unknown'))],
      candidateSenses: senses.map(s => ({ id: s.id, pos: s.pos, definitionEn: s.definitionEn, meaningsVi: s.meaningsVi, alignmentKind: s.alignment?.kind ?? null, pairingState: s.pairingState ?? null, contextScore: s.contextScore, contextMatch: s.contextMatch })),
      unpairedMeaningsVi: result.dictionary?.unpairedMeaningsVi ?? [],
      raw: { pass: Boolean(rawPass), defOk: rawDefOk, viOk: rawViOk, correctMeaning: rawCorrectMeaning, correctLemma: rawCorrectLemma, fragment: Boolean(rawFragment), usable: rawUsable },
      corrected: { pass: correctedPass, defOk: defOkCorrected, viOk: viOkCorrected, correctMeaning: correctedCorrectMeaning, correctLemma: correctedCorrectLemma, fragment: correctedFragment, usable: correctedUsable, matchMode: senseMatch.ok ? senseMatch.mode : returnedMatch.ok ? `fallback-${returnedMatch.mode}` : usableExpectation ? 'none' : 'no-expectation' },
      viEvidence,
      validityLabel,
      contributingFactors: factors
    });
  }

  const rawPassCount = occurrences.filter(o => (o.raw as { pass: boolean }).pass).length;
  const correctedPassCount = occurrences.filter(o => (o.corrected as { pass: boolean }).pass).length;
  const rawFailures = occurrences.filter(o => !(o.raw as { pass: boolean }).pass);
  const correctedFailures = occurrences.filter(o => !(o.corrected as { pass: boolean }).pass);
  const labelCounts: Record<string, number> = { FALLBACK_PASS: 0, MEASUREMENT_PASS: 0, VALID_SENSE_PASS: 0, VALID_ALTERNATIVE_GLOSS_PASS: 0 };
  const evidenceCounts: Record<string, number> = { 'sense-gloss': 0, fallback: 0, vacuous: 0, none: 0 };
  for (const o of occurrences) {
    if (o.validityLabel) labelCounts[o.validityLabel as string] += 1;
    evidenceCounts[o.viEvidence as string] += 1;
  }

  const report = {
    kind: 'corrected',
    generatedAt: new Date().toISOString(),
    metric: 'corrected measurement, separate from src/lookup/dictionary-coverage.audit.test.ts',
    corrections: {
      C1: '`Xem <target>` stubs excluded from usable expected meanings; production-dereferenced glosses used',
      C2: 'case normalization (NFC + lowercase vi + whitespace collapse)',
      C3: 'terminal punctuation normalization',
      C4: 'all usable meaningsVi of the entry are acceptable expectations; all glosses of the selected sense are evidence; compared at production fragment granularity',
      C5: 'whole-lemma fallback detected structurally and never counted as selected-sense VI evidence',
      C6: 'raw and corrected results preserved per occurrence'
    },
    versions: { packFile: PACK, packId: pack.id ?? null, packVersion: pack.packVersion ?? null, packSchemaVersion: pack.version ?? null, wordnet: wordNetVersion(), registry: dictionaryRegistry.versions() },
    config: { quickEngine: 'offline', settings: 'defaultEngineSettings', externalInput: process.env.DICTIONARY_AUDIT_INPUT ?? null },
    total: occurrences.length,
    rawPassed: rawPassCount,
    rawFailing: rawFailures.length,
    correctedPassed: correctedPassCount,
    correctedFailing: correctedFailures.length,
    validityLabelCounts: labelCounts,
    viEvidenceCounts: evidenceCounts,
    rawFailures: rawFailures.map(o => o.input),
    correctedFailures: correctedFailures.map(o => o.input),
    occurrences
  };

  mkdirSync('tmp', { recursive: true });
  writeFileSync('tmp/audit-corrected.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync('tmp/audit-summary.json', `${JSON.stringify({ total: report.total, rawPassed: rawPassCount, rawFailing: rawFailures.length, correctedPassed: correctedPassCount, correctedFailing: correctedFailures.length, validityLabelCounts: labelCounts, viEvidenceCounts: evidenceCounts, versions: report.versions, generatedAt: report.generatedAt }, null, 2)}\n`, 'utf8');
  process.stdout.write(`AUDIT_CORRECTED_JSON ${JSON.stringify({ total: report.total, rawPassed: rawPassCount, rawFailing: rawFailures.length, correctedPassed: correctedPassCount, correctedFailing: correctedFailures.length, validityLabelCounts: labelCounts, viEvidenceCounts: evidenceCounts })}\n`);
}, 300_000);

beforeAll(async () => {
  if (!enabled) return;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const wordnet = url.match(/wordnet-(noun|verb|adj|adv)/)?.[1];
    const path = wordnet ? `release/wordnet/wordnet-${wordnet}.json`
      : url.includes('wiktionary') ? 'release/dictionary/context-lens-wiktionary-en-vi-reviewed-2026.09.2.json'
      : PACK;
    return new Response(readFileSync(path, 'utf8'));
  }));
  await Promise.all([loadWordNet(), loadBundledDictionary()]);
}, 30_000);

afterAll(() => {
  if (enabled) vi.unstubAllGlobals();
});