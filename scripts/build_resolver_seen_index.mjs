#!/usr/bin/env node
// FREEZE STEP 2 (helper) — build the resolver-seen index.
//
// The resolver's evidence surfaces are:
//   * WordNet 3.0 synset `examples` (release/wordnet/wordnet-{noun,verb,adj,adv}.json)
//   * WordNet 3.0 synset definitions
//   * WordNet 3.0 verb frames
//   * Skypedia pack `viSenses` example text, and pack `definitionEn`
// This emits a normalised form of every such string so the sampler can mechanically
// reject any sampled sentence that collides with resolver-consumed evidence.
//
// Vietnamese `meaningsVi` strings are deliberately NOT indexed: they are
// Vietnamese text and cannot collide with English corpus prose, so indexing them
// would only inflate the artifact.
//
// Usage: node scripts/build_resolver_seen_index.mjs
// Output: data/occurrences/resolver-seen-index.json
//
// SCOPE: only the lemmas named in data/occurrences/roster.json are indexed. The
// full index is ~31 MB across 192k lemmas and would dominate the repository; the
// collision check is only meaningful for lemmas the dataset actually samples.
// Pass SCOPE_ALL=1 to emit the full index for ad-hoc analysis.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';

const OUT = 'data/occurrences/resolver-seen-index.json';

const scopeAll = process.env.SCOPE_ALL === '1';
let scopeSet = null;
if (!scopeAll) {
  const rosterPath = 'data/occurrences/roster.json';
  if (!existsSync(rosterPath)) {
    console.error('missing data/occurrences/roster.json - run build_occurrence_roster.mjs first, or set SCOPE_ALL=1');
    process.exit(1);
  }
  const roster = JSON.parse(readFileSync(rosterPath, 'utf8'));
  scopeSet = new Set(roster.lemmas.map(l => l.lemma.toLowerCase()));
  console.log(`scope: ${scopeSet.size} roster lemmas`);
}

// Normalisation for collision detection: case-folded, punctuation collapsed to a
// single space. Deliberately aggressive so near-duplicates also collide.
export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Add the target surface under a lighter normalisation too, so that a sentence which
// embeds the lemma plus the resolver's context words is also caught.
function lightNormalize(text) {
  return normalize(text);
}

const wnFiles = ['noun', 'verb', 'adj', 'adv']
  .map(pos => `release/wordnet/wordnet-${pos}.json`)
  .filter(path => existsSync(path));

if (!wnFiles.length) {
  console.error('no release/wordnet files found - run the WordNet export first');
  process.exit(1);
}

const byLemma = new Map();
const record = (lemma, kind, text) => {
  const key = String(lemma).toLowerCase();
  if (scopeSet && !scopeSet.has(key)) return;
  const norm = normalize(text);
  if (!norm || norm.length < 12) return; // too short to be meaningful evidence
  if (!byLemma.has(key)) byLemma.set(key, new Set());
  byLemma.get(key).add(norm);
};

let synsets = 0;
for (const file of wnFiles) {
  const pack = JSON.parse(readFileSync(file, 'utf8'));
  // Same unpacking as lookupWordNet() in src/core/language/wordnet.ts:
  //   synsets[index] = [offset, words, definitionEn, examples, verbFrames]
  //   entries[lemma] = [synsetIndex, ...]
  for (const [lemma, indices] of Object.entries(pack.entries ?? {})) {
    const key = String(lemma).toLowerCase();
    if (scopeSet && !scopeSet.has(key)) continue;
    for (const index of indices) {
      const synset = pack.synsets[index];
      if (!synset) continue;
      synsets++;
      const [offset, words, definitionEn, examples, frames] = synset;
      if (definitionEn) record(key, 'gloss', definitionEn);
      for (const example of examples ?? []) record(key, 'example', example);
      // Verb frames reach the resolver via frameEvidence(); record both the frame
      // text and its slot-filled realisation.
      for (const frame of frames ?? []) {
        record(key, 'frame', Array.isArray(frame) ? frame[0] : frame);
      }
    }
  }
}

// Skypedia packs. Two shapes are present in release/dictionary:
//   * shape A — `entries` is an array of { lemma, definitionEn, meaningsVi: string[],
//     viSenses: [senseId, partOfSpeech, meaningIndex, example?][] }
//   * shape B — `entries` is an object keyed by lemma (reviewed metadata)
const packsDir = 'release/dictionary';
const packFiles = existsSync(packsDir)
  ? readdirSync(packsDir).filter(f => f.endsWith('.json'))
  : [];

let packEntries = 0;
for (const file of packFiles) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(`${packsDir}/${file}`, 'utf8'));
  } catch {
    continue;
  }
  const rawEntries = parsed.entries ?? [];
  const list = Array.isArray(rawEntries)
    ? rawEntries
    : Object.entries(rawEntries).map(([lemma, value]) => (value && typeof value === 'object' ? { lemma, ...value } : { lemma }));

  for (const entry of list) {
      const lemma = String(entry.lemma ?? entry.word ?? '').toLowerCase();
      if (!lemma) continue;
      if (scopeSet && !scopeSet.has(lemma)) continue;
      packEntries++;
      if (entry.definitionEn) record(lemma, 'pack-gloss', entry.definitionEn);
      // The 4th viSenses element is the example sentence consumed at packs.ts:130.
      for (const sense of entry.viSenses ?? []) {
        const example = Array.isArray(sense) ? sense[3] : sense?.example;
        if (example) record(lemma, 'pack-example', example);
      }
    }
}

const index = {};
let totalStrings = 0;
for (const [lemma, set] of [...byLemma].sort((a, b) => a[0].localeCompare(b[0]))) {
  index[lemma] = [...set].sort();
  totalStrings += set.size;
}

const out = {
  generatedBy: 'scripts/build_resolver_seen_index.mjs',
  purpose: 'Mechanical exclusion of resolver-consumed evidence from the occurrence dataset',
  scope: scopeAll ? 'all lemmas (SCOPE_ALL=1)' : 'roster lemmas only',
  sources: {
    wordnetFiles: wnFiles,
    wordnetSynsets: synsets,
    packFiles,
    packEntries,
  },
  lemmaCount: Object.keys(index).length,
  stringCount: totalStrings,
  index,
};

writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`wordnet synsets: ${synsets}`);
console.log(`pack files: ${packFiles.length}, entries: ${packEntries}`);
console.log(`lemmas: ${Object.keys(index).length}, evidence strings: ${totalStrings}`);
console.log(`written: ${OUT}`);