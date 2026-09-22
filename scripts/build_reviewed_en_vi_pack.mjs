#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const readJsonl = async path => (await readFile(path, 'utf8')).split(/\r?\n/).filter(Boolean).map((line, index) => {
  try { return JSON.parse(line); } catch (error) { throw new Error(`${path}:${index + 1}: ${error.message}`); }
});
const candidates = await readJsonl(resolve(root, 'data/dictionary/en-vi-candidates.jsonl'));
const decisions = await readJsonl(resolve(root, 'data/dictionary/en-vi-review-decisions.jsonl'));
const decisionByLemma = new Map(decisions.map(item => [item.lemma, item]));
const missingDecisions = candidates.filter(item => !decisionByLemma.has(item.lemma)).map(item => item.lemma);
if (missingDecisions.length) throw new Error(`Candidates without review decisions: ${missingDecisions.join(', ')}`);

const entries = candidates.flatMap(candidate => {
  const decision = decisionByLemma.get(candidate.lemma);
  if (decision.decision === 'reject') return [];
  if (decision.decision !== 'accept') throw new Error(`Unknown decision for ${candidate.lemma}`);
  if (!candidate.entry?.senses?.length || (candidate.status !== 'cross-checked' && !decision.allowProvisional)) {
    throw new Error(`Accepted candidate ${candidate.lemma} lacks cross-checked senses or an explicit provisional override`);
  }
  const reviewedProvenance = {
    ...candidate.source, reviewStatus: 'editor-reviewed', reviewerKind: decision.reviewerKind,
    reviewedBy: decision.reviewedBy, reviewedAt: decision.reviewedAt,
    notes: [candidate.source.notes, decision.reason].filter(Boolean).join(' ')
  };
  return [{ ...candidate.entry, provenance: reviewedProvenance,
    senses: candidate.entry.senses.map(sense => ({ ...sense, provenance: reviewedProvenance })) }];
});
if (!entries.length) throw new Error('No accepted entries to release');

const pack = {
  schema: 'context-lens.dictionary-pack', version: 1, id: 'context-lens.wiktionary.en-vi.reviewed',
  name: 'Context Lens AI-assisted reviewed Wiktionary EN–VI', packVersion: '2026.09.2', quality: 'reviewed',
  license: {
    name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    attribution: 'Sense-aligned English–Vietnamese translations from Wiktionary, extracted and cross-checked through Kaikki/Wiktextract. Per-sense source revisions and review method are embedded in each entry.'
  }, entries
};
const outputFlag = process.argv.indexOf('--output');
const output = resolve(root, outputFlag >= 0 ? process.argv[outputFlag + 1] : 'release/dictionary/context-lens-wiktionary-en-vi-reviewed-2026.09.2.json');
await writeFile(output, `${JSON.stringify(pack, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output, entries: entries.length, accepted: entries.map(entry => entry.lemma), rejected: decisions.filter(item => item.decision === 'reject').map(item => item.lemma) }, null, 2));
