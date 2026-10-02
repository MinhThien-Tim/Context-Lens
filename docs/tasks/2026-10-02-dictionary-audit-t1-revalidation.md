# T1 dictionary audit revalidation — Phases 1–4

ROLE                  Investigator (read-only — no resolver, dictionary, alignment, or data change made)
TASK                  Revalidate the dictionary-audit measurement (T1) and classify all current
                       failures through Phases 1–4. C3/C4 explicitly **not** finalized.
FINDINGS               The 64 failures split 47/4/6/7 by failure mechanism, but the **C bucket was
                       mis-framed**. A structural defect in the audit's expectation model —
                       `meaningsVi[0]` is a *positional* expectation over a flat lemma-level gloss list
                       — invalidates the raw metric's core assertion for every lemma with more than one
                       VI sense: 35.7% of the eligible corpus and **38.2% of the 736 passing rows**.
                       The 7 "C" failures are therefore measurement defects (B4), not proven sense
                       errors. A = 0. No C1–C4 verdict can be drawn from synthetic-only evidence.
STATUS                PASS — Phases 1–4 complete. C3/C4 NOT finalized (blocked on T0 real occurrences).

## Headline

| Class | Meaning | Count | % of 64 |
| --- | --- | ---: | ---: |
| **A** | VI/data-side defect | 0 | 0.0% |
| **B** | Audit/measurement defect | **64** | 100.0% |
| — B1 | `Xem <target>` stub expectation | 47 | 73.4% |
| — B2 | Terminal punctuation | 4 | 6.3% |
| — B3 | Gloss-fragment truncation | 6 | 9.4% |
| — B4 | Positional-expectation defect (**new**) | 7 | 10.9% |
| **C1–C4** | Sense-resolution error | **0 confirmed** | 0.0% |
| **C?-unresolved (synthetic-only)** | Undecidable without real occurrences | 7 | 10.9% |
| | **Total** | **64** | **100%** |

All seven former "C" rows are **reclassified from C to B4**. Zero product-data defects were found.
The seven remain the T0/T3 follow-up list, now for a *measurement* reason rather than a
sense-error reason.

## The structural finding (supersedes the earlier C framing)

`src/lookup/dictionary-coverage.audit.test.ts:37-43` builds the corpus like this:

```ts
const usable = pack.entries.filter(entry => entry.lemma && entry.meaningsVi[0] && ...
const sampled = Array.from({ length: count }, (_, index) => usable[Math.floor(index * step)])
  .map(entry => ({ surface: entry.lemma, lemma: entry.lemma,
                   meaningVi: entry.meaningsVi[0], definitionEn: entry.definitionEn || undefined,
                   expected: 'usable' }));
```

and asserts at **line 61**:

```ts
const correctMeaning = (!item.definitionEn || textEn.includes(item.definitionEn.toLocaleLowerCase()))
                    && (!item.meaningVi   || textVi.includes(item.meaningVi.toLocaleLowerCase()));
```

Three facts combine to break this assertion:

1. **There are no sense-level entries.** `tmp/expect-binding.mjs` shows `hasSensesArray: false`,
   `senseCount: 0` for all seven lemmas, and `senseLevelEntry: 0` across the whole pack. The
   `senses[]` array is not used by this pack at all.
2. **`meaningsVi` is therefore a flat, lemma-level list.** `viSenses[gi]` merely *indexes into it*
   (`src/lookup/dictionary/packs.ts:129-135`). So `meaningsVi[0]` is *"the VI gloss of whichever VI
   sense the VI dictionary listed first"* — a head-of-list artifact, not *"the VI meaning of the
   sense the resolver will select."*
3. **The assertion is only satisfiable by coincidence** whenever `viSenses.length > 1`, because the
   resolver's selected sense is determined by the English context while the expectation is pinned to
   VI sense index 0.

`tmp/positional-exposure.mjs` quantifies this over the 70,043 entries surviving the audit's own
filters:

| Entry shape | Count | % |
| --- | ---: | ---: |
| lemma-level, single VI sense (expectation is fair) | 40,443 | 57.7% |
| lemma-level, multiple VI senses (**expectation unsound**) | 24,971 | **35.7%** |
| sense-level (`senses[]` used) | **0** | 0.0% |
| *of which* the expectation is a `Xem <target>` stub | 4,629 | 6.6% |

`tmp/pass-exposure.mjs` bounds the effect on **passes**, which is what matters:

| Row outcome | Entry shape | Count |
| --- | --- | ---: |
| PASS | lemma-level, single VI sense | 447 |
| PASS | lemma-level, multiple VI senses | **281** |
| PASS | entry missing from pack | 8 |
| FAIL | lemma-level, single VI sense | 50 |
| FAIL | lemma-level, multiple VI senses | 14 |

**281 of 736 passes (38.2%) rest on an expectation bound to VI sense 0.** For those rows a pass proves
only *"the resolver picked the sense aligned to VI sense 0"* — never *"the VI output is correct."*
This is a floor: the line-37 filter also excludes stubs and morphology.

### Why this reclassifies all seven former C cases

Each of the seven is a lemma-level entry with >1 VI sense, so `meaningsVi[0]` names an arbitrary sense.
The audit demanded that arbitrary sense's VI gloss; the resolver returned a *different, semantically
coherent* sense whose VI was **correctly bound**:

| lemma | `meaningsVi[0]` (arbitrary) | VI sense 0 | selected sense | VI returned | owner VI sense | VI correct? |
| --- | --- | --- | --- | --- | --- | --- |
| `light` | "Nhanh nhẹn." | `76468[A]` | `wn3:v:00291873` "make lighter or brighter" | `soi sáng`, `chiếu sáng` | `423214` | ✅ |
| `lucent` | "Trong." | `141455[A]` | `wn3:a:00279332` "softly bright or radiant" | `sáng chói`, `sáng ngời` | `160407` | ✅ |
| `nescience` | "Thuyết không thể biết." | `159018[N]` | `wn3:n:05988743` "ignorance" | `sự không biết` | `203656` | ✅ |
| `omen` | "Điềm." | `254328[N]` | `wn3:v:00871942` (VERB) | `báo hiệu` | `254329` | ✅ |
| `sporty` | "Thể thao…" | `242490[A]` | `wn3:a:00956733` "sportsmanship or fair play" | `thẳng thắn` | `242491` | ✅ |
| `withdraw` | "Rút, rút lại." | `234651[V]` | `wn3:v:01994442` "pull back or move away" | `rút lui` | `419863` | ✅ |
| `world` | "Giới." | `132682[N]` | `wn3:n:09466280` "everything that exists anywhere" | `vũ trụ` | `224577` | ✅ |

`world` is the clean illustration: the resolver chose "everything that exists anywhere" and returned
`vũ trụ`; the same run binds `wn3:n:09270894` → `địa cầu` and `wn3:n:02472987` → `nhân loại`. All
three bindings are defensible. The audit failed the row because it wanted `"Giới."` — a single-word
gloss on VI sense 0 that can never carry meaning on its own.

## Phase 1 — Raw metric (immutable)

| Check | Result |
| --- | --- |
| Raw audit reproduces byte-identical | **PASS** (800 rows / 736 pass / 64 fail) |
| `dictionary-coverage.audit.test.ts` unmodified | **PASS** (empty `git diff`) |
| `alignment.ts`, `packs.ts`, `localLexeme.ts`, `service.ts`, `core/language/*` unmodified | **PASS** (empty `git diff`) |
| `scripts/audit_dictionary_coverage.mjs` unmodified | **PASS** |

Raw result retained verbatim at `tmp/audit-raw.json`. Env: `RUN_DICTIONARY_AUDIT=1`.

## Phase 2 — Corrected measurement (separate path)

`src/lookup/audit-corrected.diagnostic.test.ts` — env `RUN_AUDIT_CORRECTED=1`, gated by `it.skip`
without the flag. Implements all six required corrections (stub exclusion, case, terminal
punctuation, all-`meaningsVi` of the selected sense, fragment granularity, structural fallback
detection). It does **not** wrap, modify, or replace the raw path.

| Check | Result |
| --- | --- |
| Corrected audit runs; raw and corrected results both preserved | **PASS** |
| Headline counts | **PASS** — 31 pass / 769 fail |
| Raw audit path unmodified | **PASS** |

The corrected comparison (lines 134-138) uses **any** usable entry gloss as the expectation set and
matches against **any** gloss of the selected sense. The seven former C rows therefore **pass on their
own evidence** — the corrected pass is not circular.

## Phase 3 — Pass validity labels

Precedence applied exactly as specified: `FALLBACK_PASS` → `MEASUREMENT_PASS` →
`VALID_SENSE_PASS` → `VALID_ALTERNATIVE_GLOSS_PASS`. `contributing_factors` recorded separately and
never treated as a causal claim.

| Label | Count | Passes on raw? | Passes on corrected? |
| --- | ---: | ---: | ---: |
| `FALLBACK_PASS` | 778 | 732 | 9 |
| `MEASUREMENT_PASS` | 18 | 0 | 18 |
| `VALID_SENSE_PASS` | 4 | 4 | 4 |
| `VALID_ALTERNATIVE_GLOSS_PASS` | 0 | 0 | 0 |

- `FALLBACK_PASS` (778) — the pass depends on whole-lemma fallback, so it never proved selected-sense VI. 732 of these pass under raw semantics; the remaining 46 are raw failures whose only usable VI is the whole-lemma fallback, and 9 of them additionally satisfy the corrected comparison.
- `MEASUREMENT_PASS` (18) — the pass exists **only** because the corrected comparison normalized/fixed the expectation; all 18 are raw failures, and all 18 flip to pass under the corrected measurement. By failure class they are B3 = 6, B4 = 7, B2 = 4, B1 = 1 (`domesticize`) — i.e. exactly the cases the corrected comparison repairs. These 18 are the entire raw→corrected ledger delta (31 corrected passes = 18 + 9 `FALLBACK_PASS` + 4 `VALID_SENSE_PASS`).
- `VALID_SENSE_PASS` (4) — the selected sense carries a matching usable VI gloss under raw semantics; these are the only passes that prove selected-sense VI without any corrected-measurement help.
- `VALID_ALTERNATIVE_GLOSS_PASS` (0) — no pass was validated only by an alternative gloss of the same sense.

Note the asymmetry that makes this ledger coherent: **only 4 of 800 occurrences (0.5%) prove selected-sense VI without measurement repair.** The labels sum to 800 because every occurrence — passing or failing — receives exactly one.

## Phase 4 — Failure classification

| Sub | Mechanism | Count | % |
| --- | --- | ---: | ---: |
| B1 | `Xem <target>` stub expectation | 47 | 73.4% |
| B2 | Terminal punctuation | 4 | 6.3% |
| B3 | Gloss-fragment truncation | 6 | 9.4% |
| B4 | Positional-expectation defect (new sub-class) | 7 | 10.9% |
| | **Total** | **64** | **100%** |

### B1 latent VI condition — a second, independent defect (new)

`tmp/stub-latent.mjs` cross-checked the 47 stub rows for a *second* cause:

| Bucket | Count | Meaning |
| --- | ---: | --- |
| `noCandidates` | 40 | No English candidate at all → B1 is the sole cause. |
| `candidatesAllViLess` | 6 | A candidate exists but carries no VI → **latent data gap**. |
| `hasViBearing` | 0 | — |
| `viMatchedAUsableExpectation` | 1 | `domesticize` — VI present and correctly bound (`khai hoá` on `wn3:v:00302130`). |

The 6 `candidatesAllViLess` rows (`tmp/stub-latent-full.txt`) each have exactly **one** VI sense,
`glossIndex: 0`, whose gloss *is* the stub — so `resolveVietnamese` never yields a usable VI and the
aligner cannot bind it:

| lemma | stub | VI sense | candidate | VI |
| --- | --- | --- | --- | ---: |
| `basinal` | `Xem basin` | `399700[A]` | `wn3:a:02660065` "of or relating to a basin" | 0 |
| `blastemal` | `Xem blastema` | `411940[A]` | `wn3:a:03049812` "of or relating to blastemata" | 0 |
| `calcitic` | `Xem calcite` | `400189[A]` | `wn3:a:02674530` "of or relating to or containing calcite" | 0 |
| `carnally` | `Xem carnal` | `400345[D]` | `wn3:r:00430447` "in a carnal manner" | 0 |
| `dermatological` | `Xem dermatology` | `402701[A]` | `wn3:a:02916230` "of or relating to or practicing dermatology" | 0 |
| `protozoologist` | `Xem protozoology` | `413630[N]` | `wn3:n:10486236` "a zoologist who studies protozoans" | 0 |

Their **primary** class remains B1 (the expectation is the defect), but they carry a real data-side
consequence and must be excluded from any "sense-level VI coverage is healthy" claim. This finding is
new in this report.

### C-family — all 7 now `C?-unresolved (synthetic-only)`

Every one has `contextMatch: false`, `semanticMargin: "Semantic margin: 0"`, and the
non-discriminating frame `The selected expression is <lemma>.` Their `contextMatch: false` is an
artifact of the frame, not evidence about the sense. All seven pass on their own VI evidence.

| lemma | candidates | VI-bearing | VI-less | POS set | selected sense | `kind` | `status` |
| --- | ---: | ---: | ---: | --- | --- | --- | --- |
| `light` | 47 | 1 | 46 | verb/noun/adj/adv | `wn3:v:00291873` | inferred | ambiguous |
| `lucent` | 1 | 1 | 0 | adjective | `wn3:a:00279332` | inferred | common |
| `nescience` | 1 | 1 | 0 | noun | `wn3:n:05988743` | inferred | common |
| `omen` | 2 | 1 | 1 | verb, noun | `wn3:v:00871942` | inferred | common |
| `sporty` | 3 | 2 | 1 | adjective | `wn3:a:00956733` | inferred | ambiguous |
| `withdraw` | 12 | 1 | 11 | verb | `wn3:v:01994442` | inferred | ambiguous |
| `world` | 9 | 3 | 6 | noun, adjective | `wn3:n:09466280` | inferred | ambiguous |

All seven are `pairingState: paired`, `alignmentKind: inferred`, `contextMatch: false`. Because the
frame is non-discriminating, **no C3 or C4 claim is made** — distinguishing "resolver chose the wrong
candidate" from "candidates are genuinely ambiguous" requires a context that actually favours one.

## Required investigation — `accruement` mechanism

**RESOLVED.** `src/lookup/dictionary/alignment.ts:57-71` was read in full, together with
`src/core/language/sense-meanings.ts`. The earlier claim that "the first fragment survives" is
**wrong and is retracted**. The aligner does not truncate to the first fragment; it **splits** the
gloss on `/ ; ·` (sense-meanings) and `, ; /` (alignment), keeps only fragments that are anchor-eligible
(`split(' ').length >= 2 && length >= 6`, line 57) and come from a **matched single** `source` VI sense
with `>= 2` supporting anchor terms (lines 66-71).

`accruement` therefore fails on the **support gate**, not on a "first fragment wins" rule:

- expected `"Sự dồn lại, sự tích lại."`; returned `["sự tích lại"]`.
- `"sự dồn lại"` **is** anchor-eligible, but its support-term count fell below 2, so it was dropped;
  `"sự tích lại"` passed. Both belong to the same VI sense.

This is a **B3 fragment-truncation** case (measurement defect), not a data error. The same mechanism
explains B2 and the B4 rows.

## Retractions of the prior report

`docs/tasks/2026-10-02-dictionary-audit-failure-classification.md` contains four claims that are now
**superseded**:

1. **`C3 = 0`** — withdrawn. No C3 was re-derived; all 7 are `C?-unresolved`.
2. **C1/C2 verdicts for `lucent`, `nescience`, `omen`, `sporty`** — withdrawn. They rested on the
   gloss-index heuristic, which the structural finding above refutes.
3. **`tmp/c-verdict.json` ×7 C1 claim** — **invalid**, retained as evidence of a corrected error: that
   probe conflated `viSenses` IDs with English WordNet offsets, two disjoint namespaces
   (`src/lookup/localLexeme.ts:46-48`: "do not share sense IDs"; binding is by gloss content).
4. **`withdraw` as the strongest real-error candidate** — **retracted**. The gate evidence is
   symmetric across all seven; `withdraw` is not special.

Also corrected: shipped WordNet is **3.0**, not 3.1, and `viSenses[1]` is the **VI source
dictionary's** POS (`"N"`/`"V"`/`"A"`/`"D"`) while English candidates use
`noun`/`verb`/`adjective`/`adverb`. Comparing the two namespaces directly silently yields zero
matches — this caused a real CODE failure in `tmp/cb4.mjs` run 1, corrected in run 2.

## T0 lemma list — real occurrences required

For T0 to build a shared occurrence set. All seven use the non-discriminating frame
`The selected expression is <lemma>.` and must be re-run with real occurrences before any C3/C4 verdict.

| lemma | selected sense | VI-bearing candidates | VI-less candidates | decidable without real occurrences? |
| --- | --- | --- | ---: | --- |
| `light` | `wn3:v:00291873` | `wn3:v:00291873` | 46 | **No** — 47 candidates, margin 0 |
| `lucent` | `wn3:a:00279332` | `wn3:a:00279332` | 0 | **No** — single candidate, but the correct sense is inferable only from the VI gloss |
| `nescience` | `wn3:n:05988743` | `wn3:n:05988743` | 0 | **No** — single candidate; VI sense 0 (`Thuyết không thể biết.`) and sense 1 (`Sự không biết.`) are both defensible readings of "ignorance" |
| `omen` | `wn3:v:00871942` | `wn3:v:00871942` | 1 (`wn3:n:07286368`) | **Partly** — POS mismatch (noun entry, verb selected) is a real signal, but the frame does not justify a noun reading |
| `sporty` | `wn3:a:00956733` | `wn3:a:00956733`, `wn3:a:00407420` | 1 (`wn3:a:00033475`) | **Partly** — `wn3:a:00033475` "appropriate for sport" matches VI sense 0 |
| `withdraw` | `wn3:v:01994442` | `wn3:v:01994442` | 11 | **No** — 12 verb candidates, margin 0 |
| `world` | `wn3:n:09466280` | `wn3:n:09466280`, `wn3:n:09270894`, `wn3:n:02472987` | 6 | **Partly** — 3 VI-bearing noun candidates are all defensible for a bare "world" |

**Suitable for the later T3 real-error sense audit: all 7.** They are the only rows where a genuine
sense-selection question remains open, and all 7 currently pass on VI correctness — so T3 would test
*context disambiguation*, not translation accuracy. `omen` and `sporty` have the strongest case
(only 2 and 3 candidates respectively, and an identifiable alternative that matches VI sense 0).
`light` (47 candidates) and `withdraw` (12) are the weakest — margin 0 with no discriminating frame
means T3 is unlikely to move them.

**Not suitable for T3:** the 47 B1 rows (expectation defect), the 4 B2 and 6 B3 rows (measurement
defect, already pass corrected), and the 6 latent-gap rows from the B1 table above — those are a
**dictionary-data** follow-up (stub-only VI senses), not a sense-resolution question.

## Retained diagnostic artifacts

All under gitignored `tmp/` — retained deliberately, not cleaned up.

| Artifact | Purpose |
| --- | --- |
| `tmp/audit-raw.json` | Phase 1 immutable raw metric |
| `tmp/audit-corrected.json`, `tmp/audit-summary.json` | Phase 2/3 corrected run + headline counts |
| `tmp/failure-mechanisms.json` | 64-row mechanism decomposition |
| `tmp/expect-binding.mjs` → `.txt` | **The structural proof** — entry shape, no `senses[]` |
| `tmp/positional-exposure.mjs` → `.txt` | 35.7% corpus exposure |
| `tmp/pass-exposure.mjs` → `.txt` | **38.2% of passes affected** |
| `tmp/stub-latent.mjs` → `.txt`, `tmp/stub-latent2.mjs` → `.txt`, `tmp/stub-latent-full.mjs` → `.txt` | B1 latent VI condition |
| `tmp/remap-check.mjs` → `.txt` | Confirms raw `viSenses` == runtime view (no `Xem` stub in any of the 7) |
| `tmp/cb3.mjs` → `.txt` | VI-sense-identity reachability (`reached: false` for all 7) |
| `tmp/cb4.mjs` → `.txt` | Aligner-gate replication (anchor eligibility / ≥2 support terms) |
| `tmp/review-sample.mjs` → `.txt` | Representative samples per class + T0 list |
| `tmp/cclassify.mjs` → `tmp/c-verdict.json` | **Known-invalid probe**, retained as evidence of a corrected error |
| `tmp/verify-report.mjs` → `.txt`, `tmp/verify-labels.mjs` → `.txt`, `tmp/verify-mp.mjs` → `.txt` | Post-write re-verification of every numeric claim in this report against the artifacts |

Audit tooling: `src/lookup/dictionary-coverage.audit.test.ts` (`RUN_DICTIONARY_AUDIT=1`, unmodified),
`scripts/audit_dictionary_coverage.mjs` (unmodified), `src/lookup/audit-corrected.diagnostic.test.ts`
(`RUN_AUDIT_CORRECTED=1`), `src/lookup/audit-raw.diagnostic.test.ts` (`RUN_AUDIT_RAW=1`).

## Verification summary

| Check | Label |
| --- | --- |
| Raw audit reproduces byte-identical (800 / 736 / 64) | **PASS** |
| Raw audit + production source unmodified (empty `git diff`) | **PASS** |
| Corrected audit separate, both results preserved (31 / 769) | **PASS** |
| Phase 3 labels emitted, exactly one per pass (778 / 18 / 4 / 0) | **PASS** |
| All 64 failures classified | **PASS** |
| No C4 claim from synthetic-only evidence | **PASS** |
| `accruement` explained from code evidence | **PASS** |
| T0 lemma list produced | **PASS** |
| Diagnostic artifacts retained | **PASS** |
| `typecheck` / `verify:*` | **NOT RUN** — investigation only; no production change |
| C3 / C4 finalization | **NOT RUN** — blocked on T0 real occurrences by design |

## Recommended follow-up (not performed — out of scope for this read-only task)

1. **Do not trust the 736 raw passes as-is.** 281 of them validate against VI sense 0 rather than the
   selected sense. Any coverage claim built on the raw audit is overstated.
2. **The audit's expectation model is the defect, not the dictionary.** Making the expectation
   sense-conditional (or accepting any VI gloss of the selected sense, as the corrected path does)
   resolves B4 and would remove all 7 C-family rows without touching the resolver or the pack.
3. **The 6 stub-only VI senses are a real dictionary gap** and are the only A-class-flavoured finding
   in this report — worth a separate, explicitly scoped task.

## Revision log

- **2026-10-02** — Initial Phase 1–4 revalidation. Reclassified all 7 former C rows to **B4**
  (positional-expectation defect) and identified the exposure as 35.7% of the eligible corpus and
  38.2% of passing rows. Identified the B1 latent VI condition (6 lemmas). Retracted four claims
  from the 2026-10-02 classification report. C3/C4 deliberately left un-finalized.
- **2026-10-02** — Post-write verification pass (`tmp/verify-*.mjs`). Two draft figures were wrong and
  are corrected: `MEASUREMENT_PASS` is **18**, not 4 (778 / 18 / 4 / 0), and its composition is
  B3 = 6, B4 = 7, B2 = 4, B1 = 1. All other numeric claims in this report re-verified true against
  `tmp/audit-raw.json`, `tmp/audit-corrected.json`, `tmp/audit-summary.json`, and
  `tmp/failure-mechanisms.json`.