# T2 (preliminary) — Dictionary audit history and CI execution evidence

- **Date:** 2026-10-02
- **Role:** Investigator (read-only)
- **Status:** **PRELIMINARY — final historical classification DEFERRED**
- **HEAD at investigation:** `02519a9d5e0f7726e2f5835753dc065b427f15e6` — 2026-10-02 13:01:09 +0700, *Dictionary audit failure classification*. Working tree clean.
- **Last CI-validated commit:** `b8d21c9` (quality-gate run #13)

> **Deferral statement.** Nothing in this document is classified as REGRESSION, BASELINE or
> UNVERIFIED. Every entry below is a **fact or a revision**, recorded so it can be compared against
> the T1/T3/T4/T5 measurement **after that measurement is frozen**. No product, data, config or CI
> change was made.

## 1. CI execution evidence

### (a) Is `RUN_DICTIONARY_AUDIT` set in CI? — **No.**

The string appears in exactly two files repo-wide:

| File | Role |
| --- | --- |
| `scripts/audit_dictionary_coverage.mjs` | sets `RUN_DICTIONARY_AUDIT='1'` for the child process it spawns |
| `src/lookup/dictionary-coverage.audit.test.ts` | reads it to decide `it` vs `it.skip` |

Neither [quality-gate.yml](../../.github/workflows/quality-gate.yml) nor
[secret-scan.yml](../../.github/workflows/secret-scan.yml) mentions it. `secret-scan.yml` is
Gitleaks 8.24.2 only and is irrelevant to the audit.

A second gate exists and is **fully orphaned**: `RUN_AUDIT_RAW` is referenced only by its own
definition in [audit-raw.diagnostic.test.ts](../../src/lookup/audit-raw.diagnostic.test.ts:70). No npm
script, no CI reference, no doc reference. It is the natural hook for the T1/T3/T4/T5 measurement,
but nothing invokes it today.

### (b) Does the audit execute, or is it skipped? — **Skipped.**

`vite.config.ts:69` includes `src/**/*.test.{ts,tsx}`, so both audit files are always *collected* by
`vitest run`. The env-var ternary — `(enabled ? it : it.skip)` — is what leaves them skipped.

`verify:full` = `verify:contracts && typecheck && vitest run && build`. Step-level evidence from two
real runs (full job detail fetched from the Actions API):

| Run | Date | Conclusion | Steps |
| --- | --- | --- | --- |
| `36960486873` | 2026-10-02 | success | checkout → setup-Node 22 → `npm ci` → **single** `Verify contracts, types, tests, build, and bundle budget` step running `npm run verify:full` |
| `36594935080` | 2026-09-29 | failure | identical step list; failure is inside `verify:full`, **not** an audit step |

Neither run contains an audit step. The only path that executes the audit is a manual
`npm run audit:dictionary`.

### (c) Is the job/check required? — **UNVERIFIED** (stated as a limit, not a finding).

| Probe | Result |
| --- | --- |
| `GET /branches/main/protection` | **401 Unauthorized** (unauthenticated) |
| `list_branches` for `main` | `"protected": false` |
| Run triggers across all 13 runs | `push` only — **zero** `pull_request` runs |

Required-check enforcement cannot be determined with available tooling. Honest statement: **no
evidence of required status checks; branch reported unprotected.** This is recorded as UNVERIFIED and
must not be read as "not required".

### Full run history — 13 runs, all `push`, all `main`, single job `Quality gate`

| # | Date | Conclusion | SHA |
| --- | --- | --- | --- |
| 13 | 2026-10-02 | success | `b8d21c9` |
| 12 | 2026-10-01 | success | `bbc918e` |
| 11 | 2026-10-01 | success | `3239559` |
| 10 | 2026-09-30 | success | `68d6ed3` |
| 9 | 2026-09-30 | success | `79f843c` |
| 8 | 2026-09-30 | success | `d92d567` |
| 7 | 2026-09-29 | **failure** | `0d69555` |
| 6 | 2026-09-29 | **failure** | `3c1e559` |
| 5 | 2026-09-29 | **failure** | `181e4b6` |
| 4 | 2026-09-29 | **failure** | `9474b99` |
| 3 | 2026-09-29 | success | `44f14b5` |
| 2 | 2026-09-29 | success | `8757a87` |
| 1 | 2026-09-29 | **failure** | `6aa661d` |

All five failures occurred in the `verify:full` step. **The dictionary audit has never contributed a
CI signal**, before or after CI existed. Every run predates the local tree's current commit — no run
has exercised `02519a9`.

## 2. Dated change timeline

| Date | Revision | Relevance |
| --- | --- | --- |
| 2026-09-19 | `9d3cbf1` | **Initial commit.** `packs.ts`, `release/dictionary`, `wordnet.ts` lineage, and `Xem ` stub data all originate here. |
| 2026-09-20 | `e2094cb` | `wordnet.ts` created; `wordnet-3.0` label introduced. **First** of only two `release/wordnet/` changes. |
| 2026-09-21 | `ad01f67`, `62e1a9a` | Inflected-word resolution; `packs.ts` touched. |
| 2026-09-22 | `58d9c98` *improve dictionary* | **Single origin commit for all audit-critical artifacts:** `RUN_DICTIONARY_AUDIT`, the `0.99` accuracy threshold, `scripts/audit_dictionary_coverage.mjs`, `dictionary-coverage.audit.test.ts`, the `wordnet-3.0` label change, and `Xem ` stub data. `package.json` touched. |
| 2026-09-24 | `e24951e`, `75497f9` | OCR commits touching `Xem ` content (incidental). |
| 2026-09-27 | `278e8f8` *Refine pipeline + docs* | **Origin of `resolveVietnamese`** — the `Xem <target>` dereference (`^Xem ([a-z][a-z' -]*)\.?$`, depth 2, cycle-guarded). |
| 2026-09-27 | `f9f1b33` | `ALIGNMENT_VERSION` introduced as `'bilingual-alignment-2'`. |
| 2026-09-27 | `6004bb1` | `alignment.ts` created; touched `packs.ts`, `wordnet.ts`, `release/dictionary`, `Xem ` data. **Second and last** `release/wordnet/` change. |
| 2026-09-27 | `ac32c5b` | `bilingual-alignment-2` → `-3`. |
| 2026-09-27 | `4befe6d`, `58d9c98` | Audit test doc refinements. |
| 2026-09-27 | `84852fc` *fixtures* | The **only** other commit matching `0.99` — and it is fixture/PDF data (`e2e/fixtures/…`, `src/styles.css`), **not** the threshold. The threshold line's history is exclusively `58d9c98`. |
| 2026-09-27 | `a97be1e` | Earliest workflow commit (pre-commit-hook / secret-scan lineage). |
| 2026-09-28 | `1dbe7d6` | *Stabilize sense resolution* (alignment internals). |
| 2026-09-28 | `01ac2bda` | `bilingual-alignment-3` → `-4`; *Curate*. Creates the reviewed overlay and touches `Xem ` data. |
| 2026-09-29 | `6aa661d` | **Introduces `quality-gate.yml`** and `verify:contracts`, wired into `verify:full`. Same-day run #1 failed. |
| 2026-09-29 | `88998d2` | Adds `check:css`; verification-script changes. |
| 2026-09-30 | `ff15bda` | Latest change to the audit test and to `release/dictionary` + `Xem ` stub data. |
| 2026-10-02 | `b8d21c9` | *fix: add background color to pdf-canvas*. Last CI-validated commit (run #13). |
| 2026-10-02 | `02519a9` | Dictionary audit failure classification doc. Never run through CI. |

### `ALIGNMENT_VERSION` progression (full diff-confirmed)

```
f9f1b33 (2026-09-27)  + 'bilingual-alignment-2'
ac32c5b (2026-09-27)  - 'bilingual-alignment-2'  →  + 'bilingual-alignment-3'
01ac2bd (2026-09-28)  - 'bilingual-alignment-3'  →  + 'bilingual-alignment-4'
```

### `meaning_vi`

Present in 19 commits from `9d3cbf1` through `f9caa72`; substantively touched by `278e8f8`,
`485c360` (*New pipeline*), `6004bb1`, `3490a22`, `034d0f4`, `94724f5`, `f9caa72` (*Reranking*).

### WordNet version and data — **premise corrected**

The failure-classification document (§"Offsets are never joined", lines 120-124) asserts that resolver
candidate IDs are **WordNet 3.1** while pack `viSenses` offsets are 3.0, that none of the pack offsets
exist in the shipped packs, and that `sources.english: 'wordnet-3.0'` is therefore a labelling
inaccuracy. **Direct verification contradicts this on every point.**

| Claim | Verification |
| --- | --- |
| Packs are WordNet 3.1 | **False.** `release/wordnet/manifest.json`: `"source": "…/3.0/WNdb-3.0.tar.gz"`, `"version": "3.0"`. Every pack file reports `version: "3.0"`, `formatVersion: 2`. `wordnet.ts:24` **rejects** any pack with `version !== '3.0'`. `wordNetVersion()` returns `wordnet-3.0-format2:…`. |
| Resolver IDs are 3.1 | **False.** `00279332` (the `lucent` candidate in the classification doc) **exists** in the shipped adj pack — `synsets[1558] = ["00279332", ["aglow","lambent","lucent","luminous"], …]`. `05988743` (`nescience`) and `07286368` (`omen`) likewise **exist** in the shipped noun pack. |
| All adj offsets are 8-digit | **Confirmed.** All 18 156 adjective offsets are 8 characters. |
| Pack `viSenses` offsets are 6-digit WordNet offsets | **False.** `141455`, `160407`, `159018`, `203656` are 6-digit and are **not present** in any shipped pack — because they are **not WordNet offsets at all**. Per `scripts/build_dictionary_pack.py:66`, `viSenses[0]` is `d.id`, the integer primary key of the upstream Skypedia SQLite **definitions** table. |
| `sources.english: 'wordnet-3.0'` is a mislabel | **False.** The served data *is* WordNet 3.0, so the label is accurate. |

**Corrected statement of the systemic fact.** The resolver synthesises IDs as
`wn3:${pack.pos}:${offset}` from WordNet **3.0** synset offsets. The pack's `viSenses[0]` values come
from an unrelated upstream database row-id space. **The two ID spaces were never in the same
namespace, so offset identity could never have joined them** — not because of a version skew, but
because they are different identifiers. `wordnet.ts` has no code path that consumes `viSenses[0]` as
an offset; `packs.ts:130-136` uses it only as an opaque sense key. VI↔EN binding is done entirely by
`alignBilingualSenses`'s `inferred` path (POS + grammar + anchor-gloss support).

This correction matters for the frozen baseline: recording a "3.0 vs 3.1 data skew" would attribute
the C-class failures to a data-version regression that **did not occur**. The C-class cause is
architectural and has been constant since `6004bb1` (2026-09-27).

### WordNet payload stability — the key asymmetry

| Asset | Changes in repo lifetime | Last changed |
| --- | --- | --- |
| `release/wordnet/` | **2** (`e2094cb`, `6004bb1`) | 2026-09-27 — **5 days** before `HEAD` |
| `release/dictionary/` | 7 | 2026-09-30 (`ff15bda`) |
| `ALIGNMENT_VERSION` | 4 iterations in 2 days | 2026-09-28 |
| `quality-gate.yml` | introduced 2026-09-29, +1 change | 2026-09-29 |

The English payload has been **frozen for 5 days and has changed only twice ever**, while the
alignment algorithm churned through four versions and the dictionary pack changed seven times. Any
VI-side delta therefore originates in `release/dictionary` or the alignment algorithm, **not** in
WordNet. This narrows the comparison surface for the eventual baseline.

## 3. Revisions required for the final baseline comparison

When T1/T3/T4/T5 freeze the measurement, compare against:

1. **Threshold provenance** — `58d9c98` (2026-09-22) introduced `0.99` and `RUN_DICTIONARY_AUDIT`
   together. They have never changed independently; the gate did not exist before that commit.
2. **Gate introduction** — `6aa661d` (2026-09-29) created CI. Audit and CI never overlapped before
   that date, so no commit before 2026-09-29 could have produced an audit signal.
3. **`Xem` dereference provenance** — `278e8f8` (2026-09-27) created `resolveVietnamese`. The audit
   reads raw pack JSON and never triggers it. Any B1-class difference must therefore be attributable
   to `release/dictionary` data changes (`ff15bda`, 2026-09-30), not to code.
4. **WordNet floor** — payload unchanged since `6004bb1` (2026-09-27). No English-side regression is
   possible for any measurement taken at `HEAD`.
5. **Alignment floor** — `ALIGNMENT_VERSION` is `'bilingual-alignment-4'` since `01ac2bd`
   (2026-09-28). It participates in the cache key, so any measurement must record it explicitly.
6. **Last CI-validated revision** — `b8d21c9`. `02519a9` has never been through CI.
7. **The orphaned `RUN_AUDIT_RAW` gate** — currently unreferenced by any script or workflow. If the
   T1/T3/T4/T5 measurement is produced through it, that invocation must be recorded as a new
   entrypoint, not as a pre-existing one.

## Verification

| Check | Result |
| --- | --- |
| Workflow configuration read directly from both workflow files | PASS |
| Job/step detail fetched from the Actions API for one success and one failure run | PASS |
| All 13 runs enumerated with SHA and conclusion | PASS |
| `RUN_DICTIONARY_AUDIT` / `RUN_AUDIT_RAW` repo-wide occurrence check | PASS |
| WordNet version premise re-verified against `manifest.json`, pack headers, and live offset lookups | PASS |
| `ALIGNMENT_VERSION` progression confirmed from full diffs | PASS |
| Branch-protection required-check status | **UNVERIFIED** — 401 unauthenticated; `protected: false`; zero `pull_request` runs |
| REGRESSION / BASELINE classification | **DEFERRED** pending frozen T1/T3/T4/T5 measurement |
| Product / data / CI changes | NOT RUN — read-only investigation |

---

Related: [`2026-10-02-prototype-key-safety-audit.md`](./2026-10-02-prototype-key-safety-audit.md) ·
[`2026-10-02-dictionary-audit-failure-classification.md`](./2026-10-02-dictionary-audit-failure-classification.md) ·
[verification-map.md](../verification-map.md)