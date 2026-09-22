#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(resolve(root, 'release/dictionary/manifest.json'), 'utf8'));
const dictionary = JSON.parse(await readFile(resolve(root, 'release/dictionary', manifest.pack), 'utf8'));
const wordNetFiles = ['wordnet-noun.json', 'wordnet-verb.json', 'wordnet-adj.json', 'wordnet-adv.json'];
const wordNetPacks = await Promise.all(wordNetFiles.map(file => readFile(resolve(root, 'release/wordnet', file), 'utf8').then(JSON.parse)));

const normalizeLemma = value => value.normalize('NFC').toLocaleLowerCase('en').replaceAll('_', ' ').replace(/\s+/g, ' ').trim();
const dictionaryLemmas = new Set(dictionary.entries.map(entry => normalizeLemma(entry.lemma)));
const wordNet = new Map();
for (const pack of wordNetPacks) {
  for (const [rawLemma, indices] of Object.entries(pack.entries)) {
    const lemma = normalizeLemma(rawLemma);
    if (!/^[a-z][a-z' -]*$/.test(lemma)) continue;
    const current = wordNet.get(lemma) ?? { lemma, senseCount: 0, partsOfSpeech: new Set() };
    current.senseCount += indices.length;
    current.partsOfSpeech.add(pack.pos);
    wordNet.set(lemma, current);
  }
}

const candidatePath = resolve(root, 'data/dictionary/en-vi-candidates.jsonl');
const candidateText = await readFile(candidatePath, 'utf8').catch(() => '');
const candidates = new Map(candidateText.split(/\r?\n/).filter(Boolean).map((line, index) => {
  try {
    const candidate = JSON.parse(line);
    return [normalizeLemma(candidate.lemma), candidate];
  } catch (error) {
    throw new Error(`Invalid candidate JSON at line ${index + 1}: ${error.message}`);
  }
}));
const decisionText = await readFile(resolve(root, 'data/dictionary/en-vi-review-decisions.jsonl'), 'utf8').catch(() => '');
const decisions = new Map(decisionText.split(/\r?\n/).filter(Boolean).map(line => {
  const decision = JSON.parse(line); return [normalizeLemma(decision.lemma), decision];
}));
const reviewedPack = await readFile(resolve(root, 'release/dictionary/context-lens-wiktionary-en-vi-reviewed-2026.09.2.json'), 'utf8')
  .then(JSON.parse).catch(() => ({ entries: [] }));
const reviewedLemmas = new Set(reviewedPack.entries.map(entry => normalizeLemma(entry.lemma)));

const bundledGaps = [...wordNet.values()].filter(item => !dictionaryLemmas.has(item.lemma));
const gaps = bundledGaps.filter(item => !reviewedLemmas.has(item.lemma)).map(item => ({
  lemma: item.lemma,
  kind: item.lemma.includes(' ') ? 'phrase' : 'word',
  senseCount: item.senseCount,
  partsOfSpeech: [...item.partsOfSpeech].sort(),
  candidateStatus: decisions.get(item.lemma)?.decision ?? candidates.get(item.lemma)?.status ?? 'missing'
}));
const requiredRegression = new Set(['counterargument']);
gaps.sort((a, b) => Number(requiredRegression.has(b.lemma)) - Number(requiredRegression.has(a.lemma))
  || b.senseCount - a.senseCount || a.lemma.length - b.lemma.length || a.lemma.localeCompare(b.lemma));

const count = kind => gaps.filter(item => item.kind === kind).length;
const report = {
  generatedAt: new Date().toISOString(),
  dictionary: { id: dictionary.id, version: dictionary.packVersion, entries: dictionary.entries.length },
  wordNet: { version: wordNetPacks[0]?.version, normalizedLemmas: wordNet.size },
  coverage: {
    bundledOverlappingLemmas: wordNet.size - bundledGaps.length,
    reviewedAdditions: bundledGaps.filter(item => reviewedLemmas.has(item.lemma)).length,
    overlappingLemmas: wordNet.size - gaps.length,
    missingLemmas: gaps.length,
    missingWords: count('word'),
    missingPhrases: count('phrase'),
    overlapPercent: Number((((wordNet.size - gaps.length) / wordNet.size) * 100).toFixed(2))
  },
  candidateQueue: {
    entries: candidates.size,
    accepted: [...decisions.values()].filter(item => item.decision === 'accept').length,
    rejected: [...decisions.values()].filter(item => item.decision === 'reject').length,
    unresolved: [...candidates.keys()].filter(lemma => !decisions.has(lemma)).length
  },
  priorityBasis: 'required regression, then WordNet sense count, shorter lemma, alphabetical; this is not a frequency or correctness score',
  reviewQueue: gaps.slice(0, 25)
};

const outputFlag = process.argv.indexOf('--output');
if (outputFlag >= 0) {
  const output = process.argv[outputFlag + 1];
  if (!output) throw new Error('--output requires a file path');
  await writeFile(resolve(process.cwd(), output), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
console.log(JSON.stringify(report, null, 2));
