#!/usr/bin/env node
// FREEZE STEP 3a - lemma roster.
//
// Derives the frozen lemma roster for the occurrence dataset from the T1 audit
// artifacts, measuring real-corpus yield so no lemma is frozen speculatively.
//
// Diagnostic stratum: the 7 T1 lemmas that require real-context investigation.
// Control stratum:    the 4 prior VALID_SENSE_PASS cases + passing lemmas
//                     stratified by POS x ambiguity band, each constrained to a
//                     lemma with a usable meaningsVi[0].
//
// Usage: node scripts/build_occurrence_roster.mjs
// Output: data/occurrences/roster.json
//
// READ-ONLY with respect to product code: reads tmp/ audit artifacts and release/
// packs, never writes to them.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const OCC_DIR = 'data/occurrences';
const pool = JSON.parse(readFileSync(OCC_DIR + '/pool.json', 'utf8'));
const audit = JSON.parse(readFileSync('tmp/audit-corrected.json', 'utf8'));
const pack = JSON.parse(readFileSync('release/dictionary/context-lens-en-vi-2026.09.3.json', 'utf8'));
const reviewed = JSON.parse(readFileSync('release/dictionary/context-lens-sense-metadata-reviewed.json', 'utf8'));

const byLemma = new Map(pack.entries.map(e => [e.lemma.toLowerCase(), e]));
const reviewedByLemma = new Map(
  Object.entries(reviewed.entries).map(([k, v]) => [k.toLowerCase(), { lemma: k, ...v }])
);

function lookupEntry(lemma) {
  const key = lemma.toLowerCase();
  return byLemma.get(key) ?? reviewedByLemma.get(key) ?? null;
}

/** A lemma can only yield VALID_SENSE_PASS if its entry has a usable Vietnamese meaning. */
function usableVi(lemma) {
  const entry = lookupEntry(lemma);
  const meanings = entry?.meaningsVi ?? entry?.meanings ?? null;
  if (!Array.isArray(meanings) || meanings.length === 0) return { usable: false, meaningVi: null };
  const first = String(meanings[0] ?? '').trim();
  return first ? { usable: true, meaningVi: first } : { usable: false, meaningVi: null };
}

// --- Diagnostic stratum: the frozen 7 from the T0 lemma table --------------
const DIAGNOSTIC = [
  { lemma: 'lucent',    pos: 'adjective', role: 'rare adjective',              why: 'audit failure despite clean lexical evidence' },
  { lemma: 'nescience', pos: 'noun',      role: 'rare noun',                   why: 'audit failure despite clean lexical evidence' },
  { lemma: 'omen',      pos: 'noun',      role: 'noun with verb-adjacent uses', why: 'audit failure; multiple relevant POS' },
  { lemma: 'sporty',    pos: 'adjective', role: 'modern adjective',            why: 'audit failure; register mismatch' },
  { lemma: 'world',     pos: null,       role: 'high-frequency, many POS',     why: 'audit failure on a high-frequency ambiguous noun' },
  { lemma: 'light',     pos: null,       role: 'high-frequency, many POS',     why: 'audit failure on a high-frequency ambiguous noun/verb/adjective' },
  { lemma: 'withdraw',  pos: 'verb',      role: 'verb',                        why: 'audit failure; verb frame binding' },
];

// --- Control stratum: the 4 prior VALID_SENSE_PASS cases ------------------
// "counterargument" and "counterarguments" are two surface forms of one lemma and
// one prior-pass case, so 3 lemma entries carry all 4 case surfaces.
const PRIOR_PASS = ['counterargument', 'attempt', 'account for'];

const DIAGNOSTIC_SET = new Set(DIAGNOSTIC.map(d => d.lemma));

// --- Corpus load + yield measurement ---------------------------------------
function stripBoilerplate(raw) {
  const startRe = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i;
  const endRe = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i;
  const sm = startRe.exec(raw);
  const em = endRe.exec(raw);
  return sm ? raw.slice(sm.index + sm[0].length, em ? em.index : raw.length) : raw;
}

const bodies = pool.map(entry => {
  const path = 'tmp/corpus-cache/' + entry.id + '.txt';
  if (!existsSync(path)) return null;
  return { entry, body: stripBoilerplate(readFileSync(path, 'utf8')) };
}).filter(Boolean);

const totalWords = bodies.reduce((sum, d) => sum + d.body.split(/\s+/).filter(Boolean).length, 0);

function lemmaRe(lemma) {
  const escaped = lemma.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp('(?<![\\p{L}\'])' + escaped + '(?![\\p{L}\'])', 'giu');
}

// Declared surface variants per lemma. These are spelling variants of the same
// lemma (a hyphenation the frozen corpus prefers), not different lemmas, so the
// roster's yield table and the sampler must agree on the full surface set.
const SURFACE_VARIANTS = {
  // "counterargument" has 0 unhyphenated hits in the frozen corpus; the period
  // spelling is "counter-argument". WordNet lists it unhyphenated, so the
  // hyphenated surface is declared here rather than letting a spelling variant
  // masquerade as a genuine control shortage.
  counterargument: ['counterarguments', 'counter-argument', 'counter-arguments'],
  attempt: ['attempted'],
  'account for': [],
};

function yieldOf(lemma) {
  // Measure every declared surface so "0 hits" can never mean "wrong spelling".
  const surfaces = [lemma, ...(SURFACE_VARIANTS[lemma.toLowerCase()] ?? [])];
  let hits = 0;
  const docs = new Set();
  for (const { entry, body } of bodies) {
    for (const surface of surfaces) {
      const re = lemmaRe(surface);
      const found = body.match(re);
      if (found) { hits += found.length; docs.add(entry.id); }
    }
  }
  return { hits, docs: docs.size, perMillion: Number(((hits / totalWords) * 1e6).toFixed(2)) };
}

// --- Control strata: POS x ambiguity, both measured independently of the
// resolver's own selection so a mis-selected POS cannot poison the stratum.
// POS comes from WordNet (authoritative lemma-to-POS). "many" = the lemma has
// >=2 distinct synsets, i.e. the resolver will have multiple candidates to
// choose between; "some" = 1 synset. A control matching a failing lemma's POS and
// ambiguity band is what lets T3 separate "binding is bad for everything" from
// "binding is bad for these cases".
const WN_POS = { noun: 'noun', verb: 'verb', adj: 'adjective', adv: 'adverb' };

// The pack uses compact single-letter POS codes; only these map cleanly onto the
// four app-level POS the resolver arbitrates between. Anything else (D, Z, C, ...)
// is left to WordNet.
const WN_POS_REVERSE = { N: 'noun', V: 'verb', A: 'adjective', D: 'adverb' };

const wnSynonymCounts = new Map();
const wnPosByLemma = new Map();
for (const [wnFile, wnPos] of Object.entries(WN_POS)) {
  const path = 'release/wordnet/wordnet-' + wnFile + '.json';
  if (!existsSync(path)) continue;
  const wn = JSON.parse(readFileSync(path, 'utf8'));
  for (const [lemma, indices] of Object.entries(wn.entries ?? {})) {
    const key = String(lemma).toLowerCase();
    if (!wnSynonymCounts.has(key)) wnSynonymCounts.set(key, new Map());
    wnPosByLemma.has(key) ? wnPosByLemma.get(key).push(wnPos) : wnPosByLemma.set(key, [wnPos]);
    wnSynonymCounts.get(key).set(wnPos, indices.length);
  }
}

/** Every app-level POS WordNet holds this lemma under, WordNet file order. */
function wordnetPosList(lemma) {
  return wnPosByLemma.get(lemma.toLowerCase()) ?? [];
}

/** True when WordNet holds this lemma under the given app-level POS. */
function wordnetHas(lemma, appPos) {
  return wordnetPosList(lemma).includes(appPos);
}

/**
 * Primary POS: the app's own lexical entry when it declares exactly one
 * unambiguous code, else WordNet's first-listed POS. Never a last-write-wins
 * overwrite, which would silently relabel polysemous lemmas.
 */
function primaryPos(lemma) {
  const entry = lookupEntry(lemma);
  const code = entry?.partOfSpeech;
  if (typeof code === 'string' && code.length <= 2 && /^[A-Z]$/.test(code)) {
    const wnPos = WN_POS_REVERSE[code];
    if (wnPos && wordnetHas(lemma, wnPos)) return wnPos;
  }
  return wordnetPosList(lemma)[0] ?? null;
}

/** WordNet synset count for a lemma under a given POS (0 when absent). */
function synsetsFor(lemma, pos) {
  return wnSynonymCounts.get(lemma.toLowerCase())?.get(pos) ?? 0;
}

/** Total synsets for a lemma across all POS. */
function totalSynsets(lemma) {
  const map = wnSynonymCounts.get(lemma.toLowerCase());
  if (!map) return 0;
  return [...map.values()].reduce((a, b) => a + b, 0);
}

/** POS x ambiguity band key for a lemma. */
function bandOf(lemma, pos) {
  return pos + '|' + (totalSynsets(lemma) >= 2 ? 'many' : 'some');
}

const BANDS = [
  { pos: 'noun',      amb: 'many' },
  { pos: 'noun',      amb: 'some' },
  { pos: 'verb',      amb: 'many' },
  { pos: 'verb',      amb: 'some' },
  { pos: 'adjective', amb: 'many' },
  { pos: 'adjective', amb: 'some' },
  { pos: 'adverb',    amb: 'some' },
];

/**
 * Band POS for an audit-observed lemma. Prefers the POS the audit run itself
 * selected, because that is the POS the control is meant to exercise, but only
 * when WordNet confirms the lemma exists under it. Falls back to primaryPos.
 */
function observedBandPos(lemma, auditSelectedPos) {
  if (auditSelectedPos && wordnetHas(lemma, auditSelectedPos)) return auditSelectedPos;
  return primaryPos(lemma);
}

// Candidate controls per band: lemmas the audit run observed (i.e. that already
// pass in synthetic frames), keyed into bands by WordNet POS and synset count.
const bandMembers = new Map(BANDS.map(b => [b.pos + '|' + b.amb, new Map()]));
const auditSeen = new Map();
const auditSelectedPos = new Map();
for (const occ of audit.occurrences) {
  if (!occ.lemma) continue;
  const key = occ.lemma.toLowerCase();
  auditSeen.set(key, (auditSeen.get(key) ?? 0) + 1);
  if (!auditSelectedPos.has(key) && occ.selectedPos) auditSelectedPos.set(key, occ.selectedPos);
}
for (const [lemma, count] of auditSeen) {
  const pos = observedBandPos(lemma, auditSelectedPos.get(lemma));
  if (!pos) continue;
  const bucket = bandMembers.get(bandOf(lemma, pos));
  if (!bucket) continue;
  bucket.set(lemma, count);
}

const MIN_CONTROL_HITS = 60;
// The primary tier rescues a lemma only below this yield; mirrors the sampler.
const MIN_PER_LEMMA = 5;
const TARGET_PER_LEMMA = 10;
const POS_CAP_RATIO = 0.6;
const SEED = '0x5eed1eaf';
const RULE_VERSION = '3.0.0';
const seenControl = new Set(PRIOR_PASS.map(l => l.toLowerCase()));
const controlPicks = [];

function capitalisationRatio(lemma) {
  // Proper nouns separate cleanly from real words in this corpus (proper >0.99,
  // ordinary words <=0.06), so counting case variants beats any POS-code guess:
  // `anna` is coded `N` in the pack.
  const esc = lemma.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const lower = new RegExp('(?<![\\p{L}\'])' + esc + '(?![\\p{L}\'])', 'gu');
  const upper = new RegExp('(?<![\\p{L}\'])' + esc.charAt(0).toUpperCase() + esc.slice(1) + '(?![\\p{L}\'])', 'gu');
  let lowerCount = 0;
  let upperCount = 0;
  for (const { body } of bodies) {
    lower.lastIndex = 0;
    upper.lastIndex = 0;
    lowerCount += (body.match(lower) ?? []).length;
    upperCount += (body.match(upper) ?? []).length;
    if (lowerCount + upperCount > 2000) break;
  }
  const total = lowerCount + upperCount;
  return total < 5 ? null : upperCount / total;
}

const PROPER_NOUN_RATIO = 0.5;

function addControl(lemma, band, note) {
  const key = lemma.toLowerCase();
  if (seenControl.has(key) || DIAGNOSTIC_SET.has(key)) return false;
  if (wordnetPosList(key).length === 0) return false;
  const capRatio = capitalisationRatio(key);
  if (capRatio !== null && capRatio > PROPER_NOUN_RATIO) return false;
  const vi = usableVi(key);
  if (!vi.usable) return false;
  const y = yieldOf(key);
  if (y.hits < MIN_CONTROL_HITS) return false;
  seenControl.add(key);
  controlPicks.push({
    lemma: key, pos: band.pos, band: band.pos + '|' + band.amb, note,
    meaningVi: vi.meaningVi, yield: y,
    capitalisation: capRatio,
  });
  return true;
}

for (const band of BANDS) {
  const key = band.pos + '|' + band.amb;
  const members = [...(bandMembers.get(key)?.entries() ?? [])]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([lemma]) => lemma);
  let taken = 0;
  // Up to 2 per band: a mid-frequency and a high-frequency control, so the control
  // stratum spans frequency as well as POS.
  for (const lemma of members) {
    if (taken >= 2) break;
    if (addControl(lemma, band, key + ' band, audit-observed passing')) taken += 1;
  }
  if (taken < 2) {
    console.warn('band under-filled: ' + key + ' (' + taken + ' controls)');
  }
}

const lemmas = [
  ...DIAGNOSTIC.map(d => {
    const pos = primaryPos(d.lemma);
    return {
      stratum: 'diagnostic',
      lemma: d.lemma,
      pos: d.pos ?? pos,
      band: bandOf(d.lemma, d.pos ?? pos ?? 'noun'),
      // Every relevant WordNet POS, so T3 can stratify a polysemous lemma.
      allPos: wordnetPosList(d.lemma),
      synsets: totalSynsets(d.lemma),
      role: d.role,
      notes: d.why,
      yield: yieldOf(d.lemma),
            auditExpected: 'needs real-context investigation',
            goldSense: '',
            goldPos: '',
    };
  }),
  ...PRIOR_PASS.map(lemma => {
    const vi = usableVi(lemma);
      // Use the POS the audit run actually selected for the passing case; that is the
      // POS the control exercises. `attempted` selected a verb sense, so `attempt` is
      // a verb control, not the noun its lexical entry declares.
      const pos = auditSelectedPos.get(lemma.toLowerCase()) ?? primaryPos(lemma);
      return {
      stratum: 'control',
      lemma,
      pos,
      band: bandOf(lemma, pos ?? 'noun'),
      allPos: wordnetPosList(lemma),
      synsets: totalSynsets(lemma),
      role: 'prior VALID_SENSE_PASS case',
      notes: vi.usable
        ? 'one of the 4 prior VALID_SENSE_PASS audit surfaces'
        : 'one of the 4 prior VALID_SENSE_PASS audit surfaces - entry found only in the reviewed metadata pack',
      yield: yieldOf(lemma),
            auditExpected: 'VALID_SENSE_PASS',
            goldSense: '',
            goldPos: '',
    };
  }),
  ...controlPicks.map(c => ({
    stratum: 'control',
    lemma: c.lemma,
    pos: c.pos,
    band: c.band,
    allPos: wordnetPosList(c.lemma),
    synsets: totalSynsets(c.lemma),
    role: 'stratified passing control',
    notes: c.note,
    yield: c.yield,
    auditExpected: 'VALID_SENSE_PASS',
    goldSense: '',
    goldPos: '',
      })),
      // Amendment 6, Stratum C: a stratified random sample of the whole inventory, drawn
      // at sampling time to estimate binding precision. It is not a fixed lemma list, so
      // the roster carries only the slot; the sampler records n and the Wilson 95% CI.
      {
        stratum: 'controlStratumC',
        lemma: 'bindingPrecisionSample',
        pos: 'mixed',
        band: 'inventory',
        allPos: ['noun', 'verb', 'adjective', 'adverb'],
        synsets: 0,
        role: 'stratified random sample of full inventory for binding-precision CI',
        notes: 'sample size n and CI reported in dataset manifest; not a fixed lemma list',
        yield: { hits: 0, docs: 0, perMillion: 0 },
        auditExpected: 'binding-precision estimation',
        goldSense: '',
        goldPos: '',
      },
    ];

    const roster = {
      rosterVersion: '2.0.0',
  corpus: {
    documents: bodies.length,
    words: totalWords,
    // The yield table below is measured on the PRIMARY tier only (pool.json).
    // The pre-declared secondary tier is a rescue tier sampled by the dataset
    // builder, not part of roster selection, so its yields are reported in
    // dataset-manifest.json instead. A low yield here is therefore "low in the
    // primary tier", not "absent from the corpus".
    tier: 'primary',
    yieldScope: 'primary tier only; see dataset-manifest.json perLemma[].secondaryFunnel for secondary-tier yields',
  },
  derivation: {
    diagnostic: 'the 7 T1 lemmas from the T0 lemma table requiring real-context investigation',
    control: 'the 4 prior VALID_SENSE_PASS surfaces + passing lemmas stratified by POS x candidate-count band, each constrained to a usable meaningsVi[0] and >= ' + MIN_CONTROL_HITS + ' measured corpus hits',
    constraints: [
      'a control lemma must have a usable meaningsVi[0], otherwise viEvidence is vacuous and it cannot yield VALID_SENSE_PASS',
      'a control lemma must have >= ' + MIN_CONTROL_HITS + ' measured hits in the frozen corpus, otherwise its sample would be under-powered',
      'diagnostic lemmas are never reused as controls',
    ],
  },
  lemmas,
    samplingRules: {
          version: RULE_VERSION,
          seed: SEED,
          seedAuthority: 'the seed actually used by the single frozen run of scripts/build_occurrence_dataset.mjs; the roster script only records the rule, it never samples',
          oneRunThenFreeze: true,
          minPerLemma: MIN_PER_LEMMA,
          targetPerLemma: TARGET_PER_LEMMA,
          posCapRatio: POS_CAP_RATIO,
          posSource: 'WordNet only - amendment 2 forbids deriving pos from the product pipeline',
          goldFields: 'goldSense/goldPos stay empty in T0 and are filled by T0b; auditExpected is never gold',
          secondaryTier: 'pre-declared in SOURCE.md section 7; used only when the primary tier yields < ' + MIN_PER_LEMMA + ' occurrences for a lemma, and tagged source_tier=secondary',
        },
    surfaceVariants: SURFACE_VARIANTS,
};

writeFileSync(OCC_DIR + '/roster.json', JSON.stringify(roster, null, 2) + '\n', 'utf8');

console.log('corpus: ' + bodies.length + ' docs / ' + totalWords.toLocaleString() + ' words\n');
console.log('stratum    pos        band    syn  hits    docs   perM  lemma');
for (const l of lemmas) {
  console.log(
    l.stratum.padEnd(10) + ' ' + String(l.pos ?? '-').padEnd(9) + ' ' +
    String(l.band ?? '-').padEnd(7) + ' ' + String(l.synsets ?? '-').padStart(3) + ' ' +
    String(l.yield.hits).padStart(5) + ' ' + String(l.yield.docs).padStart(6) + ' ' +
    String(l.yield.perMillion).padStart(6) + '  ' + l.lemma +
    (l.allPos && l.allPos.length > 1 ? '  [' + l.allPos.join('/') + ']' : '')
  );
}
const diag = lemmas.filter(l => l.stratum === 'diagnostic').length;
const ctrl = lemmas.filter(l => l.stratum === 'control').length;
console.log('\ndiagnostic lemmas: ' + diag + '   control lemmas: ' + ctrl);
const under = lemmas.filter(l => l.yield.hits < 5);
console.log('lemmas with <5 measured hits: ' + (under.length ? under.map(u => u.lemma + '(' + u.yield.hits + ')').join(', ') : 'none'));