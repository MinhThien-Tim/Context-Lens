# Task spec / Handoff — Shared real-occurrence dataset (T1 Phase 5, T3, T4, T5)

- **Role stage:** Implementer (complete)
- **Date:** 2026-10-02
- **Status:** **COMPLETE with reported shortages.** The one frozen sampling run has executed; the dataset is frozen and hashed.
- **Product code changed:** none. `git status --porcelain -- src release scripts/lookup` is empty; the only tracked modification is `.gitignore` (the amendment-8 ignore rule).

## Frozen dataset

| Field | Value |
|---|---|
| `occurrences.jsonl` | **543** rows, 720,927 bytes |
| sha256 | `63d148b51657c8d325f822782a9eed31a8077f049a9522b3c564554916ef4209` |
| `datasetVersion` | 1.0.0 |
| `samplingRuleVersion` | 3.0.0 |
| `seed` | `0x5eed1eaf` |
| selftest gate | **38/38** assertions **PASS** before each run (33 original + 5 added for the `context` window) |
| determinism | byte-identical `occurrences.jsonl` across 2 consecutive runs of the same code |

> The sha256 above supersedes an earlier value: the `context` defect fix (§8.7 of
> `SOURCE.md`) re-emitted the JSONL, so its hash necessarily changed. All 6 artifact
> hashes in `dataset-manifest.json` verify against the files on disk.

## Outcome

**Diagnostic (7 T1 lemmas) — 5/7 reach the minimum of 5:**

| Lemma | n | Notes |
|---|---|---|
| world | 10 | |
| light | 10 | |
| withdraw | 10 | |
| omen | 6 | |
| lucent | 5 | 4 primary + 1 secondary (tier-2 rescue) |
| nescience | 4 | **shortage** — 3 primary + 1 secondary; only 10 corpus-wide hits exist |
| sporty | 0 | **shortage** — 0 raw hits across all 344 primary **and** 56 secondary documents |

**Control (14 lemmas):** 12 at 10 occurrences, `ape` at 8, `counterargument` 0 (pre-declared shortage).

**Stratum C (binding precision):** n=200 sampled from an inventory of 50,986 lemmas across 12 design cells, **370** occurrences yielded after dropping 1 cross-stratum repeat, worst-case 95% half-width 0.0693; 62 sampled lemmas yielded no occurrence.

Shortages were **reported, never padded**, per the spec.

## Acceptance criteria status

| Criterion | Status |
|---|---|
| Source + license/access basis documented **before** sampling | **PASS** — `SOURCE.md` v2, written before any occurrence was collected |
| All diagnostic lemmas ≥5 occurrences where available, shortages reported | **PARTIAL** — 5/7 met; `nescience`=4 and `sporty`=0 reported, not padded |
| The 4 prior `VALID_SENSE_PASS` cases in the control stratum | **PASS** — the 4 occurrence surfaces span 3 lemmas (`counterargument`+`counterarguments`, `attempt`→`attempt`, `account for`); all 3 lemmas are in `roster.json` and 2 of 3 were sampled, `counterargument` being the reported shortage |
| Additional controls stratified by POS/frequency | **PASS** — 11 further controls over 7 POS × candidate-count bands, plus Stratum C (n=200) |
| Resolver-known examples excluded or explicitly marked | **PASS** — 0 full-match exclusions, 5 anchor-marked and kept |
| Dataset reproducible and frozen | **PASS** — all artifact sha256 verified against the manifest; 2 runs byte-identical |
| No product dictionary/resolver/alignment/data changes | **PASS** — verified via `git status --porcelain` |

## What exists (all new, untracked)

| File | Size | Purpose |
|---|---|---|
| [SOURCE.md](../../data/occurrences/SOURCE.md) | 7 KB | **Freeze step 1.** Corpus choice, license/access basis, resolver-consumption analysis, rule freeze |
| [corpus-manifest.json](../../data/occurrences/corpus-manifest.json) | 165 KB | 344 documents, per-doc words/authors/buckets |
| [pool.json](../../data/occurrences/pool.json) | 50 KB | Frozen document IDs + cache paths |
| [resolver-seen-index.json](../../data/occurrences/resolver-seen-index.json) | 33 MB | lemma → resolver evidence strings (for `resolver_seen`) |
| [roster.json](../../data/occurrences/roster.json) | 11 KB | **Freeze step 3.** 21 lemmas, banded, with measured yields |
| [build_occurrence_corpus.mjs](../../scripts/build_occurrence_corpus.mjs) | — | Builds pool + manifest |
| [build_resolver_seen_index.mjs](../../scripts/build_resolver_seen_index.mjs) | — | Builds the `resolver_seen` index |
| [build_occurrence_roster.mjs](../../scripts/build_occurrence_roster.mjs) | — | Builds the roster |

`tmp/corpus-cache/*.txt` holds the cached Gutenberg bodies (344 files) and is the sampler's input.

## Frozen source (step 1 — already decided, do not change)

**Project Gutenberg, 344 English books** — `SOURCE.md` records the exact selection rule, why it fits (pre-1900 prose, no dependency the resolver reads, no resolver overlap), and the public-domain basis.

Key finding recorded in `SOURCE.md`: **the resolver consumes no Gutenberg text.** Its evidence comes only from WordNet/Skypedia example strings, so no Gutenberg sentence can collide with resolver evidence by origin. `resolver-seen-index.json` still exists as a positive check, not a formality.

## Frozen roster (step 3 — already frozen, do not change)

7 diagnostic + 14 control. Diagnostic = all 7 T1 lemmas. Control = 4 prior `VALID_SENSE_PASS` surfaces + 10 stratified picks.

Band = `POS | many|some`, where POS is WordNet-derived and `many` = ≥2 synsets.

```
diagnostic  lucent        adjective|some      syn=1    hits=11
diagnostic  nescience     noun|some           syn=1    hits=9
diagnostic  omen          noun|many           syn=2    hits=174
diagnostic  sporty        adjective|many      syn=3    hits=0     <-- expected shortage
diagnostic  world         noun|many           syn=9    hits=15230
diagnostic  light         adjective|many      syn=47   hits=10007
diagnostic  withdraw      verb|many           syn=12   hits=362
control    counterargument noun|some          syn=1    hits=0     <-- expected shortage
control    attempt        verb|many           syn=4    hits=2533  (surface variant: attempted)
control    account for    verb|many           syn=2    hits=411
control    balsam         noun|many           syn=3    hits=80
control    behalf         noun|many           syn=2    hits=528
control    astonishment   noun|some           syn=1    hits=442
control    confiscation   noun|some           syn=1    hits=89
control    ape            verb|many           syn=5    hits=94
control    array          verb|many           syn=6    hits=275
control    abominable     adjective|many      syn=2    hits=124
control    airy           adjective|many      syn=4    hits=205
control    ecstatic       adjective|some      syn=1    hits=70
control    eloquent       adjective|some      syn=1    hits=290
control    gaily          adverb|some         syn=1    hits=113
```

`attempt` is banded **verb**, not noun: the audit run selected a verb sense for the passing case, so the control must exercise that verb sense.

Two known shortages to **report, never pad**: `sporty` (0 hits in corpus) and `counterargument` (0 hits in corpus).

## Amendments compliance

| # | Amendment | Evidence |
|---|---|---|
| 1 | `auditExpected` (never gold); `goldSense`/`goldPos` empty in T0 | all 544 rows have `goldSense === "" && goldPos === ""`; `auditExpected` present on every row |
| 2 | `pos` never derived from the product pipeline | `posMethod` is only `surface-heuristic-v1` or `roster-declared`, both annotated "not the product pipeline" |
| 3 | `resolver_seen` excludes on full example-sentence match only; anchor overlap marks only | manifest `resolverSeenRule`; 0 exclusions, 5 `anchor` |
| 4 | Fixed seed, deterministic order, one run, funnel per lemma, 60% per-POS cap, per-author cap, near-dup dedupe | manifest `seed`, `caps`, `perLemma` funnels |
| 5 | Pre-declared secondary tier, used only when primary <5, tagged `source_tier` | exactly 2 occurrences tagged, both rescue cases |
| 6 | Multi-synset controls; `counterargument` kept as reported shortage; Stratum C with n and CI | `stratumC` block, n=200, half-width 0.0693 |
| 7 | Paragraph boundaries preserved; line-unwrapping documented; per-doc sha256 + retrieval date | manifest `normalisation`; every row carries `docSha256` and `retrievedAt` |
| 8 | Do not commit `resolver-seen-index.json` | `.gitignore` line 55; manifest records `committed: false` |
| 9 | No file deletions; terminal-loop guard; no C3/C4 classification | no deletions performed; C3/C4 not classified |

## Quality observations for consumers (T3/T4/T5)

1. **POS is a heuristic, not gold.** `posConfidence` is `high` on 439 rows, `medium` on 85, `declared` on 19. Use `goldPos`, not `pos`, as ground truth.
2. **One heuristic misfire was observed by spot-check** and is documented rather than silently corrected, because correcting it would require a second sampling run and the dataset must stay a single frozen run:
   - `occ-00459/00460/00461` `self-centred` tagged `verb`; all three are the
     predicate-adjective reading ("he was *self-centred*").

   The `mercenaries` rows (`occ-00372/00373/00374`, `mercenary`) are **not** a
   misfire: the lemma is genuinely multi-POS and the three rows split noun/adjective/
   noun, which is the variation the per-POS cap exists to preserve.

   These rows are otherwise valid. **This trade-off is deliberately retained for POS**:
   the POS tag feeds the per-POS acceptance cap, so changing it *would* change
   sampling, whereas `context` is computed after every acceptance decision and was
   therefore safe to repair. See §8.7 of `SOURCE.md`.
3. **17 rows begin with list numbering or an editorial marker** (e.g. `13. Which of them…`, `[22] "Write Man for Primula…"`). These are genuine corpus prose — encyclopaedia and legal volumes contain numbered lists — so they were kept as natural variation. Filtering them would have biased the sample toward narrative prose only.
4. **Near-duplicate dedupe is per-lemma, not global.** One sentence appears under two Stratum C lemmas (`cervical`, `neural`) because both come from the same zoological passage.
5. **Independence verified.** All 543 rows contain their recorded `surface` form; the 19 rows whose lemma head is absent are legitimate inflections (`withdrew`, `irrelevancies`, `aping`), not extraction errors.
6. **`context` is now a sentence-centred window.** `0` of 543 rows have a `context`
   that omits its own sentence (the pre-fix run had 188, i.e. 34.6%). Consumers can
   read `context` directly as the disambiguating evidence for the sentence.

## How to reproduce

```bash
node scripts/build_occurrence_dataset.mjs --selftest   # 38 assertions, must pass first
node scripts/build_occurrence_dataset.mjs              # the one frozen run
```

For a fixed seed and unchanged corpus sha256s the run reproduces `occurrences.jsonl`
byte-for-byte. Verified: two consecutive runs produced the identical sha256
`63d148b5…`. The sampler reads no clock, no `Math.random`, and no directory-listing
order; `loadTier` re-verifies each document's body sha256 and aborts on drift.

## Verification performed

| Check | Result |
|---|---|
| `--selftest` gate before each run | **PASS** (38/38) |
| JSONL sha256 recomputed vs manifest | **PASS** — exact match |
| All 6 artifact sha256 recomputed vs manifest | **PASS** — all match |
| Manifest parses as JSON | **PASS** |
| `goldSense`/`goldPos` empty on all rows | **PASS** (0 non-empty) |
| `auditExpected` present on all rows | **PASS** |
| `docSha256` + `retrievedAt` + `context` + `paragraphIndex` present on all rows | **PASS** |
| `context` contains its own sentence (all 543) | **PASS** — was 188/543 before the §8.7 fix |
| `context` respects the 600-char cap | **PASS** — 0 rows over |
| Accepted set unchanged by the `context` fix | **PASS** — byte-identical lemma/sentence/doc/paragraph keys vs the pre-fix run |
| Determinism | **PASS** — 2 consecutive runs, identical sha256 |
| Recorded `surface` present in its sentence (all 543) | **PASS** |
| Sampled `pos` within the roster's declared POS | **PASS** — 0 violations |
| Per-author cap within a stratum | **PASS** — max 2 (the cap) |
| `resolverSeenRule` exclusion path reachable | **PASS** — replay over the full index: 394,949 excluded / 96,967 anchor / 81,721 neither |
| `git status --porcelain -- src release scripts/lookup` | **PASS** — empty |
| `node --check` on `build_occurrence_roster.mjs` | **NOT RUN** — shell access denied for syntax checks; the final roster edit only changed string values and added one string property, and `--selftest` exercises the sampler's own syntax |

## Out of scope (unchanged, as instructed)

No C3/C4 classification. No product dictionary, resolver, alignment, or data changes.