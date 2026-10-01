# Metadata source & context gap audit

ROLE                  Planner handoff (planning only — do not implement)
TASK                  Determine whether current unresolved sense-resolution failures in Context Lens
                       are caused by missing lexical metadata or by insufficient sentence/paragraph
                       context, and decide whether VerbNet, Open English WordNet (OEWN), both, or
                       neither should proceed.
FINDINGS               See "Planner findings" below. Re-measure rather than trust them blindly.
STATUS                Revised 2026-10-01 after an external critique was fact-checked against this
                       repository. Section "Revision log" records every accepted and rejected change
                       with its evidence. Findings F4, F10 and hypotheses H2/H3 were corrected or
                       withdrawn because measurement contradicts them.

## Revision log

An external review of this spec was fact-checked by executing the real TypeScript resolver against
the real shipped metadata packs. Twenty contestable points were tested. Fifteen were confirmed and
applied. Five rested on incorrect premises and are rejected here, with the measurement that rejects
them.

**Applied (confirmed against the repo):**

| # | Critique point | Applied as |
| --- | --- | --- |
| A1 | A Python script cannot run the TypeScript resolver | Harness is TypeScript/Node; §1.0 specifies a proven, dependency-free runner |
| A2 | Lemma lists total 27 but yield 25 unique, not 24 | §1.1 sample is exactly **25** lemmas |
| A3 | The 300-sense cap is unmeetable (25 lemmas = 437 senses) | 300-sense cap **removed**; the 2 MB artifact cap is retained |
| A4 | G2–G4 have no sentences, so F12 is untestable | §1.2 requires ≥3 sentences per lemma, every lemma |
| A5 | "Current expected" is resolver output, not gold | §1.3 introduces a committed `acceptable_senses` gold set |
| A6 | S8–S11 are 4 variants derived from 3 sentences and are confounded | §1.2 replaces them with a gated `ctx_disc` / `ctx_null` design |
| A7 | Source artifacts unpinned; F5–F10 probes deleted | §2 pins every artifact by commit SHA and sha256 |
| B1 | M2 saturates at 100% and M3 at ~93%, so C2/C6 are unreachable | §4 demotes M2/M3 to baseline and adds M2′ `siblingIndistinguishability` |
| B2 | Group A is counted by metric, not by final outcome | §4 adds M13 `netFlips`; §10 decides on flips, with metrics reported alongside |
| B3 | C-codes have no priority order | §5 states an explicit first-match priority order |
| B4 | M10 "exactly one candidate MATCH" is wrong for synonymous senses | M10 becomes `acceptableOutcomeRate`, scored against the gold set |
| D3 | CILI is ID resolution, not sense equivalence | §3 labels CILI a metadata bridge and forbids using it to assert sense identity |
| D4 | VerbNet 3.x exists and should be checked | §2 and Q6 record 3.x as the version to evaluate, with 2.1 retained as the measured baseline |
| E5 | Verification must use `PASS` / `FAIL` / `BLOCKED` / `NOT RUN` labels | §9 labels every check |

**Rejected (measurement contradicts the critique):**

| # | Critique point | Why it is rejected |
| --- | --- | --- |
| C1 | "F4: `SOFT_CONFLICT` penalises the candidates" | `SOFT_CONFLICT` has **no** scoring effect. `frameEvidence` only returns a label; in [sense-resolver.ts](../../src/core/language/sense-resolver.ts) only `MATCH` emits an event (`add(1, 'Frame match')`). Only `patternEvidence` can set `compatible = false`. The senses actually competing on `run on fuel` are the bundled non-WordNet entries `run.move` and `run.manage`, which carry **no** `verbFrames`, so `frameEvidence` returns `UNKNOWN`, not `SOFT_CONFLICT`. |
| C2 | "Category C0 / intervention P1 (strip `verbFrames`) will populate a pipeline-defect category" | Implemented faithfully, P1 flipped **1 of 9** named cases (`take` "I take sugar in my coffee." `ambiguous` → `context`). `run on fuel`, `mean doing`, `consider doing`, `consider foolish` and all three `think` variants did not flip. A category that yields ~11% would carry no weight, so C0 is kept only as a diagnostic, and P1 is demoted from the decision rule to a reported diagnostic. |
| D1 | "F10: OEWN adds a `frames` attribute per synset in `verb.*.yaml`" | OEWN's frame data lives at the **sense level**, under the `subcat:` key in `src/yaml/entries-*.yaml`. Across all 15 `verb.*.yaml` files there are **0** occurrences of a `frames:` key. `src/yaml/frames.yaml` is a 41-label vocabulary mapping 1:N onto the 35 Princeton frames, not per-synset data. |
| D2 | "H3: OEWN's finer frame vocabulary splits otherwise-indistinguishable pairs" | Across the 6 pilot lemmas — 148 verb senses, 2,446 sibling pairs, **229** pairs sharing identical PWN3 frame sets — OEWN sense-level `subcat` splits **zero** pairs. A finer vocabulary over an identical partition adds no discriminating power. H3 is withdrawn. |
| E3 | "M12: `run on fuel` is a harmless translation equivalence; expect a large `E` class" | Only 3 of 41 `run` senses carry any VI gloss, and ≤1 for every other pilot lemma. Pairs where **both** siblings have a non-empty gloss: `run` 3, `mean` 1, `consider` 1, `take` 1, `think` 0, `hold` 0. **Same-gloss sibling pairs: 0 across all lemmas.** An earlier naive count of 703 was an artifact of comparing empty glosses. The `E` class is not supported by shipped data and is dropped. |
| E2 | "`npx tsx scripts/context_gap_harness.ts`" | Neither `tsx` nor `vite-node` is installed; adding either mutates the dependency manifest, which invariant 5 forbids in spirit. §1.0 instead specifies two runners proven to work in this repo, and places the harness outside every verification gate. |

## Planner findings

These are the measured facts this plan is built on. Re-measure rather than trust them blindly.
All numbers were measured in this repository on 2026-09-30 / 2026-10-01 by executing the real
`SenseResolver` and `SentenceEngine` against the real shipped packs.

| # | Finding | Evidence |
| --- | --- | --- |
| F1 | **Every PWN3 verb synset already carries frames.** `release/wordnet/wordnet-verb.json`: 13,767 of 13,767 verb synsets have a non-empty `frames` list. Frame-based evidence is therefore *not* a gap. | probe of `wordnet-verb.json` |
| F2 | **Examples are nearly complete for the pilot verbs.** Across the 25-lemma sample: 437 senses, **0** without frames and **31** without examples (`run` 5, `lift` 6, `plumb` 4, `pitch` 3, `flip` 3, `set` 2, `draft` 2, `solo` 2, and 1 each for `consider`, `round`, `counter`, `bitter`). | probe of `wordnet-verb.json` |
| F3 | **The pilot failures are not example-starved.** `The machine will run on fuel` — `wn3:v:01525666` ("perform as expected when applied", frames `[1]`) and `wn3:v:01526290` ("be operating, running or functioning", frames `[1]`) **share the same frame and the same semantics**. No external source separates them. | probe + [constructions.ts](../../src/core/language/constructions.ts) `frameEvidence` |
| F4 | **Corrected.** The obstacle is *absent frame data on the bundled candidates*, not a `SOFT_CONFLICT` penalty. The senses that actually compete on `run on fuel` are the bundled non-WordNet entries `run.move` and `run.manage`, which carry **no** `verbFrames`, so `frameEvidence` returns `UNKNOWN`. `SOFT_CONFLICT` is computed but never scored: only `MATCH` emits an event, and only `patternEvidence` sets `compatible = false`. The ambiguity is "no unique evidence, and the winning candidates have no frame data at all". | execution of the real resolver + [constructions.ts](../../src/core/language/constructions.ts) + [sense-resolver.ts](../../src/core/language/sense-resolver.ts) |
| F5 | **VerbNet has almost no coverage for the pilot set.** In the `verbnet.zip` lexicon (240 files, 2.4 MB), `MEMBER` entries: `consider` 1, `think` 2, `mean` 2, `hold` 3, `take` 5, `run` 4 — and **`consider`, `think`, `mean` (in `wish-62.xml`) carry `wn=""`**, i.e. no WordNet mapping at all. | probe of `verbnet.zip` |
| F6 | **VerbNet itself is WordNet-mapped only sometimes.** 1,151 of 4,991 `MEMBER` entries (23.1%) have `wn=""`. VerbNet→PWN3 mapping is partial by construction. | probe of `verbnet.zip` |
| F7 | **The measured VerbNet version is stale.** `README` in the nltk distribution states `VERBNET LEXICON, VERSION 2.1` and points to a `verbs.colorado.edu` URL that no longer resolves. License text names University of Colorado, 2009. VerbNet 3.x exists and is the version worth evaluating; see Q6. | probe of `verbnet.zip` + license |
| F8 | **OEWN does not reuse PWN3 offsets.** OEWN verb synsets: 13,821; PWN3 verb synsets: 13,767; direct offset intersection is **118 (0.9%)**. `run` 1/41, `mean` 0/7, `consider` 0/9, `think` 0/13, `take` 1/42, `hold` 1/36. | probe of OEWN `src/yaml/verb.*.yaml` |
| F9 | **But CILI provides a complete ID bridge.** `cili/ili-map-pwn30.tab` (117,659 rows) maps every PWN3 synset to an ILI; OEWN YAML carries `ili:` on each synset. Chaining `PWN3 offset → ILI → OEWN synset` resolves **147/148 (99%)** of pilot verb senses, `take` 41/42. This is **ID resolution only** — it licenses a metadata lookup and does **not** assert sense equivalence. | probe of CILI + OEWN |
| F10 | **Corrected.** OEWN's frame data is at the **sense level**, under `subcat:` in `src/yaml/entries-*.yaml`, not a synset `frames` attribute in `verb.*.yaml` (0 such keys across all 15 files). All 41 `run` verb senses carry `subcat`. `src/yaml/frames.yaml` is a 41-label vocabulary (`vii`, `vii-pp`, `via-pp`, `vtai`, `vtai-pp`, `ditransitive`, `nonreferential`, …) mapping 1:N onto the 35 Princeton frames. | probe of all 15 `verb.*.yaml` + `entries-*.yaml` + `frames.yaml` |
| F11 | **Licensing:** OEWN is WordNet License + **CC BY 4.0**. VerbNet is a bespoke University-of-Pennsylvania/Colorado license — free redistribution permitted **only if** the copyright notice, disclaimer and required citations appear on **ALL** copies of software, database and documentation, including derived artifacts. | `globalwordnet/english-wordnet` LICENSE.md; `VERBNET_LICENSE.txt` |
| F12 | **The existing audit's priority score does not track runtime failures.** `scripts/audit_sense_metadata.py` scores 146,291 lemmas (HIGH 36,129). Top HIGH: `counter`, `pop`, `bitter`, `plumb`, `round`, `solo`, `flush`. None is a pilot failure lemma, and the six pilot lemmas are not in the top 50. Priority is driven by unresolved-VI fraction, POS count, example/discriminative deficit — **not** by whether `SenseResolver` returns `context` or `ambiguous`. Testing this requires sentences for the G2 lemmas, which the previous revision of this spec omitted. | `tmp/metadata-audit-summary.md`; [audit_sense_metadata.py](../../scripts/audit_sense_metadata.py) |
| F13 | **The decisive quantity is sibling indistinguishability, not frame coverage.** With M2 saturated at 100%, the informative metric is how many *sibling* sense pairs share an identical frame set. Over the 6 pilot lemmas: 148 senses, 2,446 sibling pairs, **229** with identical PWN3 frame sets. This is the population any enrichment source must actually separate. | execution of the real resolver |
| F14 | **Stripping frame evidence barely moves outcomes.** The faithful "remove `verbFrames` from all candidates" intervention flipped **1 of 9** named cases (`take` "I take sugar in my coffee." `ambiguous` → `context`). Frame evidence is therefore not the binding constraint on the named failures — the binding constraint is evidence the resolver does not consume. | execution of the real resolver |
| F15 | **M2′ is directly testable against OEWN.** Across the 229 identical-PWN3-frame sibling pairs, OEWN's sense-level `subcat` sets split **0**. OEWN offers a finer frame *vocabulary* over an identical *partition*. | probe of OEWN `entries-*.yaml` |
| F16 | **VI glosses are too sparse to carry a translation-equivalence class.** Only 3 of 41 `run` senses and ≤1 for each other pilot lemma carry a VI gloss. Pairs with both siblings glossed: `run` 3, `mean` 1, `consider` 1, `take` 1, `think` 0, `hold` 0. Same-gloss sibling pairs: **0**. | execution against `context-lens-sense-metadata-reviewed.json` |
| F17 | **The candidate set is not purely WordNet.** `run` resolves to 43 verb candidates: 41 `wordnet` senses plus the bundled non-WordNet entries `run.move` and `run.manage`. Those bundled entries are the ones actually competing on `run on fuel`, and they carry no `verbFrames` — which is the mechanism behind corrected F4. | [lexicon](../../src/core/language/lexicon.ts) via the real resolver |

## SCOPE

Dictionary / language metadata analysis only. This plan produces **decisions and evidence, not runtime
integration**.

In scope:
- Bounded, reproducible measurement of current PWN3 + Skypedia metadata against a fixed sample.
- Source-artifact inspection for OEWN and VerbNet: licensing, availability, format, PWN3 mapping feasibility.
- Per-case classification of missing evidence, scored against a gold set.
- A written decision: VerbNet / OEWN / both / neither.

Out of scope (explicitly rejected):
- Any change to `src/core/language/sense-resolver.ts` scoring, thresholds or reason strings.
- Any runtime integration, asset bundling, or `release/` artifact regeneration.
- Any new heuristic, any new network call, any new provider.
- Any change to the `wn3:*` canonical ID scheme or to `SenseResolver`'s confidence formula.
- Any edit to `release/dictionary/context-lens-sense-metadata-reviewed.json`.
- Any edit to `vite.config.ts`, `package.json`, or any `verify:*` script.

## RELEVANT FILES

| File | Role in this audit |
| --- | --- |
| [scripts/audit_sense_metadata.py](../../scripts/audit_sense_metadata.py) | Existing audit. Priority formula + `metadata-audit.v1` schema. Extend, do not fork. |
| [scripts/test_audit_sense_metadata.py](../../scripts/test_audit_sense_metadata.py) | Existing audit tests. Model for the new Python-side tests. |
| [src/core/language/constructions.ts](../../src/core/language/constructions.ts) | `ConstructionFeatures`, `frameEvidence`, `patternEvidence` — the runtime contract any candidate metadata must satisfy. |
| [src/core/language/sense-resolver.ts](../../src/core/language/sense-resolver.ts) | `contextMatch` requires `semanticScore >= 3 && independentSemanticScore >= 2 && margin >= 2`. Only `MATCH` emits an event; `SOFT_CONFLICT` does not score. Read-only. |
| [src/core/language/sentence-engine.ts](../../src/core/language/sentence-engine.ts) | `SentenceEngine(lexical, phrases, cache)` with an injectable cache; `ContextWindowBuilder` conditionally forwards `previousSentence`, only for referential openers. |
| [src/core/language/types.ts](../../src/core/language/types.ts) | `LexicalSense.verbFrames?: number[]`, `meaningsVi?: string[]`, `StableGrammarPattern`, `SelectionInput.previousSentence?`. |
| [src/lookup/reviewedSenseMetadata.test.ts](../../src/lookup/reviewedSenseMetadata.test.ts) | Existing pilot cases — the seed for the benchmark, and the model for the asset-stub + bootstrap pattern. |
| [src/lookup/dictionary/packs.ts](../../src/lookup/dictionary/packs.ts) | `loadBundledDictionary()`; fetches `?url` assets. Bootstrapping target. |
| [release/dictionary/context-lens-sense-metadata-reviewed.json](../../release/dictionary/context-lens-sense-metadata-reviewed.json) | Reviewed overlay to preserve; also the source of the VI glosses for M12. Read-only. |
| [docs/DICTIONARY_PACK.md](../DICTIONARY_PACK.md) | Overlay + WordNet format 2 semantics. |
| [docs/translation-pipeline.md](../translation-pipeline.md) | Lookup pipeline; the `ambiguous` status is produced here. |
| [docs/verification-map.md](../verification-map.md) | Records that dictionary audits are `audit:*`, **not** verification gates. The harness must not be added to a `verify:*` script. |
| `tmp/metadata-audit.json` | Existing 94.5 MB audit output. Regenerate; never read whole into context. |

## PRESERVE / INVARIANTS

1. `wn3:<pos>:<offset>` stays the canonical sense ID. All candidate-source IDs (`oewn:…`, `vn:<class>`)
   are **provenance labels in an audit report only** and must never be written into runtime types.
2. `release/dictionary/context-lens-sense-metadata-reviewed.json` is byte-identical after the audit.
3. No file under `src/` changes. `git diff -- src/` must be empty at the end.
4. `contextMatch` thresholds (`>= 3`, `>= 2`, `>= 2`) are not lowered or raised.
5. No network request is added to any runtime path. Source downloads are one-off, into `tmp/`.
6. All audit output lands in `tmp/` (already git-ignored). Only the spec + report + fixture are committed.
7. **No dependency is added.** `package.json` and the lockfile stay untouched; `node_modules/.bin` must not
   gain `tsx` or `vite-node`.
8. **No verification gate is widened.** `vite.config.ts` `test.include`, `scripts/audit_test_partitions.mjs`
   scope membership, and the `verify:*` ↔ [docs/verification-map.md](../verification-map.md) parity that
   `scripts/check_architecture_contracts.mjs` enforces all stay as they are. The harness lives outside
   every gate (see §1.0).

## CHANGE CLASS / RISK

`SUBSYSTEM_LOGIC` is **not** applicable — no source change. This is a **read-only analysis task**
producing a Markdown report plus a committed test fixture.

Risk is therefore limited to (a) wrong conclusions from a bad sample, (b) accidentally committing a
large dump, and (c) the harness silently becoming a verification gate that `verify:partitions` then
rejects. (c) is the new risk introduced by this revision and is mitigated by §1.0's placement rule and
by S-8.

## OUT OF SCOPE

- Any finding that would require changing resolver scoring to become true. If an audit result can only be
  obtained by editing `src/`, that is recorded in the report as a separate future task.
- VerbNet 3.x **adoption** decisions beyond licensing/coverage measurement. Q6 records that 3.x is the
  version to evaluate; whether to migrate is a later task.
- Any attempt to make OEWN sense-level `subcat` a runtime frame source. F15 measures why that would not
  work even if built.

## IMPLEMENTATION DIRECTION

### 0. Harness placement and runner (do this first — it gates everything else)

The audit must exercise the **real** `SenseResolver`, because every decisive claim in this spec is a
claim about resolver behaviour. That makes the harness TypeScript, not Python. The reviewer proposed
`npx tsx scripts/context_gap_harness.ts`; that does not work here.

**Why the proposed runner is unusable.** Neither `tsx` nor `vite-node` is installed in this repo, and
installing either mutates `package.json` + the lockfile, violating invariant 7. A bare
`esbuild --bundle` also fails, because [packs.ts](../../src/lookup/dictionary/packs.ts) and
[wordnet.ts](../../src/core/language/wordnet.ts) import assets with the `?url` suffix (including
`WORDNET-LICENSE.md?url&no-inline`); esbuild cannot resolve those without a plugin.

**Two runners are proven to work here. Choose one; do not invent a third.**

**Option A — vitest with a dedicated config (recommended).** Smallest change, no bundler config, no
new dependency. Create `tmp/context-gap/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'node', include: ['<harness>/*.probe.test.ts'], setupFiles: [] },
});
```

Run with `node_modules\.bin\vitest.cmd run --config tmp/context-gap/vitest.config.ts`. Because the
config lives in `tmp/` with its own `include`, it inherits nothing from `vite.config.ts` — no jsdom,
no fake-indexeddb, no `setupFiles`. The harness file itself **must not** match
`['src/**/*.test.{ts,tsx}', 'gateway/**/*.test.{ts,tsx}']`, which is what keeps `npm test` and
`verify:partitions` blind to it. Verified: 1 test green in 9.15 s.

**Option B — `vite build` SSR bundle.** `vite build` with `configFile: false` and `build.ssr` pointing
at the harness entry produced a 58 kB Node bundle from 24 modules. Vite resolves `?url` natively, so no
custom plugin is needed.

**Bootstrap sequence required in both options** (from
[reviewedSenseMetadata.test.ts](../../src/lookup/reviewedSenseMetadata.test.ts)):

1. Stub `fetch` so `?url` imports resolve to the real files on disk —
   `new Response(readFileSync(<real path>, 'utf8'))`. Rewrite the URL prefix to the repo's `release/`
   directory first.
2. `await Promise.all([loadWordNet(), loadBundledDictionary()])`.
3. Construct `SentenceEngine(lexical, phrases, cache)` with an **injected null cache**
   (`{ get: async () => null, put: async () => {} }`) so IndexedDB is never touched. Its third
   constructor argument exists for exactly this.

**Keep the split of labour:** the TypeScript harness owns only the resolver-level measurements —
M10, M11, M13, M14 (§1.2 P1 and P1′). The Python side keeps everything else: pack-level metrics
(M1–M9, M2′), the OEWN `subcat` scan that produces M15, source coverage, and reporting. Do not port
the resolver to Python, and do not rewrite the existing Python audit.

### 1. Bounded test sample

#### 1.1 Lemma frame — 25 lemmas, 437 senses

Deterministic, no sampling. The previous revision listed 27 entries across G1–G4 that collapse to 25
unique lemmas (`take` appears in G1 and G3, `flush` in G2 and G4).

| Group | Lemmas | Count | Source |
| --- | --- | --- | --- |
| G1 named pilot cases | `run`, `mean`, `consider`, `think`, `take`, `hold` | 6 | Task + existing pilot test |
| G2 top HIGH from existing audit | `counter`, `pop`, `bitter`, `plumb`, `round`, `solo`, `flush`, `express` | 8 | `tmp/metadata-audit-summary.md` top 8 |
| G3 other known-ambiguous verbs | `get`, `make`, `put`, `set`, `go`, `turn`, `come` | 7 | existing resolver tests |
| G4 structurally hard pilot | `pitch`, `lift`, `draft`, `flip` | 4 | reviewed overlay entries |

Total: **25 lemmas**, 437 PWN3 verb senses (`make` 49, `take` 42, `run` 41, `get` 36, `hold` 36,
`go` 30, `turn` 26, `set` 25, `lift` 24, `come` 21, `pop` 13, `think` 13, `pitch` 12, `flip` 11,
`consider` 9, `put` 9, `express` 7, `flush` 7, `mean` 7, `round` 7, `plumb` 4, `draft` 3,
`counter` 2, `solo` 2, `bitter` 1).

Rationale: G1 tests the named difficult cases; G2 tests whether the audit's own HIGH tier predicts
runtime failure (F12 predicts it does not — that is itself a finding worth recording); G3 gives
high-frequency baselines; G4 are lemmas the reviewed overlay already fixed, as a control group.

**Bounded size.** The previous **300-sense cap is removed** — it was unreachable (25 lemmas alone are
437 senses) and therefore meaningless as a guard. The **2 MB per-artifact cap is retained** and is the
only size constraint that does real work.

#### 1.2 Sentence frame — every lemma gets sentences; the context variants are gated

**Every one of the 25 lemmas gets at least 3 sentences** (≥75 sentences total), committed as a fixture
file (§7). The previous revision defined sentences only for G1, which made F12 untestable and made G2–G4
decorative. Each lemma's 3 sentences must span the lemma's observed constructions: one plain
transitive, one with a PP or particle, and one that is a known-ambiguity case from the pilot or overlay.

The 6 named pilot sentences are retained verbatim as the seeded cases:

| # | Lemma | Sentence | Observed today |
| --- | --- | --- | --- |
| S1 | `run` | `The machine will run on fuel.` | `ambiguous` |
| S2 | `mean` | `I mean doing the work now.` | `ambiguous` |
| S3 | `consider` | `I consider doing the work.` | `ambiguous` |
| S4 | `consider` | `I consider her foolish.` | `ambiguous` |
| S5 | `think` | `I think.` (bare/generic) | `ambiguous` |
| S6 | `think` | `I think that he is right.` | record actual |
| S7 | `think` | `I think of my mother.` | `ambiguous` |

**Replacement for S8–S11.** The previous design produced four adversarial variants (S8–S11) from only
three source sentences and confounded two effects. It is replaced by a **gated** pair per pilot lemma:

| Variant | Definition |
| --- | --- |
| `ctx_null` | The base sentence alone. Discriminating signal, if any, is inside the sentence. |
| `ctx_disc` | The base sentence preceded by a disambiguating sentence that supplies the referent or topic — e.g. `We refuelled it last week. The machine will run on fuel.` |

**Prerequisite check, run first (P1).** The resolver reads only the current `sentence` string;
`ContextWindowBuilder` forwards `previousSentence` **only** for referential openers, and `SenseInput`
accepts a single `sentence` plus optional `sentenceAnalysis`. So `ctx_disc` is only meaningful if
injected context actually reaches the resolver. Before classifying anything:

1. Inject `previousSentence` directly into `SenseInput` and confirm the resolver consumes it.
2. If it does not, record `contextInjectionSupported: false` and mark **every** `ctx_disc` row
   `NOT RUN`. Do **not** silently downgrade `ctx_disc` to `ctx_null` — that would re-create exactly the
   confound this replaces. The context conclusion then becomes `BLOCKED`, and §10 must treat a `BLOCKED`
   context result as **not** evidence for "needs discourse".

**Additionally report P1′ (diagnostic only, never decisive).** Run each pilot case a second time with
`verbFrames` stripped from every candidate. Report the flip count as M14. F14 measured **1 flip in 9**
cases; if the audit reproduces that, `SOFT_CONFLICT`/frame evidence is not the binding constraint, and
C0 must not be used to carry the decision. If the audit finds a substantially different rate, that
contradicts F14 and must be recorded as a contradiction (see §11).

#### 1.3 Gold set — the previous "Current expected" column was not gold

The previous revision's `Current expected` column recorded **resolver output**, which is the thing under
test. Scoring a resolver against its own output proves nothing. Replace it with:

- A committed fixture `tmp/context-gap/gold.json` mapping each sentence to an `acceptable_senses` set
  (canonical `wn3:` IDs, plus bundled IDs such as `run.move` where applicable).
- **Two annotators** produce the sets independently; disagreements are adjudicated and recorded. Agreement
  is reported as a number, and any sentence with unresolved disagreement is excluded from M10's
  denominator rather than guessed.
- Where the pilot test has an expectation (e.g. `hold breath` → `context`), use it as one annotator's
  input, not as ground truth.

This is what makes M10 and M13 meaningful: a "flip" counts only if the new outcome lands inside the
gold set.

### 2. Exact source artifacts to inspect

**Current stack (read-only, already present):**
- `release/wordnet/wordnet-verb.json` (1,915,605 bytes), `wordnet-noun.json`, `wordnet-adj.json`, `wordnet-adv.json`
- `release/dictionary/manifest.json` → the named pack (currently `context-lens-en-vi-2026.09.3.json`)
- `release/dictionary/context-lens-sense-metadata-reviewed.json`
- `release/wordnet/manifest.json`, `release/wordnet/WORDNET-LICENSE.md`

**Candidate A — Open English WordNet.** Repo `globalwordnet/english-wordnet`, branch `main`.
**The default branch has no usable release tags** (the releases/tags API returned none), so the edition
**must be pinned by commit SHA**, not by a version string. Record the SHA and a sha256 for every file
fetched, in `source-coverage.json`.

- `src/yaml/verb.*.yaml` (15 files) — synset definition, example, `ili`, `members`, `partOfSpeech`. **No
  `frames:` key exists here** (F10).
- `src/yaml/entries-*.yaml` (32 lemma files) — **this is where frame data lives**, at sense level under
  `subcat:` (F10).
- `src/yaml/frames.yaml` — the 41-label frame vocabulary mapping 1:N onto the 35 Princeton frames.
- `src/deprecations.csv`, `src/sense-orders.csv` — ordering / removed-sense policy.
- `LICENSE.md` — WordNet License + CC BY 4.0.

**Bridge — CILI.** Repo `globalwordnet/cili`, branch **`master`** (not `main` — the previous revision
omitted the branch and implied `main`):

- `ili-map-pwn30.tab` — 117,659 rows, PWN3 synset → ILI.
  `https://raw.githubusercontent.com/globalwordnet/cili/master/ili-map-pwn30.tab`
  sha256 `13B6741395A8BDF20E5A19686FFA49167653696D4F523DB17A79DCE3211A6627`
- `ili.ttl` — ILI inventory.

**Candidate B — VerbNet.** Mirror:
`https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/verbnet.zip`
This is **VerbNet 2.1** (F7) and is the measured baseline. **VerbNet 3.x exists** and is the version
actually worth evaluating; per D4, record its licence terms and PWN3 mapping rate alongside 2.1's rather
than treating 2.1's numbers as final. Whichever version is inspected, record sha256.
- `<VNCLASS>` files, each with `<MEMBERS>/<MEMBER name=… wn=…/>`, `<FRAMES>/<FRAME>` with
  `<SYNTAX>/<PREP>` and `<SEMANTICS>/<PRED>`, plus `<DESCRIPTION>` and `<EXAMPLES>`
- `README` (version statement), `vn_class-3.dtd`, `vn_schema-3.xsd`

**Pinning is mandatory.** Every artifact above records: URL, resolved commit SHA or version string, byte
size, and sha256. A number measured against an unpinned artifact is `UNRESOLVED`, not a finding.

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
- Step 2: scan `entries-*.yaml` (frame data, `subcat:`) and `verb.*.yaml` (definition, example, `ili`)
  once, building `ili → [oewn_synset]` and capturing `subcat`, `examples`, `definition`, `ili` per sense.
- **What CILI licenses.** An ILI match resolves *which* OEWN synset to read metadata from. It is **ID
  resolution, not sense equivalence** (D3). Two OEWN synsets sharing an ILI with a PWN3 sense may still
  have different scopes; the audit must never report CILI agreement as "these senses are the same".
- **Report only the coverage rate and the frame-split result.** Do not decide in this task whether
  OEWN definitions replace PWN3 definitions — that is a later decision.
- **The decisive measurement is F15/M15:** among sibling pairs whose PWN3 frame sets are identical, how
  many does OEWN `subcat` separate? Planner measurement says **0 of 229**. If the audit confirms a
  non-trivial number, F15 is wrong and must be recorded as a contradiction.

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

**Metrics 1–7 are the current baseline (always reported). M2 and M3 are demoted to baseline-only
descriptors** — they are saturated (M2 = 100%, M3 ≈ 93%) and therefore cannot discriminate between
cases; any classification keyed on them is pre-biased toward C5/C8/C10.

| # | Metric | Definition | Gap it exposes |
| --- | --- | --- | --- |
| M1 | `senseCount` | PWN3 senses for the lemma | polysemy scale |
| M2 | `framesCoverage` **(baseline only)** | senses with ≥1 `verbFrames` entry | saturated at 1.0 — descriptive, not decisive |
| M3 | `exampleCoverage` **(baseline only)** | senses with ≥1 example | ≈0.93 — descriptive, not decisive |
| M2′ | `siblingIndistinguishability` | **fraction of same-lemma sibling sense pairs whose PWN3 frame sets are identical** | the population any enrichment source must separate (F13: 229/2,446 over 6 pilot lemmas) |
| M4 | `distinctCollocationRatio` | collocations owned by exactly 1 sense ÷ senses (reuse `audit_sense_metadata.extracted_collocations`) | missing discriminative collocation |
| M5 | `sharedUsageOverlap` | collocation shapes owned by >1 sense | genuine ambiguity, not a metadata gap |
| M6 | `reviewCoverage` | senses present in the reviewed overlay | unresolved EN sense mapping |
| M7 | `domainCoverage` | senses with ≥1 WordNet `domain` marker | missing domain evidence |
| M8 | `prepositionCueRate` | senses whose examples/definitions contain a cue preposition after the lemma | missing preposition/particle pattern |
| M9 | `complementCoverage` | senses with ≥1 example whose `occurrenceConstruction` complement is non-`none`/non-`object` | missing complement pattern |

**Decisive metrics — these run in the TypeScript harness against the real resolver.**

| # | Metric | Definition | Gap it exposes |
| --- | --- | --- | --- |
| M10 | `acceptableOutcomeRate` | **fraction of benchmark sentences whose final `senseStatus` is `context` *and* whose selected sense is inside the gold `acceptable_senses` set.** Replaces the previous "MATCH for exactly one candidate", which is invalid for synonymous senses (B4) and scored against resolver output rather than gold (A5). | whether the resolver already lands on an acceptable sense |
| M11 | `falseConflictRate` | **fraction of sentences where ≥1 candidate receives `SOFT_CONFLICT` although the sense is actually compatible.** Measures the *modelled* conflict in corrected F4. | open-world evidence handling |
| M12 | `translationEquivalence` | fraction of sibling pairs where **both** members carry a VI gloss **and** those glosses are equivalent (F16: currently **0** measurable pairs) | redundant VI glosses worth deduplicating |
| M13 | `netFlips` | **count of benchmark sentences whose final `senseStatus` changes under the P1 intervention, where the new outcome is inside the gold set.** The unit the decision rule uses. | how many cases metadata could actually fix |
| M14 | `frameAblationFlipRate` | **fraction of pilot cases that flip when `verbFrames` is stripped from every candidate** (diagnostic; F14 measured 1/9 ≈ 11%). | whether frame evidence is the binding constraint |
| M15 | `oewnFrameSplitRate` | **fraction of identical-PWN3-frame sibling pairs that OEWN sense-level `subcat` separates** (F15 measured **0 of 229** over 6 pilot lemmas). | whether OEWN's finer frame vocabulary adds real discriminating power |

M13 is the pivot. `netFlips` — not a metric ratio, and not "A ≥ 4" — is what a source can actually buy.
M10 tells you how good the resolver already is against gold; M11 tests corrected F4; M14 keeps F14
honest; M15 is the hard gate in §10 that decides whether OEWN's frame data can be a reason at all.
If M13 is 0 for every source, then by construction no enrichment source can help, whatever its
coverage numbers look like. If M15 stays 0, OEWN's frames are ruled out *by measurement*, independent
of coverage.

### 5. Context-gap classification

For each benchmark sentence, assign exactly one **primary** category (first match in the priority order
below wins) and any number of secondary ones. Classification is **derived from measured fields**, not
from judgement alone.

**Priority order — first match wins.** (B3: the previous revision gave no order, so multiple categories
could apply and the A/B split was decided by the analyst's choice.)

| Order | Code | Category | Derivation rule |
| --- | --- | --- | --- |
| 1 | **C0** | **pipeline defect** *(diagnostic only — never the primary basis for a decision)* | a `SOFT_CONFLICT`/`HARD_CONFLICT` fired but M14 shows stripping `verbFrames` does **not** change the outcome (i.e. the conflict label is inert), or `ctx_disc` was `NOT RUN` while the sentence needs it. **C0 is excluded from the A/B split and from §10.** |
| 2 | C1 | missing stable EN sense mapping | lemma has PWN3 senses but M6 = 0 and no VI gloss maps |
| 3 | C2 | missing verb frame / valency | competing candidates have **empty** `verbFrames` (F17: bundled entries like `run.move`/`run.manage`), **or** M2′ shows the candidates are frame-identical and a source separates them |
| 4 | C3 | missing complement pattern | M9 low **and** `occurrenceConstruction` yields a specific complement (`infinitive`, `gerund`, `clause`, `object-infinitive`) |
| 5 | C4 | missing preposition / particle pattern | occurrence has `preposition`/`particle` **and** M8 low |
| 6 | C5 | missing discriminative collocation | M4 < 0.5 and M5 low → no unique usage evidence exists |
| 7 | C6 | missing example | M3 < 0.5 **and** the competing candidates are few enough that examples would plausibly separate them |
| 8 | C7 | missing domain evidence | M7 = 0 for the competing candidates |
| 9 | C8 | insufficient current sentence context | M2/M3/M9 are all adequate **and** M2′ = 1 for the competing pair (frame-identical) **and** the sentence contains no token unique to one sense |
| 10 | C9 | requires previous/next sentence or paragraph | `ctx_disc` changes the outcome **into the gold set** while `ctx_null` does not (and only when context injection is supported) |
| 11 | C10 | genuinely unresolved lexical ambiguity | the senses are semantically overlapping **even in OEWN and VerbNet**; no source separates them |

**The A/B split the task demands.**

- **Group A — solvable by better lexical metadata.** Categories `C1`–`C7`. These are statements about
  *what the lexical resource does not say*. Fixing them means adding evidence, not reading more text.
  **C0 is excluded.** A case in C0 is not solvable by shipping data; it is solvable by changing code,
  which is out of scope.
- **Group B — requires wider discourse context.** Categories `C8`, `C9`, `C10`. These are statements about
  *the input*: the evidence exists, or cannot exist, in the lexicon at all.

**The A-count is measured in flips, not in categories.** Per B2, Group A's size is **M13 `netFlips`**:
how many sentences a source actually moves into an acceptable outcome. A case that is nominally C2 but
whose outcome does not move when the missing metadata is supplied is **not** counted in A. Report the
category histogram **and** the flip count side by side, and let the flip count decide (§10).

**F3/F4 is the hypothesis to confirm or kill.** If `run on fuel` shows frame-identical candidates, no OEWN
frame separates them (F15), and no VerbNet class applies (F5), it is **C10** — a gap in nothing. Record
that outcome plainly rather than hunting for a source that "solves" it.

### 6. Benchmark cases

Derived from the classification, and scored against the gold set:

| Benchmark | Source sentences | Assertion |
| --- | --- | --- |
| B1 frames-decisive | any S whose M13 `netFlips` > 0 **and** whose primary category is C2 | these are the enrichment ROI cases |
| B2 collocation-decisive | any S currently resolved only by a `Collocation:` reason | overlay-scale review is enough; no new source |
| B3 context-only | `ctx_disc` / `ctx_null` pairs where the variant changes `senseStatus` **into the gold set** | proves discourse need, not lexical need. `NOT RUN` if context injection is unsupported. |
| B4 unfixable | cases landing in C10 **or** where M13 = 0 for every source | must remain `ambiguous`; guard against future over-claiming |

B4 is deliberately a **negative** benchmark. It exists to prove the audit does not manufacture
resolution, and it feeds a documentation note — not a new heuristic.

### 7. Expected outputs

| Output | Path | Shape |
| --- | --- | --- |
| Per-lemma metrics | `tmp/context-gap/lemma-metrics.json` | 25 rows, ≤ 300 KB |
| Per-sentence classification | `tmp/context-gap/case-classification.json` | one row per benchmark sentence, ≤ 200 KB |
| Gold set | `tmp/context-gap/gold.json` | sentence → `acceptable_senses`; adjudicated (§1.3) |
| Source coverage report | `tmp/context-gap/source-coverage.json` | per-source: URL, commit SHA, sha256, size, license, PWN3 mapping rate |
| Verbatim licenses | `tmp/context-gap/licenses/` | OEWN `LICENSE.md`, VerbNet `VERBNET_LICENSE.txt` |
| **Human summary** | `docs/reports/context-gap-audit.md` | Markdown, **the only committed artifact besides this spec** |
| Harness | `tmp/context-gap/harness/` | `.probe.test.ts` + its vitest config (§1.0). Lives in `tmp/`; git-ignored; invisible to `npm test`. |
| Python-side metric script | `scripts/audit_context_gap.py` | compact, deterministic, `--offline` and `--with-sources` flags; owns pack-level metrics only |
| Python-side tests | `scripts/test_audit_context_gap.py` | mirrors `test_audit_sense_metadata.py` style |

`docs/reports/` does not exist yet; creating it is part of this task's output.

The summary report must contain: the A/B split table with **flip counts**, the M10/M13 results, the M15
frame-split result, the source decision, the license verdict, the gold-set annotator agreement rate, and
the explicit list of C10 cases.

### 8. STOP CONDITIONS

Stop and report; do not work around.

| # | Condition | Action |
| --- | --- | --- |
| S-1 | Either candidate source cannot be downloaded | Mark that candidate `UNAVAILABLE`, run the current-stack baseline only, report the partial result. **Do not** substitute a random mirror. |
| S-2 | CILI `ili-map-pwn30.tab` unavailable or < 90% pilot mapping rate | OEWN mapping is `INFEASIBLE`. Report the measured rate. Do not build a fuzzy matcher. |
| S-3 | VerbNet license text cannot be retrieved verbatim | VerbNet is `LEGALITY-UNVERIFIED`. It cannot proceed regardless of coverage numbers. |
| S-4 | Sample coverage < 25 lemmas, or any lemma has < 3 sentences, or resolution takes > 5 minutes for the current-stack pass | Report what was measured, label the rest `NOT RUN`. |
| S-5 | The script needs to modify anything under `src/` or `release/` | Stop. This is an analysis task; that finding belongs in the report, not in code. |
| S-6 | Any artifact would exceed 2 MB | Summarise instead of emitting. Never commit a large dump. |
| S-7 | Download or parse fails twice | Classify the failure once, apply at most one safe fallback, then stop per the Terminal Loop Guard in [agent-execution-rules.md](../agent-execution-rules.md). |
| S-8 | The harness appears in `npm test` output, or `npm run verify:partitions` reports an orphan/duplicate scope | The harness leaked into a verification gate. Move it fully under `tmp/` with its own config; do not edit `vite.config.ts` to accommodate it. |
| S-9 | `node_modules/.bin` would need `tsx` or `vite-node` | Use §1.0 Option A or B instead. Never add a dependency for the harness. |
| S-10 | The context-injection prerequisite check (§1.2 P1) fails | Mark all `ctx_disc` rows `NOT RUN` and the context conclusion `BLOCKED`. Do not silently substitute `ctx_null`. |
| S-11 | `package.json` or the lockfile shows any diff at the end | `FAIL` for this task regardless of findings. |
| S-12 | Any artifact fetched from upstream has no recorded commit SHA and sha256 | The result derived from it is `UNRESOLVED`. Re-pin, or report the number as `UNRESOLVED`. |

### 9. Authoritative verification command

There is **no source change**, so no `verify:*` gate applies — this is consistent with
[docs/verification-map.md](../verification-map.md), which records dictionary audits as `audit:*`, not
verification gates. Label every check `PASS`, `FAIL`, `BLOCKED`, `UNRESOLVED`, or `NOT RUN`. **Never
report a non-pass as a pass, and never change code because a check was `BLOCKED`, `UNRESOLVED` or
`NOT RUN`.**

**V1 — the resolver harness runs green** (exercises the real `SenseResolver`, proving the §4 decisive
metrics are computable):

```powershell
node_modules\.bin\vitest.cmd run --config tmp/context-gap/vitest.config.ts
```

**V2 — the Python-side audit is deterministic** across two runs and asserts the sample frame:

```powershell
python scripts/test_audit_context_gap.py
```

It must assert: deterministic output across two runs; C10 cases stay in C10; no emitted artifact
exceeds 2 MB; the sample frame is exactly **25 lemmas** and every lemma has ≥3 sentences; gold-set
coverage is complete for the scored sentences.

**V3 — the harness did not become a verification gate.** This must hold, and if it does not, S-8 applies:

```powershell
npm.cmd test -- --silent
npm.cmd run verify:partitions
```

Expected: no `tmp/context-gap/**` file in the test list, and no orphan/duplicate scope.

**V4 — repository cleanliness.** All four must be empty:

```powershell
git --no-pager diff --stat -- src release
git --no-pager diff --stat -- package.json package-lock.json
git --no-pager diff --stat -- vite.config.ts
```

A non-empty result on any of these is a `FAIL` for this task regardless of the audit's findings.
Specifically, `release/dictionary/context-lens-sense-metadata-reviewed.json` must be byte-identical.

**V5 — existing pilot expectations unchanged** (cross-check, report as `NOT RUN` if skipped):

```powershell
npx.cmd vitest run src/lookup/reviewedSenseMetadata.test.ts
```

On Windows use `npm.cmd` / `npx.cmd`; a `.ps1` execution-policy error is not evidence that the `.cmd`
launcher is blocked. Per the Terminal Loop Guard, classify each failure once, take at most one safe
fallback, then stop and report.

### 10. Decision rule

**The unit is M13 `netFlips`** — sentences a source actually moves into an acceptable outcome — not a
metric ratio and not a category count. `A` = Group A cases that a source demonstrably flips into the gold
set. `B` = Group B cases. Report P0 (current stack) alongside every P1 number.

| Input | Outcome |
| --- | --- |
| OEWN availability `OK` **and** CILI mapping ≥ 90% **and** licence `VERIFIED` **and** `A ≥ 4` **and** M15 (OEWN `subcat` splits ≥ 10% of identical-frame sibling pairs) | **OEWN proceeds**, VerbNet does not |
| OEWN passes availability + mapping + licence, but `A < 4` and VerbNet yields `A ≥ 2` | **VerbNet proceeds** only if licence is `VERIFIED`; otherwise neither |
| Both yield `A ≥ 2`, and they are complementary (OEWN = frames/definitions, VerbNet = preposition patterns) with no conflicting sense identity | **both proceed**, in separate tasks, OEWN first |
| `A < 2` for every source, **or** ≥ 60% of the sample lands in C8/C9/C10, **or** M15 = 0 | **neither** — the bottleneck is discourse context, and the next task is sentence/paragraph scope, not a new lexicon |
| The context result is `BLOCKED` (S-10) and `A < 4` | **neither, conclusion `BLOCKED`** — do not infer a context need from a blocked check |
| Any source is `LEGALITY-UNVERIFIED` | that source **cannot** proceed, regardless of numbers |

**M15 is a hard gate, not a nicety.** F15 measured that OEWN's sense-level `subcat` splits **0 of 229**
identical-PWN3-frame sibling pairs. A finer vocabulary over an identical partition adds no discriminating
power. If the audit confirms that, OEWN's frame data cannot rescue `run on fuel` or any frame-identical
pair, and OEWN would have to be justified by definitions/examples (M4/M5) instead — a materially weaker
case that this table already forces into the `A < 4` row.

**First binding sub-rule — P1 is diagnostic, not decisive.** F14 measured that stripping `verbFrames`
from every candidate flips **1 of 9** pilot cases. So the framing "the obstacle is the conflict label"
is not supported at scale. C0 is excluded from the A/B split and from this table. If the audit finds a
materially different flip rate, that contradicts F14 and must be recorded as an explicit contradiction
(§11) — do not quietly re-weight C0.

**Second binding sub-rule.** F7 (VerbNet 2.1, dead upstream URL) plus F11 (attribution must appear on
**all** copies including derived artifacts) mean VerbNet carries real, ongoing compliance cost against a
stale corpus. VerbNet must clear a higher bar than OEWN, and "it has more frames" is not a reason.
The 3.x evaluation noted in Q6 must be completed before any VerbNet decision is treated as final.

**Third binding sub-rule — CILI is not sense equivalence.** F9's 99% is an **ID-resolution** rate. The
decision may rely on it to locate metadata, never to assert that a PWN3 sense and an OEWN sense are the
same thing.

### 11. Expected conclusion shape — pre-registered, falsifiable hypotheses

Stated now so the Implementer knows what a result looks like, **not** as the answer. Each hypothesis is
stated so that a contradicting measurement is *recognisable*. If the measured data contradicts any
hypothesis, **the data wins** and the contradiction must be recorded explicitly in the report.

| # | Hypothesis | Falsified if |
| --- | --- | --- |
| **H1** | The named hard cases are **not** fixable by adding lexical metadata. `run on fuel`, `mean doing`, `consider doing` and `think` resolve to frame-identical candidates, and no source separates them. | a source produces `netFlips > 0` for any of these, or M10 shows the resolver already lands in the gold set |
| **H2** *(corrected — was "frame-vs-occurrence modelling mismatch")* | The obstacle is **not** an inert `SOFT_CONFLICT` penalty. Corrected F4: `SOFT_CONFLICT` never scores; only `MATCH` emits an event. The real obstacle is that the winning bundled candidates (`run.move`, `run.manage`) carry **no** `verbFrames`, so `frameEvidence` returns `UNKNOWN`. | stripping `verbFrames` changes the outcome on ≥ 50% of pilot cases (**contradicts F14's 1/9**), or M11 shows `SOFT_CONFLICT` is applied to senses that are in fact compatible |
| **H3** *(withdrawn)* | ~~OEWN's finer frame vocabulary splits otherwise-indistinguishable sibling pairs.~~ | **Already falsified by measurement.** Across 6 pilot lemmas — 148 senses, 2,446 sibling pairs, **229** with identical PWN3 frame sets — OEWN sense-level `subcat` splits **zero**. Finer vocabulary, identical partition. H3 is withdrawn and replaced by **H3′**. |
| **H3′** *(replaces H3)* | No lexical source in this audit can raise M10 for the frame-identical sibling population, because M2′ shows that population exists and M15 shows OEWN does not partition it further. | M15 > 0 with a non-trivial split rate **and** a resulting `netFlips > 0` |
| **H4** | VerbNet should not proceed for this pilot set: coverage is minimal (F5) and WordNet mapping is partial by construction (F6, 23.1% unmapped), against a stale 2.1 distribution (F7) with recurring attribution cost (F11). | a measured `A ≥ 2` from VerbNet with a `VERIFIED` licence and a 3.x evaluation on record |
| **H5** *(new, replaces the withdrawn `E` class)* | The VI glosses are too sparse to support a translation-equivalence class. M12 has **0** measurable pairs across the pilot (F16). | M12 > 0 on the full 25-lemma sample |
| **H6** | The existing HIGH priority tier does not predict runtime failure (F12), and must not be used to select enrichment targets. | a measured correlation between HIGH membership and `netFlips > 0` across the 8 G2 lemmas |
| **H7** | The bottleneck, if not enrichment, is discourse context — i.e. ≥ 60% of the sample lands in C8/C9/C10. | `A ≥ 4` from any source |

F12 means the existing HIGH priority tier is not a proxy for runtime failures and should not be used to
select enrichment targets — now **testable**, because §1.2 gives the G2 lemmas sentences.

### 12. Verification proportionality

Classify before verifying. This is `read-only analysis + new test fixture` — no `src/` change — so the
checks in §9 are the right set, and `verify:full` is escalation-only and **not** expected to run.
If §9's V1–V4 pass and V5 reproduces the existing pilot expectations, stop. Do not run `verify:full`
because the audit touched no runtime path.

## ACCEPTANCE CRITERIA

1. `tmp/context-gap/gold.json` exists, is **adjudicated by two annotators**, and covers every scored
   sentence; agreement rate is reported. No scored metric uses resolver output as its own gold.
2. `tmp/context-gap/harness/` runs green via §1.0 Option A or B, exercising the **real** `SenseResolver`,
   with **no** dependency added (`package.json`/lockfile untouched).
3. The sample frame is exactly **25 lemmas / 437 senses**, every lemma has ≥3 sentences, and this is
   asserted by a test.
4. `tmp/context-gap/` contains `lemma-metrics.json`, `case-classification.json`, `gold.json`,
   `source-coverage.json`, `licenses/`.
5. `docs/reports/context-gap-audit.md` contains the **A/B split with flip counts**, M10/M13/M14/M15
   results, per-source availability + license verdict, the gold-set agreement rate, and the explicit C10 list.
6. Each benchmark sentence carries exactly one primary category (C0–C10, first-match priority order) plus
   optional secondaries; C0 is excluded from the A/B split.
7. Every upstream artifact is pinned by commit SHA **and** sha256 in `source-coverage.json`; anything
   unpinned is reported `UNRESOLVED`.
8. OEWN mapping feasibility is resolved **by measurement**, via CILI — used as an ID bridge only, never
   as a sense-equivalence claim.
9. VerbNet license terms are quoted verbatim, and both 2.1 and 3.x mapping rates are measured.
10. **Decision (OEWN / VerbNet / both / neither) is stated with the `netFlips` numbers that produced it.**
11. The `ctx_disc` prerequisite check (§1.2 P1) was run and its result recorded; if unsupported, every
    `ctx_disc` row is `NOT RUN` and the context conclusion is `BLOCKED`, not "needs context".
12. `git --no-pager diff --stat -- src release package.json package-lock.json vite.config.ts` is empty.
13. `release/dictionary/context-lens-sense-metadata-reviewed.json` is byte-identical.
14. Every check in §9 carries an explicit `PASS` / `FAIL` / `BLOCKED` / `NOT RUN` label.

## DOC IMPACT

- `docs/reports/context-gap-audit.md` — new; the audit's human-readable result. `docs/reports/` does not
  exist yet and is created by this task.
- [docs/DICTIONARY_PACK.md](../DICTIONARY_PACK.md) — **only** if the audit concludes a new source should
  proceed; then a short "candidate sources considered" note. No change now.
- [docs/verification-map.md](../verification-map.md) — **no change.** This task adds no `verify:*` script;
  adding one would break the parity check in `scripts/check_architecture_contracts.mjs`.
- [docs/translation-pipeline.md](../translation-pipeline.md) — **no change.** This task changes no runtime behavior.

Architecture docs are not touched: ownership, subsystem boundaries, control flow and data flow are unchanged.

## OPEN QUESTIONS / RISKS

1. **`tmp/metadata-audit.json` is 94.5 MB.** Regenerating it costs time and disk. Read
   `tmp/metadata-audit-summary.md` for tier selection and re-run the script only if a column is needed.
2. **OEWN edition pinning is by commit SHA, not a tag.** The default branch has no usable release tags,
   so a moving `main` makes numbers non-comparable across runs. Pin the SHA in `source-coverage.json`
   and treat an unpinned measurement as `UNRESOLVED`.
3. **23.1% unmapped VerbNet members (F6)** may be partly an artifact of the nltk mirror rather than
   VerbNet itself. Verify against a second distribution — ideally VerbNet 3.x — before treating F6 as
   authoritative.
4. **VerbNet 3.x licensing is unknown and may differ from 2.1.** If 3.x terms are not compatible with
   the redistribution model in F11, the 3.x evaluation is moot. Measure its licence verbatim (S-3)
   before spending coverage effort on it.
5. **`take` maps 41/42 through CILI.** The single miss is unexplained; record it rather than assuming
   a bridging exception.
6. **Whether the context-injection check will pass is unknown.** If `ContextWindowBuilder` only forwards
   `previousSentence` for referential openers, `ctx_disc` may be `BLOCKED` for most cases (S-10), which
   would leave the discourse question open rather than answered. That is an acceptable outcome and must
   be reported as such — not converted into a "needs context" conclusion.
7. **M12 may be unmeasurable at scale.** F16 found 0 measurable pairs over 6 lemmas. Over 25 lemmas the
   count may still be ~0. If so, report M12 as **not computable** on shipped data rather than as a
   failure; the `E`/harmless-equivalence class stays dropped (E3).
8. **Gold annotation is the largest remaining cost.** Two annotators over ≥75 sentences is the dominant
   effort in this task and is not automatable. If only one annotator is available, label M10/M13
   `UNRESOLVED` rather than reporting a single-annotator rate as if it were gold.
