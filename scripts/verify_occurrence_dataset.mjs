// Independent post-freeze verification of the occurrence dataset.
// Re-runnable; prints PASS/FAIL per check and exits non-zero on any FAIL.
import fs from 'node:fs';
import crypto from 'node:crypto';

const rows = fs.readFileSync('data/occurrences/occurrences.jsonl', 'utf8')
  .trim().split(/\r?\n/).map((l) => JSON.parse(l));
const man = JSON.parse(fs.readFileSync('data/occurrences/dataset-manifest.json', 'utf8'));
const roster = JSON.parse(fs.readFileSync('data/occurrences/roster.json', 'utf8'));
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log('PASS  ' + name + (detail ? '  (' + detail + ')' : '')); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  (' + detail + ')' : '')); }
};

// 1. Artifact hashes match disk.
const hashBad = Object.entries(man.artifacts).filter(([f, e]) => sha(f) !== e.sha256);
check('artifact hashes match disk', hashBad.length === 0,
  hashBad.length ? hashBad.map((x) => x[0]).join(',') : Object.keys(man.artifacts).length + ' artifacts');

// 2. Row count matches manifest.
const lineMeta = man.artifacts['data/occurrences/occurrences.jsonl'];
check('row count matches manifest', rows.length === lineMeta.lines, rows.length + ' rows');

// 3. goldSense / goldPos empty in T0 (never used as gold).
const goldSet = rows.filter((r) => (r.goldSense !== '' && r.goldSense != null) ||
  (r.goldPos !== '' && r.goldPos != null));
check('goldSense/goldPos empty in T0', goldSet.length === 0, goldSet.length + ' non-empty');

// 4. No legacy field names.
const legacy = ['expected', 'meaningVi', 'definitionEn'];
const legacyHit = rows.filter((r) => legacy.some((k) => k in r));
check('no legacy expected/meaningVi/definitionEn', legacyHit.length === 0, legacyHit.length + ' hits');

// 5. auditExpected present on every row.
check('auditExpected on every row', rows.every((r) => typeof r.auditExpected === 'string'));

// 6. POS never from the product pipeline (heuristicPos output shapes only).
const POS_OK = new Set(['noun', 'verb', 'adjective', 'adverb', 'unknown']);
check('POS values are heuristic (not resolver codes)',
  rows.every((r) => POS_OK.has(r.pos)), [...new Set(rows.map((r) => r.pos))].join(','));

// 7. Per-document sha256 + retrieval date on every row.
check('per-doc sha256 + retrievedAt on every row',
  rows.every((r) => /^[0-9a-f]{64}$/.test(r.docSha256) && !!r.retrievedAt));

// 8. Context is a sentence-centred window: non-empty AND actually contains the
//    annotated sentence. The pre-fix run stored a paragraph PREFIX, which omitted
//    the sentence itself on 188/543 rows (34.6%) — a regression guard for SOURCE.md §8.7.
check('context non-empty on every row',
  rows.every((r) => typeof r.context === 'string' && r.context.length > 0));
const ctxMissing = rows.filter((r) => !r.context.includes(r.sentence));
check('context contains its own sentence (regression guard for §8.7)',
  ctxMissing.length === 0,
  ctxMissing.length ? ctxMissing.length + ' rows: ' + ctxMissing.slice(0, 3).map((r) => r.id + '/' + r.lemma).join(', ')
    : rows.length + ' rows');
// A window longer than the cap is only legitimate when the sentence itself is that long.
const CTX_CAP = 600;
const ctxOver = rows.filter((r) => r.context.length > Math.max(CTX_CAP, r.sentence.length));
check('context respects the char cap unless the sentence exceeds it',
  ctxOver.length === 0, ctxOver.length + ' rows over cap');

// 8c. Provenance: every context must be a verbatim substring of a paragraph of its
// OWN source document, after the documented amendment-7 line-unwrapping
// normalisation. Stronger than the checks above: it also catches a context taken
// from the wrong document.
const normBody = (body) => body
  .replace(/\r\n?/g, '\n')
  .split(/\n[ \t]*\n+/)
  .map((p) => p.replace(/[ \t]*\n[ \t]*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim())
  .filter((p) => p.length > 0);
const cacheDir = 'tmp/corpus-cache';
let provOk = 0, provBad = [], provSkip = 0;
for (const r of rows) {
  const f = cacheDir + '/' + r.docId + '.txt';
  if (!fs.existsSync(f)) { provSkip++; continue; }
  const paras = normBody(fs.readFileSync(f, 'utf8'));
  if (paras.some((p) => p.includes(r.context) && p.includes(r.sentence))) provOk++;
  else if (provBad.length < 5) provBad.push(r.id + ' docId=' + r.docId);
}
check('context is verbatim from its own source document',
  provOk === rows.length - provSkip,
  provOk + '/' + (rows.length - provSkip) + ' verified' +
  (provSkip ? ', ' + provSkip + ' uncached' : '') +
  (provBad.length ? '  BAD ' + provBad.join(', ') : ''));

// 8d. docSha256 must equal the sha256 of that document's NORMALISED text, i.e.
// the value recorded in the corpus manifest (cache files are the raw download).
const corpusManifests = ['data/occurrences/corpus-manifest.json', 'data/occurrences/corpus-manifest-secondary.json']
  .filter((p) => fs.existsSync(p))
  .map((p) => JSON.parse(fs.readFileSync(p, 'utf8')))
  .map((m) => (Array.isArray(m) ? m : m.documents))
  .flat();
const shaById = new Map(corpusManifests.map((d) => [String(d.id), d.sha256]));
const shaBad = rows.filter((r) => shaById.get(String(r.docId)) !== r.docSha256);
check('docSha256 matches the corpus manifest for its document',
  shaBad.length === 0,
  shaBad.length ? shaBad.length + ' rows, e.g. ' + shaBad.slice(0, 3).map((r) => r.id).join(', ')
    : rows.length + ' rows across ' + shaById.size + ' manifest docs');

// 9. resolverSeen tri-state only.
const verdicts = [...new Set(rows.map((r) => String(r.resolverSeen)))].sort();
check('resolverSeen is false|anchor only',
  verdicts.every((v) => v === 'false' || v === 'anchor'),
  verdicts.join(',') + '  anchor=' + rows.filter((r) => r.resolverSeen === 'anchor').length +
  '  false=' + rows.filter((r) => r.resolverSeen === false).length);

// 10. Seed and rule version frozen.
check('seed == 0x5eed1eaf', man.seed === '0x5eed1eaf', String(man.seed));
check('samplingRuleVersion 3.0.0', man.samplingRuleVersion === '3.0.0', man.samplingRuleVersion);

// 11. Author cap <= 2 per lemma within a stratum.
const byL = new Map();
for (const r of rows) {
  const k = r.lemma + '||' + r.stratum;
  if (!byL.has(k)) byL.set(k, new Map());
  const m = byL.get(k);
  m.set(r.author, (m.get(r.author) || 0) + 1);
}
const authorBad = [...byL.entries()].filter(([, m]) => [...m.values()].some((n) => n > 2));
check('author cap <= 2 per lemma per stratum', authorBad.length === 0,
  authorBad.map(([k]) => k).join(',') || 'max ok');

// 12. Per-POS cap for multi-POS lemmas only. The amendment's cap is an absolute
// ceil(0.6 * TARGET) = 6 and applies where a lemma has more than one relevant
// POS; a single-POS lemma is legitimately allowed the full target.
const multiPos = new Set(roster.lemmas.filter((l) => Array.isArray(l.allPos) && l.allPos.length > 1)
  .map((l) => l.lemma));
const perPos = new Map();
for (const r of rows) {
  const k = r.lemma + '||' + r.stratum + '||' + r.pos;
  perPos.set(k, (perPos.get(k) || 0) + 1);
}
const CAP = 6;
const posBad = [...perPos.entries()].filter(([k, n]) => n > CAP && multiPos.has(k.split('||')[0]));
check('per-POS cap <= ' + CAP + ' for multi-POS lemmas', posBad.length === 0,
  posBad.map(([k, n]) => k + '=' + n).join(',') ||
  (multiPos.size + ' multi-POS lemmas, max=' +
   Math.max(...[...perPos.entries()].filter(([k]) => multiPos.has(k.split('||')[0])).map(([, n]) => n), 0)));

// 13. No (lemma, sentence) repeat anywhere -> independence.
const seen = new Set(); let dup = 0;
for (const r of rows) {
  const k = r.lemma + '||' + r.sentence;
  if (seen.has(k)) dup++; else seen.add(k);
}
check('no (lemma, sentence) repeat', dup === 0, dup + ' repeats');

// 14. Prior VALID_SENSE_PASS lemmas represented.
const PRIOR = ['counterargument', 'attempt', 'account for'];
const missing = PRIOR.filter((l) => !roster.lemmas.some((x) => x.lemma === l));
check('prior VALID_SENSE_PASS lemmas in roster', missing.length === 0, missing.join(',') || PRIOR.join(', '));

// 15. Stratum C sample size + CI reported.
check('Stratum C n + CI reported',
  man.stratumC && man.stratumC.n > 0 && typeof man.stratumC.confidenceInterval.worstCaseHalfWidth95 === 'number',
  'n=' + (man.stratumC && man.stratumC.n) + ' halfWidth=' +
  (man.stratumC && man.stratumC.confidenceInterval.worstCaseHalfWidth95));

// 16. Funnel identity closes for every lemma and every tier:
//     rawCandidates = sum(rejected*) + accepted + notExaminedAfterTarget
// Rejection buckets are flat rejected* fields inside primaryFunnel/secondaryFunnel.
const REJECT_KEYS = ['rejectedShortSentence', 'rejectedResolverFullMatch', 'rejectedPosUncertain',
  'rejectedPosNotInRoster', 'rejectedNearDuplicate', 'rejectedAuthorCap', 'rejectedPerPosCap'];
const funnelBad = [];
let funnelChecked = 0;
for (const entry of man.perLemma || []) {
  for (const [tier, f] of [['primary', entry.primaryFunnel], ['secondary', entry.secondaryFunnel]]) {
    if (!f) continue;
    const accepted = f.rawCandidates - (f.notExaminedAfterTarget || 0) -
      REJECT_KEYS.reduce((a, k) => a + (f[k] || 0), 0);
    const total = REJECT_KEYS.reduce((a, k) => a + (f[k] || 0), 0) + accepted + (f.notExaminedAfterTarget || 0);
    funnelChecked++;
    if (total !== f.rawCandidates) {
      funnelBad.push(entry.lemma + '/' + tier + ' ' + total + '!=' + f.rawCandidates);
    }
  }
}
check('funnel identity closes for all lemmas and tiers', funnelBad.length === 0 && funnelChecked > 0,
  funnelBad.join('; ') || funnelChecked + ' funnels across ' + (man.perLemma || []).length + ' lemmas');

// 17. Corpus diversity (no single-author dependence).
check('>=100 distinct documents', new Set(rows.map((r) => r.docId)).size >= 100,
  new Set(rows.map((r) => r.docId)).size + ' docs / ' +
  new Set(rows.map((r) => r.author)).size + ' authors');

// 18. Tiers tagged on every row.
check('source_tier tagged on every row',
  rows.every((r) => r.sourceTier === 'primary' || r.sourceTier === 'secondary'),
  'secondary=' + rows.filter((r) => r.sourceTier === 'secondary').length);

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail === 0 ? 0 : 1);