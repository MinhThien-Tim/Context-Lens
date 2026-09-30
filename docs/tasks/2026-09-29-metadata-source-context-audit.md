# Metadata source & context gap audit

ROLE                  Planner handoff (planning only — do not implement)
TASK                  Determine whether current unresolved sense-resolution failures in Context Lens
                       are caused by missing lexical metadata or by insufficient sentence/paragraph
                       context, and decide whether VerbNet, Open English WordNet (OEWN), both, or
                       neither should proceed.
FINDINGS               See "Planner findings" below. All numbers were measured in this repository on
                       2026-09-30; the pilot source probes were deleted after measurement.

## Planner findings

These are the measured facts this plan is built on. Re-measure rather than trust them blindly.

| # | Finding | Evidence |
| --- | --- | --- |
| F1 | **Every PWN3 verb synset already carries frames.** `release/wordnet/wordnet-verb.json`: 13,767 of 13,767 verb synsets have a non-empty `frames` list. Frame-based evidence is therefore *not* a gap. | probe of `wordnet-verb.json` |
| F2 | **Examples are nearly complete for the pilot verbs.** `run` 41 senses / 5 without examples; `mean` 7/0; `consider` 9/1; `think` 13/0; `take` 42/0; `hold` 36/0. | probe of `wordnet-verb.json` |
| F3 | **The pilot failures are not example-starved.** `The machine will run on fuel` — candidate `wn3:v:01525666` ("perform as expected when applied", frames `[1]`) and `wn3:v:01526290` ("be operating, running or functioning", frames `[1]`) **share the same frame and the same semantics**. No external source separates them. | probe + [constructions.ts](../../src/core/language/constructions.ts) `frameEvidence` |
| F4 | **The occurrence itself is the obstacle for `run on fuel`.** The occurrence parses as `complement: 'prepositional'` with `preposition: 'on'`. `frameEvidence` maps `prepositional` to frames `[15..22]`, so frame `[1]` yields `SOFT_CONFLICT` for both candidates. `run` has no `[15..22]` sense that means "operate". | [constructions.ts](../../src/core/language/constructions.ts) |
| F5 | **VerbNet has almost no coverage for the pilot set.** In the `verbnet.zip` lexicon (240 files, 2.4 MB), `MEMBER` entries: `consider` 1, `think` 2, `mean` 2, `hold` 3, `take` 5, `run` 4 — and **`consider`, `think`, `mean` (in `wish-62.xml`) carry `wn=""`**, i.e. no WordNet mapping at all. | probe of `verbnet.zip` |
| F6 | **VerbNet itself is WordNet-mapped only sometimes.** 1,151 of 4,991 `MEMBER` entries (23.1%) have `wn=""`. VerbNet→PWN3 mapping is partial by construction. | probe of `verbnet.zip` |
| F7 | **VerbNet version is stale.** `README` in the distribution states `VERBNET LEXICON, VERSION 2.1` and points to a `verbs.colorado.edu` URL that no longer resolves. License text names University of Colorado, 2009. | probe of `verbnet.zip` + license |
| F8 | **OEWN does not reuse PWN3 offsets.** OEWN verb synsets: 13,821; PWN3 verb synsets: 13,767; direct offset intersection is **118 (0.9%)**. `run` 1/41, `mean` 0/7, `consider` 0/9, `think` 0/13, `take` 1/42, `hold` 1/36. | probe of OEWN `src/yaml/verb.*.yaml` |
| F9 | **But CILI provides a complete bridge.** `cili/ili-map-pwn30.tab` (117,659 rows) maps every PWN3 synset to an ILI; OEWN YAML carries `ili:` on each synset. Chaining `PWN3 offset → ILI → OEWN synset` resolves **147/148 (99%)** of pilot verb senses, `take` 41/42. | probe of CILI + OEWN |
| F10 | **OEWN adds `frames.yaml`, which PWN3 does not have.** The 2025 OEWN release carries a `frames` attribute per synset (`via-pp`, `via-inf`, `ditransitive`, `ditransitive`, `nonreferential`, …). This is genuinely new usage metadata absent from PWN3. | probe of `src/yaml/frames.yaml` |
| F11 | **Licensing:** OEWN is WordNet License + **CC BY 4.0**. VerbNet is a bespoke University-of-Pennsylvania/Colorado license — free redistribution permitted **only if the copyright notice, disclaimer and required citations appear on ALL copies** of software, database and documentation, including derived artifacts. | `globalwordnet/english-wordnet` LICENSE.md; `VERBNET_LICENSE.txt` |
| F12 | **The existing audit's priority score does not track runtime failures.** `scripts/audit_sense_metadata.py` scores 146,291 lemmas (HIGH 36,129). Top HIGH: `counter`, `pop`, `bitter`, `plumb`, `round`, `solo`, `flush`. None is a pilot failure lemma, and the six pilot lemmas are not in the top 50. Priority is driven by unresolved-VI fraction, POS count, example/discriminative deficit — **not** by whether `SenseResolver` returns `context` or `ambiguous`. | `tmp/metadata-audit-summary.md`; [audit_sense_metadata.py](../../scripts/audit_sense_metadata.py) |

## SCOPE

Dictionary / language metadata analysis only. This plan produces **decisions and evidence, not runtime
integration**.

In scope:
- Bounded, reproducible measurement of current PWN3 + Skypedia metadata against a fixed sample.
- Source-artifact inspection for OEWN and VerbNet: licensing, availability, format, PWN3 mapping feasibility.
- Per-case classification of missing evidence.
- A written decision: VerbNet / OEWN / both / neither.

Out of scope (explicitly rejected):
- Any change to `src/core/language/sense-resolver.ts` scoring, thresholds or reason strings.
- Any runtime integration, asset bundling, or `release/` artifact regeneration.
- Any new heuristic, any new network call, any new provider.
- Any change to the `wn3:*` canonical ID scheme or to `SenseResolver`'s confidence formula.
- Any edit to `release/dictionary/context-lens-sense-metadata-reviewed.json`.

## RELEVANT FILES

| File | Role in this audit |
| --- | --- |
| [scripts/audit_sense_metadata.py](../../scripts/audit_sense_metadata.py) | Existing audit. Priority formula + `metadata-audit.v1` schema. Extend, do not fork. |
| [scripts/test_audit_sense_metadata.py](../../scripts/test_audit_sense_metadata.py) | Existing audit tests. Model for the new test file. |
| [src/core/language/constructions.ts](../../src/core/language/constructions.ts) | `ConstructionFeatures`, `frameEvidence`, `patternEvidence` — the runtime contract any candidate metadata must satisfy. |
| [src/core/language/sense-resolver.ts](../../src/core/language/sense-resolver.ts) | `contextMatch` requires `semanticScore >= 3 && independentSemanticScore >= 2 && margin >= 2`. Read-only. |
| [src/lookup/reviewedSenseMetadata.test.ts](../../src/lookup/reviewedSenseMetadata.test.ts) | Existing pilot cases — the seed for the benchmark. |
| [release/dictionary/context-lens-sense-metadata-reviewed.json](../../release/dictionary/context-lens-sense-metadata-reviewed.json) | Reviewed overlay to preserve. Read-only. |
| [docs/DICTIONARY_PACK.md](../DICTIONARY_PACK.md) | Overlay + WordNet format 2 semantics. |
| [docs/translation-pipeline.md](../translation-pipeline.md) | Lookup pipeline; the `ambiguous` status is produced here. |
| `tmp/metadata-audit.json` | Existing 94.5 MB audit output. Regenerate; never read whole into context. |

## PRESERVE / INVARIANTS

1. `wn3:<pos>:<offset>` stays the canonical sense ID. All candidate-source IDs (`oewn:…`, `vn:<class>`)
   are **provenance labels in an audit report only** and must never be written into runtime types.
2. `release/dictionary/context-lens-sense-metadata-reviewed.json` is byte-identical after the audit.
3. No file under `src/` changes. `git diff -- src/` must be empty at the end.
4. `contextMatch` thresholds (`>= 3`, `>= 2`, `>= 2`) are not lowered or raised.
5. No network request is added to any runtime path. Source downloads are one-off, into `tmp/`.
6. All audit output lands in `tmp/` (already git-ignored). Only the spec + report are committed.

## CHANGE CLASS / RISK

`SUBSYSTEM_LOGIC` is **not** applicable — no source change. This is a **read-only analysis task**.
The only tracked deliverable is a Markdown report. Risk is therefore limited to (a) wrong conclusions
from a bad sample, and (b) accidentally committing a large dump. Both are mitigated by the stop
conditions below.

## IMPLEMENTATION DIRECTION

Write one new script, `scripts/audit_context_gap.py`, plus one test file
`scripts/test_audit_context_gap.py`. Reuse `audit_sense_metadata.load_sources()` rather than
re-parsing the packs. Everything goes through compact JSON + a Markdown summary; no manual
inspection of source dumps.

### 1. Bounded test sample

**Sample frame — the pilot lemma set (24 lemmas).** Deterministic, no sampling:

| Group | Lemmas | Source |
| --- | --- | --- |
| G1 named pilot cases | `run`, `mean`, `consider`, `think`, `take`, `hold` | Task + existing pilot test |
| G2 top HIGH from existing audit | `counter`, `pop`, `bitter`, `plumb`, `round`, `solo`, `flush`, `express` | `tmp/metadata-audit-summary.md` top 8 |
| G3 other known-ambiguous verbs | `get`, `make`, `put`, `set`, `take`, `go`, `turn`, `come` | existing resolver tests |
| G4 structurally hard pilot | `pitch`, `flush`, `lift`, `draft`, `flip` | reviewed overlay entries |

Rationale: G1 tests the named difficult cases; G2 tests whether the audit's own HIGH tier predicts
runtime failure (F12 predicts it does not — that is itself a finding worth recording); G3 gives
high-frequency baselines; G4 are lemmas the reviewed overlay already fixed, as a control group.

**Bounded size.** Cap at 24 lemmas, cap at 300 senses total, cap every JSON artifact at 2 MB.
Report per-lemma rows only; never dump full source synsets into the summary.

**Sentence sample.** Exactly 7 named sentences (from the existing pilot test) plus one adversarial
variant each for the four named-hard cases, giving 11:

| # | Lemma | Sentence | Current expected |
| --- | --- | --- | --- |
| S1 | `run` | `The machine will run on fuel.` | `ambiguous` |
| S2 | `mean` | `I mean doing the work now.` | `ambiguous` |
| S3 | `consider` | `I consider doing the work.` | `ambiguous` |
| S4 | `consider` | `I consider her foolish.` | `ambiguous` |
| S5 | `think` | `I think.` (bare/generic) | `ambiguous` |
| S6 | `think` | `I think that he is right.` | `context` or `ambiguous` — record actual |
| S7 | `think` | `I think of my mother.` | `ambiguous` |
| S8-S11 | adversarial | S1-S3 with a disambiguating preceding sentence appended, e.g. `We refuelled it last week. The machine will run on fuel.` | record actual |

S8–S11 exist **only** to measure how much the classification depends on the current sentence. They are
the empirical test of "does this need wider discourse context".

### 2. Exact source artifacts to inspect

**Current stack (read-only, already present):**
- `release/wordnet/wordnet-verb.json` (1,915,605 bytes), `wordnet-noun.json`, `wordnet-adj.json`, `wordnet-adv.json`
- `release/dictionary/manifest.json` → the named pack (currently `context-lens-en-vi-2026.09.3.json`)
- `release/dictionary/context-lens-sense-metadata-reviewed.json`
- `release/wordnet/manifest.json`, `release/wordnet/WORDNET-LICENSE.md`

**Candidate A — Open English WordNet.** Repo `globalwordnet/english-wordnet`, branch `main`:
- `src/yaml/verb.*.yaml` (15 files) — synset definition, example, `ili`, `members`, `partOfSpeech`
- `src/yaml/frames.yaml` — the 2025 `frames` attribute vocabulary
- `src/deprecations.csv`, `src/sense-orders.csv` — ordering / removed-sense policy
- `LICENSE.md` — WordNet License + CC BY 4.0

**Bridge — CILI.** Repo `globalwordnet/cili`:
- `ili-map-pwn30.tab` — 117,659 rows, PWN3 synset → ILI
- `ili.ttl` — ILI inventory

**Candidate B — VerbNet.** Distribution `verbnet.zip` (240 XML files, 2.4 MB), mirror:
`https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/verbnet.zip`
- `<VNCLASS>` files, each with `<MEMBERS>/<MEMBER name=… wn=…/>`, `<FRAMES>/<FRAME>` with
  `<SYNTAX>`/`<PREP>` and `<SEMANTICS>`/`<PRED>`, plus `<DESCRIPTION>` and `<EXAMPLES>`
- `README` (version statement), `vn_class-3.dtd`, `vn_schema-3.xsd`

**License files to capture verbatim into the report:** OEWN `LICENSE.md`; VerbNet
`VERBNET_LICENSE.txt` (verbatim text is F11's source); the already-bundled
`release/wordnet/WORDNET-LICENSE.md` for continuity.

### 3. Source-to-PWN3 mapping strategy

Mapping is **not** the hard part for OEWN, and **is** the hard part for VerbNet. Treat them differently.

**OEWN — two-hop via CILI (preferred).** Verified at 99% on the pilot (F9).
```
PWN3 "wn3:v:02443849" ──[cili/ili-map-pwn30.tab, key "02443849-v"]──▶ ILI "i…" ──[OEWN yaml "ili:"]──▶ OEWN synset "…-v"
```
- Deterministic, both hops are flat files, no inference.
- Step 1: build `pwn3_offset → [ili]` from `ili-map-pwn30.tab`.
- Step 2: scan `verb.*.yaml` once, building `ili → [oewn_synset]` and capturing `frames`, `examples`,
  `definition`, `ili` per synset.
- **Report only the coverage rate and the sense-identity result.** Do not decide in this task whether
  OEWN definitions replace PWN3 definitions — that is a later decision.

**Fallback if CILI is unavailable:** OEWN `src/sensekey-maps.csv` maps OEWN sense keys to *Princeton 3.1*
sense keys (`114` rows, proper nouns only — insufficient). Note this and stop; do not build a
fuzzy matcher.

**VerbNet — measure, do not assume.**
- Primary key: the `wn` attribute on `<MEMBER>` (PWN3 sense keys like `run%2:38:00`). Verified
  **F6: 23.1% of `MEMBER` entries have `wn=""`**, so mapping is incomplete by construction.
- Report three numbers for the sample: (a) lemmas with ≥1 VerbNet class, (b) lemma→class edges that
  carry a usable `wn`, (c) `MEMBER` entries in the sample classes with `wn=""`.
- **Expect failure.** F5 shows `consider`, `think`, and `mean` are largely unmapped in VerbNet.
  If the audit confirms that, VerbNet cannot be the primary enrichment source for this task's pilot set.
- Do not attempt semantic/fuzzy lemma-name matching as a substitute — it would fabricate sense
  identity, which violates invariant 1's spirit.

### 4. Metadata metrics

Compute per lemma and per sense. **Metrics 1–7 are the current baseline (always reported). Metrics 8–10
are only computable if the corresponding source is inspected.**

| # | Metric | Definition | Gap it exposes |
| --- | --- | --- | --- |
| M1 | `senseCount` | PWN3 senses for the lemma | polysemy scale |
| M2 | `framesCoverage` | senses with ≥1 lemma-scoped frame (word index ≠ 0, or word 0) | missing verb frame / valency |
| M3 | `exampleCoverage` | senses with ≥1 example | missing example |
| M4 | `distinctCollocationRatio` | collocations owned by exactly 1 sense ÷ senses (reuse `audit_sense_metadata.extracted_collocations`) | missing discriminative collocation |
| M5 | `sharedUsageOverlap` | collocation shapes owned by >1 sense | genuine ambiguity, not a metadata gap |
| M6 | `reviewCoverage` | senses present in the reviewed overlay | unresolved EN sense mapping |
| M7 | `domainCoverage` | senses with ≥1 WordNet `domain` marker | missing domain evidence |
| M8 | `prepositionCueRate` | senses whose examples/definitions contain a cue preposition after the lemma | missing preposition/particle pattern |
| M9 | `complementCoverage` | senses with ≥1 example whose `occurrenceConstruction` complement is non-`none`/non-`object` | missing complement pattern |
| M10 | `frameEvidenceResolution` | fraction of the sample sentences where `frameEvidence` returns `MATCH` for exactly one same-POS candidate | **the decisive metric** |

M10 is the pivot. It answers the whole task: *if* a source's frames made `frameEvidence` return `MATCH`
for a unique candidate, lexical metadata would be sufficient for that case. If M10 stays low even with
the best available frames, the case needs context.

### 5. Context-gap classification

For each of the 11 sentences, assign exactly one primary category and any number of secondary ones.
Classification is **derived from measured fields**, not from judgement alone.

| Code | Category | Derivation rule |
| --- | --- | --- |
| C1 | missing stable EN sense mapping | lemma has PWN3 senses but M6 = 0 and no VI gloss maps |
| C2 | missing verb frame / valency | M2 < 1.0 for the competing candidates |
| C3 | missing complement pattern | M9 low **and** `occurrenceConstruction` yields a specific complement (`infinitive`, `gerund`, `clause`, `object-infinitive`) |
| C4 | missing preposition / particle pattern | occurrence has `preposition`/`particle` **and** M8 low |
| C5 | missing discriminative collocation | M4 < 0.5 and M5 low → no unique usage evidence exists |
| C6 | missing example | M3 < 0.5 for the competing candidates |
| C7 | missing domain evidence | M7 = 0 for the competing candidates |
| C8 | insufficient current sentence context | frames/collocations/examples are all sufficient (M2/M3/M9 ≥ 1) **but** the sentence contains no token unique to one sense |
| C9 | likely requires previous/next sentence or paragraph | S8–S11 changes the outcome, or the discriminating referent is only resolvable from an antecedent |
| C10 | genuinely unresolved lexical ambiguity | the senses are semantically overlapping **even in OEWN and VerbNet**; no source separates them |

**The A/B split the task demands.**

- **Group A — solvable by better lexical metadata.** Categories `C1`–`C7`. These are all statements
  about *what the lexical resource does not say*. Fixing them means adding evidence, not reading more text.
- **Group B — requires wider discourse context.** Categories `C8`, `C9`, `C10`. These are statements about
  *the input*: the evidence exists, or cannot exist, in the lexicon at all.

**F3 is the hypothesis to confirm or kill.** If `run on fuel` shows two candidates with identical frames
and near-identical glosses, and no OEWN frame or VerbNet class separates them, it is **C10**, not a gap —
and no enrichment source is worth shipping for it. Record that outcome plainly rather than hunting for
a source that "solves" it.

### 6. Benchmark cases

Derived from the classification:

| Benchmark | Source sentences | Assertion |
| --- | --- | --- |
| B1 frames-decisive | any S where M10 would go 0→1 with candidate frames | these are the enrichment ROI cases |
| B2 collocation-decisive | any S currently resolved only by `Collocation:` reason | overlay-scale review is enough; no new source |
| B3 context-only | S8–S11 pairs where appending a preceding sentence changes `senseStatus` | proves discourse need, not lexical need |
| B4 unfixable | cases landing in C10 | must remain `ambiguous`; guard against future over-claiming |

B4 is deliberately a **negative** benchmark. It exists to prove the audit does not manufacture
resolution, and it feeds a documentation note — not a new heuristic.

### 7. Expected outputs

| Output | Path | Shape |
| --- | --- | --- |
| Per-lemma metrics | `tmp/context-gap/lemma-metrics.json` | ≤ 24 rows, ≤ 300 KB |
| Per-sentence classification | `tmp/context-gap/case-classification.json` | 11 rows, ≤ 60 KB |
| Source coverage report | `tmp/context-gap/source-coverage.json` | per-source: availability, license, size, PWN3 mapping rate |
| Verbatim licenses | `tmp/context-gap/licenses/` | OEWN `LICENSE.md`, VerbNet `VERBNET_LICENSE.txt` |
| **Human summary** | `docs/reports/context-gap-audit.md` | Markdown, **the only committed artifact besides this spec** |
| New script | `scripts/audit_context_gap.py` | compact, deterministic, `--offline` and `--with-sources` flags |
| New tests | `scripts/test_audit_context_gap.py` | mirrors `test_audit_sense_metadata.py` style |

The summary report must contain: the A/B split table, the M10 result, the source decision, the license
verdict, and the explicit list of C10 cases.

### 8. STOP CONDITIONS

Stop and report; do not work around.

| # | Condition | Action |
| --- | --- | --- |
| S-1 | Either candidate source cannot be downloaded | Mark that candidate `UNAVAILABLE`, run the current-stack baseline only, report the partial result. **Do not** substitute a random mirror. |
| S-2 | CILI `ili-map-pwn30.tab` unavailable or < 90% pilot mapping rate | OEWN mapping is `INFEASIBLE`. Report the measured rate. Do not build a fuzzy matcher. |
| S-3 | VerbNet license text cannot be retrieved verbatim | VerbNet is `LEGALITY-UNVERIFIED`. It cannot proceed regardless of coverage numbers. |
| S-4 | Sample coverage < 24 lemmas or resolution takes > 5 minutes for the current-stack pass | Report what was measured, label the rest `NOT RUN`. |
| S-5 | The script needs to modify anything under `src/` or `release/` | Stop. This is an analysis task; that finding belongs in the report, not in code. |
| S-6 | Any artifact would exceed 2 MB | Summarise instead of emitting. Never commit a large dump. |
| S-7 | Download or parse fails twice | Classify the failure once, apply at most one safe fallback, then stop per the Terminal Loop Guard in [agent-execution-rules.md](../agent-execution-rules.md). |

### 9. Authoritative verification command

There is **no source change**, so no `verify:*` gate applies. The authoritative check is the audit's
own determinism test plus a repo-cleanliness assertion:

```powershell
python scripts/test_audit_context_gap.py
```

It must assert: deterministic output across two runs; `C10` cases stay in `C10`; no emitted artifact
exceeds 2 MB; and the sample frame is exactly 24 lemmas / 11 sentences.

Then confirm nothing in `src/` or `release/` moved:

```powershell
git --no-pager diff --stat -- src release
```

Expected: **empty**. A non-empty result is a `FAIL` for this task regardless of the audit's findings.

Optional cross-check, not required: `npx vitest run src/lookup/reviewedSenseMetadata.test.ts` to
confirm the existing pilot expectations are unchanged. Label `NOT RUN` if skipped.

On Windows use `npm.cmd` / `npx.cmd`; a `.ps1` execution-policy error is not evidence that the `.cmd`
launcher is blocked.

### 10. Decision rule

Compute the table below, then apply the rule verbatim. `A` = Group A cases fixable by lexical metadata
(the C1–C7 subset whose metric the source demonstrably improves). `B` = Group B cases.

| Input | Outcome |
| --- | --- |
| OEWN availability `OK` **and** CILI mapping ≥ 90% **and** `A ≥ 4` **and** M10 improves for at least one S case | **OEWN proceeds**, VerbNet does not |
| OEWN passes availability + mapping, but `A < 4` and VerbNet improves `A ≥ 2` | **VerbNet proceeds** only if license is `VERIFIED`; otherwise neither |
| Both improve `A`, and they are complementary (OEWN = frames/definitions, VerbNet = preposition patterns) with no conflicting sense identity | **both proceed**, in separate tasks, OEWN first |
| Neither improves `A ≥ 2`, or ≥ 60% of sample lands in C8/C9/C10 | **neither** — the bottleneck is discourse context, and the next task is sentence/paragraph scope, not a new lexicon |
| Any source is `LEGALITY-UNVERIFIED` | that source **cannot** proceed, regardless of numbers |

**Binding sub-rule, already evidenced.** F1 + F3 mean the pilot's flagship failure (`run on fuel`)
cannot be fixed by *any* lexical source: both candidates share frame `[1]` and near-identical glosses.
If the audit confirms this, `run on fuel` is `C10`, and any decision that ships a new lexicon *on its
account* is rejected. A new source must be justified by the Group A count, not by this headline case.

**Second binding sub-rule.** F7 (VerbNet 2.1, dead upstream URL) plus F11 (attribution must appear on
**all** copies including derived artifacts) mean VerbNet carries real, ongoing compliance cost against a
stale corpus. VerbNet must clear a higher bar than OEWN, and "it has more frames" is not a reason.

### 11. Expected conclusion shape

Stated now so the Implementer knows what a result looks like, **not** as the answer:

1. **F1/F3/F4 suggest the named hard cases are largely Group B.** `run on fuel` is a
   frame-vs-occurrence modelling mismatch (`prepositional` vs frame `[1]`), not a missing-data problem.
   `mean doing` / `consider doing` are `gerund`-complement overlaps across several senses — a real
   lexical boundary problem, but one where the senses genuinely overlap.
2. **F8/F9 suggest OEWN is the only viable enrichment source**, and only if the Group A count justifies it.
3. **F5/F6/F7 suggest VerbNet should not proceed** for this pilot set.
4. **F12 means the existing HIGH priority tier is not a proxy for runtime failures** and should not be
   used to select enrichment targets.

If the measured data contradicts any of these, the data wins. Record the contradiction explicitly.

## ACCEPTANCE CRITERIA

1. `scripts/audit_context_gap.py` exists, runs offline by default, and is deterministic across two runs.
2. `scripts/test_audit_context_gap.py` passes and asserts the 24-lemma / 11-sentence frame and the 2 MB cap.
3. `tmp/context-gap/` contains `lemma-metrics.json`, `case-classification.json`, `source-coverage.json`, `licenses/`.
4. `docs/reports/context-gap-audit.md` contains the **A/B split**, the M10 result, per-source
   availability + license verdict, and the explicit C10 list.
5. Each of the 11 sentences carries exactly one primary category (C1–C10) plus optional secondaries.
6. OEWN mapping feasibility is resolved **by measurement**, via CILI — not assumed and not fuzzy-matched.
7. VerbNet license terms are quoted verbatim and its mapping rate is measured, not assumed.
8. **Decision (OEWN / VerbNet / both / neither) is stated with the input numbers that produced it.**
9. `git --no-pager diff --stat -- src release` is empty.
10. `release/dictionary/context-lens-sense-metadata-reviewed.json` is byte-identical.

## DOC IMPACT

- `docs/reports/context-gap-audit.md` — new; the audit's human-readable result.
- [docs/DICTIONARY_PACK.md](../DICTIONARY_PACK.md) — **only** if the audit concludes a new source should
  proceed; then a short "candidate sources considered" note. No change now.
- [docs/translation-pipeline.md](../translation-pipeline.md) — **no change.** This task changes no runtime behavior.

Architecture docs are not touched: ownership, subsystem boundaries, control flow and data flow are unchanged.

## OPEN QUESTIONS / RISKS

1. **`tmp/metadata-audit.json` is 94.5 MB.** Regenerating it costs time and disk. Consider reading
   `tmp/metadata-audit-summary.md` for tier selection and re-running the script only if a column is needed.
2. **OEWN `2025+` edition choice is undecided.** Newer editions have more synsets but a moving YAML layout.
   Pin one edition and record it, or the numbers are not comparable across runs.
3. **23.1% unmapped VerbNet members (F6)** may be partly an artifact of the nltk mirror rather than
   VerbNet itself. Verify against a second distribution before treating F6 as authoritative.
4. **The `interpretations`/`frames` attribute in OEWN 2025 may not exist in 2024 or earlier.** The audit
   must state which edition it measured, or F10 is not reproducible.
5. **`take` maps 41/42 through CILI.** The single miss is unexplained; record it rather than assuming
   a bridging exception.