#!/usr/bin/env node
// FREEZE STEP 3 — occurrence sampling.
//
// Samples real occurrences from the FROZEN Project Gutenberg corpus for the roster
// lemmas, emits data/occurrences/occurrences.jsonl and dataset-manifest.json.
//
// SCOPE: read-only with respect to the product. This script touches nothing under
// src/, release/dictionary/, or any alignment/resolver data. It only reads the
// frozen corpus artefacts and writes the occurrence dataset.
//
// Amendments implemented (roster v2 / SOURCE.md v2, recorded BEFORE sampling):
//   1. auditExpected is never used as gold; goldSense/goldPos stay empty until T0b.
//   2. POS is NEVER derived from the product pipeline. Occurrence POS is a
//      self-contained surface heuristic; Stratum C strata come from the WordNet 3.0
//      release files directly, never from the pack's resolver POS codes.
//   3. resolver_seen excludes ONLY on a full example-sentence match; anchor /
//      collocation / verb-frame substring overlap is marked, never excluded.
//   4. Fixed seed, deterministic order, ONE run then freeze. A per-lemma rejection
//      funnel is emitted. Per-POS cap 60%, per-author cap, near-duplicate dedupe.
//   5. The pre-declared secondary tier (1900-1930) rescues a lemma ONLY when the
//      primary tier yields < 5 occurrences; occurrences are tagged sourceTier.
//   6. Multi-synset controls; `counterargument` retained as a reported shortage.
//      Stratum C = stratified random sample of the full inventory (n and CI reported).
//   7. Paragraph boundaries preserved; line-unwrapping is a documented normalisation.
//      Per-document sha256 + retrieval date are carried on every occurrence.
//   8. resolver-seen-index.json is never committed; the manifest hashes the JSONL.
//   9. No files are deleted. No C3/C4 classification is performed here.
//
// Usage:
//   node scripts/build_occurrence_dataset.mjs --selftest   # helper assertions only
//   node scripts/build_occurrence_dataset.mjs              # THE one frozen run

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const OUT_DIR = 'data/occurrences';
const CACHE_DIR = 'tmp/corpus-cache';
const SELFTEST = process.argv.includes('--selftest');

// --- Frozen sampling rule (amendment 4) -------------------------------------
const SAMPLING_RULE_VERSION = '3.0.0';
const SEED = 0x5eed_1eaf;
const TARGET_PER_LEMMA = 10;     // target where the corpus allows it
const MIN_PER_LEMMA = 5;         // acceptance floor for a diagnostic lemma
const MAX_PER_AUTHOR = 2;        // amendment 4: per-author cap
const POS_CAP_RATIO = 0.6;       // amendment 4: no single POS above ~60%
const NEAR_DUP_THRESHOLD = 0.85; // amendment 4: near-duplicate sentence dedupe
const STRATUM_C_N = 200;         // amendment 6: inventory sample size
const STRATUM_C_MAX_PER_LEMMA = 3;
const RESOLVER_FULL_MATCH_MIN_LEN = 20; // amendment 3, documented in SOURCE.md §6
const RESOLVER_ANCHOR_MIN_LEN = 12;
const RAW_CANDIDATE_CAP = 3000;  // per-lemma bound on stored raw candidates
const SENT_MIN_WORDS = 6;
const SENT_MAX_WORDS = 45;
const CONTEXT_MAX_CHARS = 600;

const sha256 = (s) => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

/** xorshift32 — deterministic, seeded, no platform dependence. */
function makeRng(seed) {
  let s = seed >>> 0;
  if (s === 0) s = 0x9e3779b9;
  return function rng() {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x1_0000_0000;
  };
}

/** Deterministic in-place Fisher-Yates using the seeded PRNG. */
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

const norm = (s) =>
  s.toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\p{L}\p{N}\s'"]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// --- Sentence handling over paragraphs (amendment 7) ------------------------

/**
 * AMENDMENT 7 NORMALISATION: Project Gutenberg hard-wraps lines at ~72 columns.
 * Unwrapping is applied WITHIN a paragraph only; paragraph boundaries (blank
 * lines) are preserved exactly, so no sentence can span two paragraphs.
 */
function toParagraphs(body) {
  return body
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n+/)
    .map(p => p.replace(/[ \t]*\n[ \t]*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim())
    .filter(p => p.length > 0);
}

    /**
     * AMENDMENT 7 (context): `context` must be a window AROUND the annotated sentence.
     *
     * A paragraph PREFIX (para.slice(0, CONTEXT_MAX_CHARS)) silently omits the very
     * sentence it annotates whenever the paragraph carries more leading text than the
     * cap. In the frozen 543-row run that happened for 188 rows (34.6%) — exactly the
     * contextual-specificity evidence T1 Phase 5, T3, T4 and T5 read this field for.
     * The window below is centred on the sentence, clamped to the paragraph, and the
     * sentence is always present in full (a sentence longer than the cap is returned
     * whole, because truncating it would be worse than exceeding the cap).
     */
    function contextWindow(para, sentenceStart, sentence) {
      const sentenceEnd = sentenceStart + sentence.length;
      const span = Math.max(CONTEXT_MAX_CHARS, sentence.length);
      let start = sentenceStart - Math.floor((span - sentence.length) / 2);
      start = Math.max(0, Math.min(start, para.length - span));
      let end = Math.min(para.length, start + span);
      if (end - start < CONTEXT_MAX_CHARS) start = Math.max(0, end - CONTEXT_MAX_CHARS);
      if (start > sentenceStart) start = sentenceStart;
      if (end < sentenceEnd) end = sentenceEnd;
      let win = para.slice(start, end);

      // Belt and braces: the splitter trims the sentence, so its true offset can drift
      // a few characters past `sentenceStart`. Re-anchor if containment is not exact.
      if (!win.includes(sentence)) {
        const at = para.indexOf(sentence, Math.max(0, sentenceStart - 2));
        if (at >= 0) {
          const s = Math.max(0, at - Math.floor((CONTEXT_MAX_CHARS - sentence.length) / 2));
          win = para.slice(s, Math.min(para.length, s + CONTEXT_MAX_CHARS));
          if (!win.includes(sentence)) {
            win = para.slice(Math.max(0, at - 40), Math.min(para.length, at + sentence.length + 40));
          }
        }
      }
      return win;
    }

const ABBREV = new Set(('mr mrs ms dr prof st jr sr vs etc no vol fig ill e.g i.e cf al ca approx '
  + 'dept univ gen col capt lt sgt maj adm rev hon messrs').split(' '));

/** Abbreviation-aware sentence splitter over a single paragraph. */
function splitSentences(para) {
  const out = [];
  let start = 0;
  for (let i = 0; i < para.length; i++) {
    const ch = para[i];
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;
    // Absorb runs of terminators and closing quotes/brackets.
    let j = i;
    while (j + 1 < para.length && /[.!?]/.test(para[j + 1])) j++;
    let k = j + 1;
    while (k < para.length && /["')\]]/.test(para[k])) k++;
    if (k < para.length && !/\s/.test(para[k])) continue;
    if (ch === '.') {
      const before = para.slice(Math.max(0, i - 12), i);
      const lastWord = (before.match(/([A-Za-z]+)$/) || [])[1];
      if (lastWord && ABBREV.has(lastWord.toLowerCase())) continue;
      if (/\d$/.test(before.trim())) continue;            // decimal / initial
      if (/\b[A-Z]\.$/.test(before)) continue;           // single initial
    }
    const text = para.slice(start, k).trim();
    if (text) out.push({ text, start });
    start = k;
    i = k - 1;
  }
  const tail = para.slice(start).trim();
  if (tail) out.push({ text: tail, start });
  return out;
}

// --- POS heuristic (amendment 2: NOT the product pipeline) ------------------

const DET = new Set(('a an the this that these those his her their its our my your no every some any '
  + 'each both all another other such few many much most more several either neither').split(' '));
const ADJ_PREV = new Set(('good great fine bad dark bright dim faint pale chief main whole single common '
  + 'true real false full empty cold hot deep wide small large new old young happy sad brilliant splendid '
  + 'lovely bright quiet wild heavy light').split(' '));
const PREP = new Set(('of in on at by for with from to into onto upon about against among through during '
  + 'without within toward towards over under above below across behind beyond before after between').split(' '));
// Personal and human pronouns only: "one of", "which", "who" are NOT subject cues.
const PRON = new Set(('he she it they we i you himself herself itself themselves ourselves yourself '
  + 'someone anyone everyone nobody somebody everybody people men women children').split(' '));
const COPULA = new Set(('is are was were be been being am seems seem seemed became become becomes became '
  + 'felt feel looks looked remained remain remains appeared appear grew grow turned turn').split(' '));
const ADV_PREV = new Set(('very quite too rather really so more most extremely fairly somewhat barely hardly nearly').split(' '));
// Words ending in "ly" that are not adverbs.
const LY_STOP = new Set(('only family early reply apply supply rally ally july ugly silly jelly belly bully '
  + 'fully assembly multiply italy holy melancholy monopoly likely').split(' '));

const NOUN_SUFFIX = /(?:tion|sion|ment|ness|ity|ance|ence|ship|hood|ism|ist|logy|ure|age|dom|ancy|ency)$/;
// Adjective-forming suffixes. Deliberately checked BEFORE the generic DET=>noun
// fallback so "a sporty car" / "the lucent glow" classify as adjectives rather than
// being swallowed as nouns. `-ent` is required for `lucent`; `-y` for `sporty`, `airy`.
const ADJ_SUFFIX = /(?:ous|ful|ive|able|ible|ical|ic|ish|less|ary|ent|ant|y)$/;
const VERB_PREP = new Set('to with from by for through against without upon into onto'.split(' '));
// Participles of the few roster lemmas whose inflection is irregular. Needed because
// `withdrew` / `withdrawn` carry no -ed/-ing signal at all.
const IRREGULAR_PARTICIPLE = new Set('withdrew withdrawn'.split(' '));

/**
 * Classify the POS of a surface span from surface context only.
 * Returns { pos, confidence } or null when the evidence is insufficient.
 * This is an UNVERIFIED estimate: `goldPos` stays empty until T0b adjudication.
 */
function heuristicPos(prev, next, token) {
  const t = token.toLowerCase();
  const ends = (...sfx) => sfx.some(s => t.endsWith(s));

  if (IRREGULAR_PARTICIPLE.has(t)) return { pos: 'verb', confidence: 'high' };
  if (ends('ly') && !LY_STOP.has(t)) {
    return { pos: 'adverb', confidence: 'high' };
  }
  if (ends('ed', 'ing')) {
    if (prev === null || PRON.has(prev) || DET.has(prev) || PREP.has(prev) || ADV_PREV.has(prev)) {
      return { pos: 'verb', confidence: 'high' };
    }
  }
  if (next !== null && DET.has(next) && !ends('ing')) {
    return { pos: 'adjective', confidence: 'high' };
  }
  if (prev !== null && (COPULA.has(prev) || ADV_PREV.has(prev))) {
    if (!ends('ed', 'ing')) return { pos: 'adjective', confidence: 'high' };
  }
  if (prev !== null && DET.has(prev) && ADJ_SUFFIX.test(t)) {
    return { pos: 'adjective', confidence: 'medium' };
  }
  if (prev !== null && PRON.has(prev)) {
    return { pos: 'verb', confidence: 'high' };
  }
  if (prev !== null && (DET.has(prev) || PREP.has(prev) || ADJ_PREV.has(prev))) {
    return { pos: 'noun', confidence: 'high' };
  }
  if (NOUN_SUFFIX.test(t)) return { pos: 'noun', confidence: 'medium' };
  if (ends('s') && prev !== null && VERB_PREP.has(prev)) return { pos: 'verb', confidence: 'medium' };
  if (ADJ_SUFFIX.test(t) && prev !== null && ADJ_PREV.has(prev)) {
    return { pos: 'adjective', confidence: 'low' };
  }
  return null;
}

const WORD_RE = /[A-Za-z][A-Za-z'’-]*/g;

/** Tokenise into {text, start, end} preserving offsets. */
function tokenize(sentence) {
  const out = [];
  WORD_RE.lastIndex = 0;
  let m;
  while ((m = WORD_RE.exec(sentence)) !== null) {
    out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

// Irregular surface forms for roster lemmas whose inflection a suffix rule misses.
// Applied on top of the regular rules so inflected real usages stay reachable.
const IRREGULAR_FORMS = {
  withdraw: ['withdrew', 'withdrawn', 'withdrawing', 'withdraws', 'withdrawal'],
  light: ['lit', 'lights', 'lighting', 'lightly', 'lighted', 'lighter', 'lightness', 'lightsome'],
  attempt: ['attempted', 'attempting', 'attempts'],
  array: ['arrayed', 'arraying', 'arrays'],
  ape: ['aped', 'aping', 'apes'],
  world: ['worlds', 'worldly'],
  account: ['accounted', 'accounting', 'accounts', 'accountable'],
  counterargument: ['counterarguments'],
};

/** Plain English regular inflection for a single (non-helper) word. */
function regularInflections(base) {
  const last = base.slice(-1);
  const prevChar = base.slice(-2, -1);
  const stem = base.replace(/e$/, '');
  const out = [];
  const add = (f) => { if (f && f !== base) out.push(f); };
  if (last === 'y' && !/[aeiou]/.test(prevChar)) {
    const c = base.slice(0, -1);
    add(`${c}ies`); add(`${c}ied`); add(`${c}ying`);
  } else if (/(?:s|x|z|ch|sh)$/.test(base)) {
    add(`${base}es`); add(`${stem}ed`); add(`${base}ing`);
  } else {
    add(`${base}s`); add(`${stem}ed`); add(`${base}ing`);
  }
  return out;
}

/**
 * Candidate surface forms for a lemma so inflected real usages are reachable.
 * Generative on purpose: the POS filter and the exact span match downstream
 * discard anything that does not occur in real text, so over-generation is safe
 * while under-generation would silently shrink the candidate pool.
 * A multiword lemma (`account for`) keeps only the bigram.
 */
function surfaceForms(lemma, extraVariants = []) {
  const base = lemma.toLowerCase();
  const forms = new Set([base, ...extraVariants.map(v => String(v).toLowerCase())]);
  if (base.includes(' ')) return [...forms];
  for (const f of regularInflections(base)) forms.add(f);
  for (const f of IRREGULAR_FORMS[base] ?? []) forms.add(f);
  return [...forms];
}

// --- Near-duplicate detection (amendment 4) ---------------------------------

function shingles(tokens, k = 4) {
  const t = tokens.map(x => x.toLowerCase()).filter(Boolean);
  if (t.length < k) return new Set([t.join(' ')]);
  const out = new Set();
  for (let i = 0; i + k <= t.length; i++) out.add(t.slice(i, i + k).join(' '));
  return out;
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * NEAR_DUP_RUN_TOKENS — contiguous-run duplicate detection.
 *
 * Jaccard over 4-gram shingles is length-sensitive: changing one interior word of a
 * 20-word sentence invalidates 4 shingles and drops Jaccard to ~0.62, far below a
 * 0.85 threshold, so a Jaccard-only dedupe is effectively inert on real corpus
 * sentences and would let a lightly-edited repeat count as an independent
 * occurrence. This signal catches the actual failure mode directly: any shared
 * contiguous run of NEAR_DUP_RUN_TOKENS identical tokens is a copy, however much
 * else differs around it. It is O(n) against a precomputed set of accepted runs.
 */
const NEAR_DUP_RUN_TOKENS = 8;

function contiguousRuns(tokens, k = NEAR_DUP_RUN_TOKENS) {
  const t = tokens.map(x => x.toLowerCase()).filter(Boolean);
  const out = new Set();
  if (t.length < k) return out;
  for (let i = 0; i + k <= t.length; i++) out.add(t.slice(i, i + k).join(' '));
  return out;
}

// --- WordNet-backed Stratum C strata (amendment 2 + 6) ----------------------

const WN_POS_FILES = {
  noun: 'release/wordnet/wordnet-noun.json',
  verb: 'release/wordnet/wordnet-verb.json',
  adjective: 'release/wordnet/wordnet-adj.json',
  adverb: 'release/wordnet/wordnet-adv.json',
};

function loadWordnetPos() {
  const byLemma = new Map();
  for (const [pos, file] of Object.entries(WN_POS_FILES)) {
    if (!existsSync(file)) continue;
    const wn = JSON.parse(readFileSync(file, 'utf8'));
    for (const [lemma, indices] of Object.entries(wn.entries ?? {})) {
      if (lemma === 'length') continue;
      const key = lemma.toLowerCase();
      if (!byLemma.has(key)) byLemma.set(key, { pos: new Map(), synsets: 0 });
      const rec = byLemma.get(key);
      rec.pos.set(pos, indices.length);
      rec.synsets += indices.length;
    }
  }
  return byLemma;
}

// ==========================================================================
// Self-test: pure helpers only. No corpus is read, nothing is sampled.
// ==========================================================================
function selftest() {
  let failures = 0;
  const ok = (name, cond, extra = '') => {
    if (cond) console.log(`  ok   ${name}`);
    else { console.log(`  FAIL ${name} ${extra}`); failures++; }
  };

  const paras = toParagraphs('First line one.\r\nsecond line.\r\n\r\n\r\nNew paragraph here.\r\n');
  ok('paragraphs preserve blank-line boundary', paras.length === 2, JSON.stringify(paras));
  ok('paragraph 0 unwraps lines', paras[0] === 'First line one. second line.', JSON.stringify(paras[0]));

  const sents = splitSentences('He left. Mr. Smith stayed! Did he? Yes.');
    ok('abbreviation not split', sents.length === 4, JSON.stringify(sents.map(s => s.text)));

  ok('pos: det + word = noun', heuristicPos('the', 'of', 'world').pos === 'noun');
  ok('pos: pron + next = verb', heuristicPos('he', null, 'withdrew').pos === 'verb');
  ok('pos: -ed after det = verb', heuristicPos('the', 'money', 'retired').pos === 'verb');
    ok('pos: copula complement', heuristicPos('is', 'that', 'lucent').pos === 'adjective');
  ok('pos: -ly adverb', heuristicPos('very', null, 'gaily').pos === 'adverb');
  ok('pos: ly-stop not adverb', heuristicPos('the', null, 'only') !== null
    && heuristicPos('the', null, 'only').pos !== 'adverb');
  ok('pos: uncertain returns null', heuristicPos(null, null, 'zzz') === null,
      JSON.stringify(heuristicPos(null, null, 'zzz')));

  const forms = surfaceForms('withdraw');
    ok('surfaces include irregular past', forms.includes('withdrew'), JSON.stringify(forms));
    ok('surfaces include irregular participle', forms.includes('withdrawn'), JSON.stringify(forms));
    ok('surfaces include -ing', forms.includes('withdrawing'), JSON.stringify(forms));
    ok('surfaces include -s', forms.includes('withdraws'), JSON.stringify(forms));
    ok('surfaces for y-verb', surfaceForms('carry').includes('carried'), JSON.stringify(surfaceForms('carry')));
    ok('surfaces no doubled consonant', !surfaceForms('withdraw').some(f => /ww/.test(f)), JSON.stringify(forms));
    ok('surfaces for silent-e verb', surfaceForms('world').includes('worlds'), JSON.stringify(surfaceForms('world')));
    ok('multiword lemma keeps bigram only', JSON.stringify(surfaceForms('account for')) === '["account for"]', JSON.stringify(surfaceForms('account for')));

    ok('pos: irregular past is verb', heuristicPos('he', null, 'withdrew').pos === 'verb');
    ok('pos: irregular participle is verb', heuristicPos('the', 'money', 'withdrawn').pos === 'verb');
    ok('pos: -ent after det is adjective', heuristicPos('a', null, 'lucent').pos === 'adjective', JSON.stringify(heuristicPos('a', null, 'lucent')));
    ok('pos: -y after det is adjective', heuristicPos('the', 'car', 'sporty').pos === 'adjective', JSON.stringify(heuristicPos('the', 'car', 'sporty')));

  const a = shingles('the quick brown fox jumps over the lazy dog today'.split(' '));
    const b = shingles('the quick brown fox jumps over the lazy dog tonight'.split(' '));
    ok('jaccard separates unrelated', jaccard(a, shingles('she walked slowly toward the river bank alone'.split(' '))) < 0.2);
    // The run signal is what actually catches a one-word edit on a long sentence,
    // which Jaccard alone misses.
    const long1 = 'he drew his sword and rode slowly toward the distant gates of the burning city'.split(' ');
    const long2 = 'he drew his sword and rode quickly toward the distant gates of the burning city'.split(' ');
    ok('run signal catches one-word edit', [...contiguousRuns(long1)].some(r => contiguousRuns(long2).has(r)));
    ok('run signal empty for unrelated', [...contiguousRuns(long1)].every(r => !contiguousRuns('she sold her eggs at the market on tuesday morning'.split(' ')).has(r)));
    ok('run signal empty for short sentence', contiguousRuns('he left the room'.split(' ')).size === 0);

  const r1 = makeRng(SEED), r2 = makeRng(SEED);
  ok('rng deterministic for same seed',
    Array.from({ length: 5 }, () => r1()).join() === Array.from({ length: 5 }, () => r2()).join());
  const shuffled = shuffle([1, 2, 3, 4, 5, 6, 7, 8], makeRng(SEED));
  ok('shuffle deterministic + permutes',
    shuffled.join() === shuffle([1, 2, 3, 4, 5, 6, 7, 8], makeRng(SEED)).join() && shuffled.join() !== '1,2,3,4,5,6,7,8');

  ok('norm strips punctuation', norm('The  "Lucent" sky!') === 'the "lucent" sky', JSON.stringify(norm('The  "Lucent" sky!')));

  // context must be a WINDOW around the sentence, never a paragraph prefix.
  const longPara = ('Filler sentence number one here. Filler two follows quietly. ').repeat(9)
    + 'The omen was unmistakable in every face. '
    + ('Trailing filler sentence keeps going on. ').repeat(9);
  const longSent = 'The omen was unmistakable in every face.';
  const at = longPara.indexOf(longSent);
  const win = contextWindow(longPara, at, longSent);
  ok('context window contains its own sentence', win.includes(longSent), JSON.stringify(win));
  ok('context window is centred, not a prefix',
    win.indexOf(longSent) > 0 && win !== longPara.slice(0, CONTEXT_MAX_CHARS), JSON.stringify(win));
  ok('context window respects the cap', win.length <= Math.max(CONTEXT_MAX_CHARS, longSent.length),
    String(win.length));
  ok('context window clamps at paragraph start',
    contextWindow('Short para.', 0, 'Short para.') === 'Short para.',
    JSON.stringify(contextWindow('Short para.', 0, 'Short para.')));
  ok('context window clamps at paragraph end',
    contextWindow('Short para.', 0, 'Short para.') === 'Short para.');
  // A sentence longer than the cap is returned whole rather than truncated.
  const huge = 'word '.repeat(300).trim();
  ok('context window never truncates its own sentence',
    contextWindow(huge, 0, huge).includes(huge));
  ok('context window re-anchors when the offset drifted',
    contextWindow('   ' + longSent + ' trailing', 3, longSent).includes(longSent),
    JSON.stringify(contextWindow('   ' + longSent + ' trailing', 3, longSent)));

  console.log(failures === 0 ? '\nselftest PASS' : `\nselftest FAIL (${failures})`);
  if (failures) process.exit(1);
}

if (SELFTEST) { selftest(); process.exit(0); }

// ==========================================================================
// The one frozen run
// ==========================================================================
const roster = JSON.parse(readFileSync(`${OUT_DIR}/roster.json`, 'utf8'));
const primaryManifest = JSON.parse(readFileSync(`${OUT_DIR}/corpus-manifest.json`, 'utf8'));
const secondaryManifest = JSON.parse(readFileSync(`${OUT_DIR}/corpus-manifest-secondary.json`, 'utf8'));
const seenRaw = JSON.parse(readFileSync(`${OUT_DIR}/resolver-seen-index.json`, 'utf8'));

// AMENDMENT 3: the index lives under `.index`; reading the top level would yield
// an empty map and silently disable independence checking.
const seenIndex = new Map(Object.entries(seenRaw.index ?? {}));

// --- Stratum C: deterministic stratified sample of the full inventory -------
const wnByLemma = loadWordnetPos();
const pack = JSON.parse(readFileSync('release/dictionary/context-lens-en-vi-2026.09.3.json', 'utf8'));
const inventory = [];
const seenLemma = new Set();
for (const entry of pack.entries) {
  const lemma = String(entry.lemma ?? '').toLowerCase();
  if (!lemma || seenLemma.has(lemma)) continue;
  seenLemma.add(lemma);
  const wn = wnByLemma.get(lemma);
  if (!wn || wn.synsets === 0) continue;
  let primary = null, best = -1;
  for (const [pos, n] of [...wn.pos.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (n > best) { best = n; primary = pos; }
  }
  const band = wn.synsets === 1 ? 'some' : wn.synsets <= 4 ? 'many' : 'lots';
  inventory.push({ lemma, pos: primary, synsets: wn.synsets, band });
}

const stratumCCells = new Map();
for (const item of inventory) {
  const key = `${item.pos}|${item.band}`;
  if (!stratumCCells.has(key)) stratumCCells.set(key, []);
  stratumCCells.get(key).push(item);
}
const stratumCRng = makeRng(SEED ^ 0x0000_c0de);
const cellList = [...stratumCCells.keys()].sort();
const cellSize = new Map(cellList.map(k => [k, stratumCCells.get(k).length]));
const inventoryN = inventory.length;
const rawQuota = cellList.map(k => (cellSize.get(k) / inventoryN) * STRATUM_C_N);
const cellQuota = rawQuota.map(v => Math.max(1, Math.floor(v)));
let assigned = cellQuota.reduce((a, b) => a + b, 0);
const remainderOrder = cellList
  .map((k, i) => ({ i, frac: rawQuota[i] - Math.floor(rawQuota[i]) }))
  .sort((a, b) => b.frac - a.frac || cellList[a.i].localeCompare(cellList[b.i]));
let ri = 0;
while (assigned > STRATUM_C_N && ri < remainderOrder.length) { cellQuota[remainderOrder[ri].i]--; assigned--; ri++; }
while (assigned < STRATUM_C_N && ri < remainderOrder.length) { cellQuota[remainderOrder[ri].i]++; assigned++; ri++; }

const stratumC = [];
const stratumCDesign = [];
for (let i = 0; i < cellList.length; i++) {
  const key = cellList[i];
  const members = shuffle(
    [...stratumCCells.get(key)].sort((a, b) => a.lemma.localeCompare(b.lemma)),
    stratumCRng,
  );
  const taken = members.slice(0, cellQuota[i]);
  stratumCDesign.push({ cell: key, cellPopulation: cellSize.get(key), quota: cellQuota[i], drawn: taken.length });
  stratumC.push(...taken);
}

// --- Build the scan target table --------------------------------------------
const rosterByLemma = new Map();
for (const l of roster.lemmas) if (l.stratum !== 'controlStratumC') rosterByLemma.set(l.lemma.toLowerCase(), l);

const stratumCLemmas = new Map();
for (const item of stratumC) {
  stratumCLemmas.set(item.lemma, {
    lemma: item.lemma, stratum: 'controlStratumC', pos: item.pos, band: item.band,
    synsets: item.synsets, allPos: [item.pos],
    auditExpected: 'binding-precision estimation', goldSense: '', goldPos: '',
  });
}

const surfaceTargets = new Map(); // lowercase surface -> [targetKey]
function addTarget(lemmaKey, target, variants) {
  for (const form of surfaceForms(lemmaKey, variants)) {
    const k = form.toLowerCase();
    if (!surfaceTargets.has(k)) surfaceTargets.set(k, []);
    surfaceTargets.get(k).push(target);
  }
}
for (const [key, l] of rosterByLemma) {
  addTarget(key, { kind: 'roster', lemma: l.lemma, stratum: l.stratum, key },
    (roster.surfaceVariants ?? {})[l.lemma] ?? []);
}
for (const [key, l] of stratumCLemmas) addTarget(key, { kind: 'stratumC', lemma: key, stratum: 'controlStratumC', key }, []);

// --- Load corpus bodies ------------------------------------------------------
function loadTier(manifest) {
  const docs = [];
  for (const d of manifest.documents) {
    const path = `${CACHE_DIR}/${d.id}.txt`;
    if (!existsSync(path)) continue;
    const raw = readFileSync(path, 'utf8');
    const m = raw.match(/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i);
    const e = raw.match(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i);
    if (!m) continue;
    const body = raw.slice(m.index + m[0].length, e ? e.index : raw.length)
      .replace(/^[\r\n]+/, '').replace(/[\s﻿]+$/, '');
    if (sha256(body) !== d.sha256) {
      throw new Error(`corpus hash drift for ${d.id} (${manifest.tier}); re-run build_occurrence_corpus.mjs`);
    }
    docs.push({ ...d, paragraphs: toParagraphs(body) });
  }
  return docs;
}

const primaryDocs = loadTier(primaryManifest);
const secondaryDocs = loadTier(secondaryManifest);
const tierWordCount = (docs) => docs.reduce((a, d) => a + d.words, 0);
const corpusDocsById = new Map();
for (const d of [...primaryDocs, ...secondaryDocs]) corpusDocsById.set(d.id, d);

// --- Single deterministic scan ----------------------------------------------
function scan(docs, targetKeys) {
  const raw = new Map();
  for (const k of targetKeys) raw.set(k, { rawHits: 0, docFreq: new Set(), docsCapped: false, list: [] });
  const wanted = new Map();
  for (const [surface, targets] of surfaceTargets) {
    for (const t of targets) if (targetKeys.has(t.key)) {
      if (!wanted.has(surface)) wanted.set(surface, []);
      wanted.get(surface).push(t);
    }
  }

  for (const doc of docs) {
      for (let pi = 0; pi < doc.paragraphs.length; pi++) {
      const para = doc.paragraphs[pi];
      for (const sent of splitSentences(para)) {
        const tokens = tokenize(sent.text);
        if (!tokens.length) continue;
        const lower = tokens.map(t => t.text.toLowerCase());
        for (let i = 0; i < tokens.length; i++) {
          const hits = [];
          const one = wanted.get(lower[i]);
          if (one) hits.push(...one);
          if (i + 1 < tokens.length) {
            const two = wanted.get(`${lower[i]} ${lower[i + 1]}`);
            if (two) hits.push(...two);
          }
          if (!hits.length) continue;
                    for (const t of hits) {
            const bucket = raw.get(t.key);
            bucket.rawHits++;
            bucket.docFreq.add(doc.id);
            if (bucket.list.length < RAW_CANDIDATE_CAP) {
              bucket.list.push({
                docId: doc.id, bucket: doc.bucket, title: doc.title, author: doc.author,
                docSha256: doc.sha256, retrievedAt: doc.retrievedAt,
                paragraphIndex: pi, sentence: sent.text, sentenceStart: sent.start,
                surface: lower[i] + (i + 1 < tokens.length && wanted.has(`${lower[i]} ${lower[i + 1]}`) ? ` ${lower[i + 1]}` : ''),
                spanStart: tokens[i].start, spanEnd: tokens[i].end,
              });
            } else bucket.docsCapped = true;
          }
        }
      }
    }
      }
      return raw;
    }

const rosterKeys = new Set(rosterByLemma.keys());
const stratumCKeys = new Set(stratumCLemmas.keys());
const primaryScan = scan(primaryDocs, rosterKeys);
const primaryWords = tierWordCount(primaryDocs);

// --- resolver_seen (amendment 3) --------------------------------------------
function resolverVerdict(lemmaKey, sentence) {
  const s = norm(sentence);
  const evidence = seenIndex.get(lemmaKey.toLowerCase()) ?? [];
  if (s.length >= RESOLVER_FULL_MATCH_MIN_LEN) {
    for (const e of evidence) {
      if (e === s) return { seen: true, matched: e };
      if (s.includes(e) && e.length >= RESOLVER_ANCHOR_MIN_LEN) {
        return { seen: 'anchor', matched: e };
      }
    }
  }
  return { seen: false, matched: null };
}

// --- Sampling one lemma from one tier --------------------------------------
function sampleLemma(target, scanBucket, corpusWords, tier, rng) {
  const funnel = {
    rawCandidates: scanBucket.list.length, rawHitsInCorpus: scanBucket.rawHits,
    candidateCapApplied: scanBucket.docsCapped,
    rejectedShortSentence: 0, rejectedResolverFullMatch: 0, rejectedPosUncertain: 0,
    rejectedPosNotInRoster: 0, rejectedNearDuplicate: 0, rejectedAuthorCap: 0,
        rejectedPerPosCap: 0, notExaminedAfterTarget: 0,
  };
  const collisions = [];
  const anchorMarked = [];
    let examined = 0;
  const accepted = [];
  const authorCount = new Map();
  const posCount = new Map();
  const acceptedShingles = [];
    const acceptedRuns = new Set();
    const acceptedNorm = new Set();

  const rosterLemma = rosterByLemma.get(target.key);
  const relevantPos = rosterLemma
    ? new Set([...(rosterLemma.allPos ?? []), rosterLemma.pos].filter(Boolean))
    : new Set(target.allPos ?? []);
  const multiPos = relevantPos.size > 1;

  const order = [...scanBucket.list].sort((a, b) =>
    (a.docId - b.docId) || (a.paragraphIndex - b.paragraphIndex) || (a.sentenceStart - b.sentenceStart));
  const queue = shuffle(order, rng);

  for (const cand of queue) {
      if (accepted.length >= TARGET_PER_LEMMA) break;
      examined++;
    const wordCount = cand.sentence.split(/\s+/).filter(Boolean).length;
    if (wordCount < SENT_MIN_WORDS || wordCount > SENT_MAX_WORDS) { funnel.rejectedShortSentence++; continue; }

    const verdict = resolverVerdict(target.key, cand.sentence);
    if (verdict.seen === true) {
      funnel.rejectedResolverFullMatch++;
      collisions.push({ docId: cand.docId, sentence: cand.sentence, matchedEvidence: verdict.matched });
      continue;
    }

    const tokens = tokenize(cand.sentence);
        let idx = -1;
        for (let i = 0; i < tokens.length; i++) {
          if (tokens[i].start === cand.spanStart) { idx = i; break; }
        }
        const tokenAt = idx >= 0 ? tokens[idx] : null;
        const prev = idx > 0 ? tokens[idx - 1].text.toLowerCase() : null;
    const next = idx >= 0 && idx + 1 < tokens.length ? tokens[idx + 1].text.toLowerCase() : null;
    const surfaceToken = tokenAt ? tokenAt.text : cand.surface.split(' ')[0];
        // A multiword span (`account for`) is a phrasal verb by construction: the
        // heuristic sees only its first token and would mis-read the noun `account`.
        // The roster declares such lemmas' POS by hand, which is a curation source and
        // still not the product pipeline, so it is recorded with its own posMethod.
        const isMultiword = target.lemma.toLowerCase().includes(' ');
        const posInfo = isMultiword
          ? { pos: rosterLemma?.pos ?? target.pos ?? 'verb', confidence: 'declared' }
          : heuristicPos(prev, next, surfaceToken);
        if (!posInfo) { funnel.rejectedPosUncertain++; continue; }
        if (relevantPos.size && !relevantPos.has(posInfo.pos)) { funnel.rejectedPosNotInRoster++; continue; }

    const nsent = norm(cand.sentence);
    if (acceptedNorm.has(nsent)) { funnel.rejectedNearDuplicate++; continue; }
    const sh = shingles(tokens.map(t => t.text));
    if (acceptedShingles.some(prevSh => jaccard(prevSh, sh) >= NEAR_DUP_THRESHOLD)) {
      funnel.rejectedNearDuplicate++; continue;
    }
        const runs = contiguousRuns(tokens.map(t => t.text));
        let sharedRun = null;
        for (const r of runs) {
          if (acceptedRuns.has(r)) { sharedRun = r; break; }
        }
        if (sharedRun !== null) { funnel.rejectedNearDuplicate++; continue; }

    const author = (cand.author || 'unknown').trim().toLowerCase();
    if ((authorCount.get(author) ?? 0) >= MAX_PER_AUTHOR) { funnel.rejectedAuthorCap++; continue; }

    if (multiPos) {
      // Amendment 4 caps a single POS at ~60% *of the target*, not of the running
      // count. Scaling by `accepted + 1` made the cap self-tightening: at
      // accepted=2 it yields allowed=2, so `posCount >= allowed` rejected every
      // later same-POS candidate and froze that POS at 2 for the whole lemma.
      const allowed = Math.max(1, Math.ceil(POS_CAP_RATIO * TARGET_PER_LEMMA));
      if ((posCount.get(posInfo.pos) ?? 0) >= allowed) { funnel.rejectedPerPosCap++; continue; }
    }

    acceptedNorm.add(nsent);
    acceptedShingles.push(sh);
        for (const r of runs) acceptedRuns.add(r);
    authorCount.set(author, (authorCount.get(author) ?? 0) + 1);
        posCount.set(posInfo.pos, (posCount.get(posInfo.pos) ?? 0) + 1);
    if (verdict.seen === 'anchor') anchorMarked.push({ docId: cand.docId, sentence: cand.sentence, matchedEvidence: verdict.matched });

    const para = corpusDocsById.get(cand.docId)?.paragraphs[cand.paragraphIndex] ?? '';
    accepted.push({
      lemma: target.lemma, stratum: target.stratum, sourceTier: tier,
      resolverSeen: verdict.seen,
      surface: cand.surface, pos: posInfo.pos, posConfidence: posInfo.confidence,
      posMethod: isMultiword
        ? 'roster-declared (multiword phrasal lemma; not the product pipeline)'
        : 'surface-heuristic-v1 (not the product pipeline)',
      goldSense: rosterLemma?.goldSense ?? '', goldPos: rosterLemma?.goldPos ?? '',
      auditExpected: rosterLemma?.auditExpected ?? 'binding-precision estimation',
      docId: cand.docId, bucket: cand.bucket, title: cand.title, author: cand.author,
      docSha256: cand.docSha256, retrievedAt: cand.retrievedAt,
      paragraphIndex: cand.paragraphIndex,
            context: contextWindow(para, cand.sentenceStart, cand.sentence),
            sentence: cand.sentence,
      frequency: {
        rawHitsInCorpus: scanBucket.rawHits,
        docFreq: scanBucket.docFreq.size,
        perMillionWords: scanBucket.rawHits === 0 ? 0 : +(scanBucket.rawHits / corpusWords * 1e6).toFixed(3),
      },
      samplingRuleVersion: SAMPLING_RULE_VERSION, seed: SEED,
    });
  }
  funnel.notExaminedAfterTarget = queue.length - examined;
  return { accepted, funnel, collisions, anchorMarked };
  }

  // --- Run: primary, then secondary rescue (amendment 5) ----------------------
const rngPrimary = makeRng(SEED);
const rngSecondary = makeRng(SEED ^ 0xabcd);
const perLemma = new Map();
const collisionsAll = [];
const anchorAll = [];

for (const key of [...rosterByLemma.keys()].sort()) {
  const lemma = rosterByLemma.get(key);
  const target = { kind: 'roster', lemma: lemma.lemma, stratum: lemma.stratum, key };
  const res = sampleLemma(target, primaryScan.get(key), primaryWords, 'primary', rngPrimary);
  perLemma.set(key, {
    lemma: lemma.lemma, stratum: lemma.stratum, pos: lemma.pos,
    allPos: lemma.allPos, synsets: lemma.synsets,
    auditExpected: lemma.auditExpected,
    primaryCount: res.accepted.length,
    primaryFunnel: res.funnel,
    occurrences: res.accepted,
    collisions: res.collisions,
    anchorMarked: res.anchorMarked,
  });
  collisionsAll.push(...res.collisions.map(c => ({ lemma: lemma.lemma, ...c })));
  anchorAll.push(...res.anchorMarked.map(a => ({ lemma: lemma.lemma, ...a })));
}

const shortfalls = [...perLemma.entries()].filter(([, v]) => v.primaryCount < MIN_PER_LEMMA);
const secondaryScanNeeded = new Set(shortfalls.filter(([, v]) => v.stratum === 'diagnostic').map(([k]) => k));
const secondaryScan = secondaryScanNeeded.size ? scan(secondaryDocs, secondaryScanNeeded) : null;
const secondaryWords = tierWordCount(secondaryDocs);

for (const key of [...secondaryScanNeeded].sort()) {
  const entry = perLemma.get(key);
  const res = sampleLemma({ kind: 'roster', lemma: entry.lemma, stratum: entry.stratum, key },
    secondaryScan.get(key), secondaryWords, 'secondary', rngSecondary);
  entry.secondaryCount = res.accepted.length;
  entry.secondaryFunnel = res.funnel;
  entry.occurrences = entry.occurrences.concat(res.accepted);
  entry.collisions = entry.collisions.concat(res.collisions);
  entry.anchorMarked = entry.anchorMarked.concat(res.anchorMarked);
  collisionsAll.push(...res.collisions.map(c => ({ lemma: entry.lemma, tier: 'secondary', ...c })));
  anchorAll.push(...res.anchorMarked.map(a => ({ lemma: entry.lemma, tier: 'secondary', ...a })));
}

// --- Stratum C sampling ------------------------------------------------------
const rngStratumC = makeRng(SEED ^ 0x1357);
const stratumCKeysAll = new Set(stratumCLemmas.keys());
const stratumCScan = stratumCKeysAll.size ? scan(primaryDocs, stratumCKeysAll) : null;
const stratumCSampled = [];
const stratumCShort = [];
// A Stratum C lemma that also appears in the named control stratum would draw a
// second, overlapping sample of the same (lemma, sentence) pairs. Those repeats
// are not independent evidence for the binding-precision estimate, so they are
// dropped here and the shortfall is reported instead of inflating n.
const namedControlKeys = new Set(
  [...perLemma.values()].filter(v => v.stratum === 'control').map(v => v.lemma.toLowerCase()));
function occurrencesFor() {
  const out = [];
  for (const [, v] of perLemma) for (const o of v.occurrences) out.push(o);
  return out;
}
const takenByNamed = new Set(
  occurrencesFor()
    .filter(r => r.stratum === 'control')
    .map(r => `${r.lemma.toLowerCase()}||${norm(r.sentence)}`));
let stratumCDroppedOverlap = 0;
for (const key of [...stratumCKeys].sort()) {
  const target = { kind: 'stratumC', lemma: key, stratum: 'controlStratumC', key };
  const res = sampleLemma(target, stratumCScan.get(key), primaryWords, 'primary', rngStratumC);
  let kept = res.accepted.slice(0, STRATUM_C_MAX_PER_LEMMA);
  if (namedControlKeys.has(key)) {
    const before = kept.length;
    kept = kept.filter(o => !takenByNamed.has(`${key}||${norm(o.sentence)}`));
    stratumCDroppedOverlap += before - kept.length;
  }
  stratumCSampled.push(...kept);
  if (kept.length === 0) stratumCShort.push(key);
}

// --- Emit --------------------------------------------------------------------
const diag = [...perLemma.entries()].filter(([, v]) => v.stratum === 'diagnostic');
const diagOk = diag.filter(([, v]) => v.occurrences.length >= MIN_PER_LEMMA);
const diagnosticWithTier2 = diag.filter(([, v]) => (v.secondaryCount ?? 0) > 0).map(([, v]) => v.lemma);
const shortages = [...perLemma.entries()]
  .filter(([, v]) => v.occurrences.length < MIN_PER_LEMMA)
  .map(([, v]) => ({ lemma: v.lemma, stratum: v.stratum, occurrences: v.occurrences.length, note: 'reported shortage — not filled synthetically' }));

const occurrences = [];
let oid = 0;
for (const [, v] of perLemma) for (const o of v.occurrences) occurrences.push({ id: `occ-${String(++oid).padStart(5, '0')}`, ...o });
for (const o of stratumCSampled) occurrences.push({ id: `occ-${String(++oid).padStart(5, '0')}`, ...o });

const jsonl = occurrences.map(o => JSON.stringify(o)).join('\n') + '\n';
writeFileSync(`${OUT_DIR}/occurrences.jsonl`, jsonl, 'utf8');
const datasetSha256 = sha256(jsonl);

const halfWidth = (n, p = 0.5) => (n === 0 ? null : +(1.96 * Math.sqrt(p * (1 - p) / n)).toFixed(4));

const manifest = {
  generatedBy: 'scripts/build_occurrence_dataset.mjs',
  datasetVersion: '1.0.0',
  samplingRuleVersion: SAMPLING_RULE_VERSION,
  seed: `0x${SEED.toString(16)}`,
  status: 'FROZEN — one run; reuse for T1 Phase 5, T3, T4 and T5',
  source: {
    primary: { corpus: 'Project Gutenberg', pool: 'pool.json', manifest: 'corpus-manifest.json', documents: primaryDocs.length, words: primaryWords, sha256Manifest: sha256(readFileSync(`${OUT_DIR}/corpus-manifest.json`, 'utf8')) },
    secondary: { corpus: 'Project Gutenberg (1900-1930, author death-year proxy)', pool: 'pool-secondary.json', manifest: 'corpus-manifest-secondary.json', documents: secondaryDocs.length, words: secondaryWords, rescueOnly: true },
    license: 'Public domain in the US; redistributed under the Project Gutenberg License',
  },
  normalisation: {
    lineUnwrapping: 'Documented normalisation: Project Gutenberg hard-wrapped lines are joined WITHIN a paragraph; blank-line paragraph boundaries are preserved so no sentence spans two paragraphs.',
    boilerplate: 'PG header/footer outside the START/END markers is never sampled.',
    sentenceSplitting: 'Abbreviation-aware splitter applied per paragraph.',
    hashing: 'Per-document sha256 is of the boilerplate-stripped body and is re-verified during sampling; a mismatch aborts the run.',
  },
  resolverSeenRule: {
    fullMatchMinLength: RESOLVER_FULL_MATCH_MIN_LEN,
    anchorMinLength: RESOLVER_ANCHOR_MIN_LEN,
    behaviour: 'full example-sentence match => EXCLUDED and listed in collisions; anchor/collocation/verb-frame substring overlap => MARKED "anchor" and kept',
    indexedLemmas: seenIndex.size,
    fullMatchesExcluded: collisionsAll.length,
    anchorMarkedKept: anchorAll.length,
  },
  caps: { perPosRatio: POS_CAP_RATIO, maxPerAuthor: MAX_PER_AUTHOR, nearDupJaccard: NEAR_DUP_THRESHOLD, targetPerLemma: TARGET_PER_LEMMA, minPerLemma: MIN_PER_LEMMA },
  posSource: 'Occurrence POS is the surface heuristic `heuristicPos` in scripts/build_occurrence_dataset.mjs, never the product resolver/aligner. Stratum C strata come from release/wordnet/wordnet-*.json (WordNet 3.0) directly. goldPos is empty until T0b.',
  occurrences: {
    total: occurrences.length,
    diagnostic: diag.reduce((a, [, v]) => a + v.occurrences.length, 0),
    control: [...perLemma.values()].filter(v => v.stratum === 'control').reduce((a, v) => a + v.occurrences.length, 0),
    controlStratumC: stratumCSampled.length,
    fromSecondaryTier: occurrences.filter(o => o.sourceTier === 'secondary').length,
    resolverSeenAnchor: occurrences.filter(o => o.resolverSeen === 'anchor').length,
  },
  diagnosticAcceptance: {
    lemmas: diag.length,
    meetingMin: diagOk.length,
    fraction: `${diagOk.length}/${diag.length}`,
    rescuedBySecondaryTier: diagnosticWithTier2,
    acceptance: '>= 5 occurrences for 6/7 diagnostic lemmas',
  },
  shortages,
  perLemma: [...perLemma.values()].map(v => ({
    lemma: v.lemma, stratum: v.stratum, pos: v.pos, allPos: v.allPos, synsets: v.synsets,
    auditExpected: v.auditExpected,
    primaryCount: v.primaryCount, primaryFunnel: v.primaryFunnel,
    secondaryCount: v.secondaryCount ?? 0, secondaryFunnel: v.secondaryFunnel ?? null,
    total: v.occurrences.length,
    resolverFullMatchCollisions: v.collisions.length, resolverAnchorMarked: v.anchorMarked.length,
  })),
  stratumC: {
    purpose: 'Stratified random sample of the full inventory for binding-precision estimation',
    inventorySize: inventoryN,
    posSource: 'release/wordnet/wordnet-{noun,verb,adj,adv}.json (WordNet 3.0), not the pack resolver POS codes',
    n: stratumC.length,
    maxOccurrencesPerLemma: STRATUM_C_MAX_PER_LEMMA,
    occurrencesSampled: stratumCSampled.length,
    // Occurrences dropped because the same (lemma, sentence) was already taken by
    // the named control stratum. Repeats are not independent evidence, so they are
    // excluded from n rather than silently inflating the precision estimate.
    droppedCrossStratumRepeats: stratumCDroppedOverlap,
    lemmasWithoutOccurrence: stratumCShort,
    design: stratumCDesign,
    confidenceInterval: {
      note: 'No binding-precision values are measured in T0 (that is T1/T3). The interval below is the design margin at the worst case p=0.5; substitute the measured p from T3.',
      worstCaseHalfWidth95: halfWidth(stratumC.length),
      perCellHalfWidth95: stratumCDesign.map(c => ({ cell: c.cell, n: c.drawn, halfWidth95: halfWidth(c.drawn) })),
    },
  },
  artifacts: {
    'data/occurrences/occurrences.jsonl': { sha256: datasetSha256, bytes: Buffer.byteLength(jsonl, 'utf8'), lines: occurrences.length },
    'data/occurrences/roster.json': { sha256: sha256(readFileSync(`${OUT_DIR}/roster.json`, 'utf8')) },
    'data/occurrences/SOURCE.md': { sha256: sha256(readFileSync(`${OUT_DIR}/SOURCE.md`, 'utf8')) },
    'data/occurrences/corpus-manifest.json': { sha256: sha256(readFileSync(`${OUT_DIR}/corpus-manifest.json`, 'utf8')) },
    'data/occurrences/corpus-manifest-secondary.json': { sha256: sha256(readFileSync(`${OUT_DIR}/corpus-manifest-secondary.json`, 'utf8')) },
    'data/occurrences/resolver-seen-index.json': { sha256: sha256(readFileSync(`${OUT_DIR}/resolver-seen-index.json`, 'utf8')), committed: false, reason: '33 MB; rebuild with scripts/build_resolver_seen_index.mjs' },
  },
  outOfScope: 'No product dictionary, resolver, alignment or data file is read for POS or modified. No C3/C4 classification is performed.',
};
writeFileSync(`${OUT_DIR}/dataset-manifest.json`, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

// --- Report ------------------------------------------------------------------
console.log(`seed 0x${SEED.toString(16)}  rule v${SAMPLING_RULE_VERSION}\n`);
console.log('lemma           stratum      pri  sec  tot  funnel(raw/rejShort/rejResv/rejPos/rejDup/rejAuth/rejCap)');
for (const v of manifest.perLemma) {
  const f = v.primaryFunnel;
  console.log(
    `${v.lemma.padEnd(15)} ${v.stratum.padEnd(11)} ${String(v.primaryCount).padStart(3)} ${String(v.secondaryCount).padStart(4)} ${String(v.total).padStart(4)}  ` +
    `${f.rawCandidates}/${f.rejectedShortSentence}/${f.rejectedResolverFullMatch}/${f.rejectedPosUncertain}/${f.rejectedNearDuplicate}/${f.rejectedAuthorCap}/${f.rejectedPerPosCap}` +
    `${v.secondaryFunnel ? '  [tier2 ' + v.secondaryFunnel.rawCandidates + ' raw]' : ''}`);
}
console.log(`\ndiagnostic >= ${MIN_PER_LEMMA}: ${manifest.diagnosticAcceptance.fraction}   rescuedBySecondaryTier: ${diagnosticWithTier2.join(', ') || 'none'}`);
console.log(`shortages: ${shortages.length ? shortages.map(s => `${s.lemma}(${s.occurrences})`).join(', ') : 'none'}`);
console.log(`resolver full-match exclusions: ${collisionsAll.length}   anchor-marked kept: ${anchorAll.length}`);
console.log(`stratumC n=${stratumC.length} occurrences=${stratumCSampled.length} worst-case 95% half-width=${manifest.stratumC.confidenceInterval.worstCaseHalfWidth95}`);
console.log(`\ntotal occurrences: ${occurrences.length} (diagnostic ${manifest.occurrences.diagnostic}, control ${manifest.occurrences.control}, stratumC ${manifest.occurrences.controlStratumC})`);
console.log(`occurrences.jsonl sha256: ${datasetSha256}`);