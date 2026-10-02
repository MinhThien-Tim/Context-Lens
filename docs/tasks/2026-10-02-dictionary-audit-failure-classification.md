# Dictionary audit failure classification

ROLE                  Investigator (read-only — no resolver, dictionary, or metadata change made)
TASK                  Classify all 64 dictionary-audit failures as A (VI data mismatch) / B (audit
                       expectation too rigid) / C (genuine English sense-selection error), with
                       C1–C4 sub-classification, and nominate real-error candidates for a later T3
                       sense audit.
FINDINGS               57 of 64 (89.1%) are audit-expectation defects, not product defects. 7 of 64
                       (10.9%) are genuine sense-resolution errors. Zero failures are standalone
                       translation-data errors, though 2 of the 7 C cases contain an A-class data
                       defect as a contributing cause.
STATUS                Rewritten 2026-10-02 after re-validation. The earlier C3/C4 split used a
                       gloss-index-position heuristic and is **withdrawn** — see "Revision log".

## Headline

| Class | Meaning | Count | % of 64 |
| --- | --- | ---: | ---: |
| **A** | Translation/VI data mismatch or missing usable VI meaning | 0 | 0.0% |
| **B** | Audit expectation too rigid / not a reliable correctness criterion | 57 | 89.1% |
| **C** | English sense selection appears incorrect in context | 7 | 10.9% |
| | **Total** | **64** | **100%** |

### B breakdown

| Sub | Mechanism | Count |
| --- | --- | ---: |
| B1 | `Xem <target>` cross-reference stub expected instead of its dereferenced meaning | 47 |
| B2 | Leading capital + trailing `.` defeat the exact substring test | 3 |
| B3 | Multi-gloss truncation — only a comma/`/` fragment of the expected gloss survives | 6 |
| B4 | Delimiter-join near-miss — expected gloss present but joined with `' / '` | 1 |
| | **Total** | **57** |

### C breakdown

| Sub | Meaning | Count | % of C | Lemmas |
| --- | --- | ---: | ---: | --- |
| C1 | Correct sense absent from the candidate set (binding gap) | 2 | 28.6% | `lucent`, `nescience` |
| C2 | Correct sense present but carries no usable VI metadata | 2 | 28.6% | `omen`, `sporty` |
| C3 | Correct sense present **with** metadata, resolver still picks a different candidate | **0** | **0.0%** | — |
| C4 | Candidates remain genuinely ambiguous (margin 0, no diagnostic signal) | 3 | 42.9% | `world`, `light`, `withdraw` |
| | **Total** | **7** | **100%** | |

**C3 is empty.** That is the single most important finding of this re-validation, and it is a
negative result backed by direct evidence rather than an omission — see "Why C3 is empty".

## The decisive test

Classification does not rest on reading the glosses positionally. For each of the 17 lemmas that
carry WordNet senses, three sentence frames were run through the real resolver, and for **every
candidate** the pack gloss index bound to that candidate was recovered from
`alignment.evidence` (the `bundled.context-lens.skypedia.en-vi:<lemma>:<offset>` token, mapped
back through `viSenses` to its `glossIndex`).

This yields one boolean per lemma: `carriesExpectedGloss` — whether **any** candidate carries the
gloss the audit expects (`meaningsVi[0]`).

- `carriesExpectedGloss > 0` → **B**. The resolver did bind the expected VI meaning; only string
  granularity, case, or a delimiter defeated the audit's exact-substring test.
- `carriesExpectedGloss == 0` → **C**. The expected gloss is unreachable by construction, so no
  resolver improvement could satisfy this expectation.

| Lemma | Candidates | `carriesExpectedGloss` | Verdict |
| --- | ---: | ---: | --- |
| `accruement` | 1 | 1 (selected, bound 0) | B3 |
| `coherence` | 2 | 1 (selected, bound 0) | B3 |
| `emblematic` | 2 | 1 (selected, bound 0) | B3 |
| `perspective` | 2 | 1 (selected, bound 0) | B3 |
| `predict` | 2 | 1 (selected, bound 0) | B3 |
| `untimely` | 3 | 1 (selected, bound 0) | B3 |
| `syllabize` | 2 | 1 (selected, bound 0) | B4 |
| `drunkard` | 1 | 1 (selected, bound 0) | B2 |
| `pacifier` | 3 | 1 (selected, bound 0) | B2 |
| `phylloclade` | 1 | 1 (selected, bound 0) | B2 |
| `lucent` | 1 | **0** | C1 |
| `nescience` | 1 | **0** | C1 |
| `omen` | 2 | **0** | C2 |
| `sporty` | 3 | **0** | C2 |
| `world` | 9 | **0** | C4 |
| `light` | 47 | **0** | C4 |
| `withdraw` | 12 | **0** | C4 |

## Root causes

Two production-path facts explain every one of the 64 failures.

**1. The audit reads raw pack JSON; the product reads the dereferenced pack.**
`resolveVietnamese()` in `src/lookup/dictionary/packs.ts:110-137` dereferences `Xem <target>`
cross-references at pack-install time (regex `^Xem ([a-z][a-z' -]*)\.?$`, recursive, depth 2,
cycle-guarded). The audit at `src/lookup/dictionary-coverage.audit.test.ts` loads the pack file
directly and takes `meaningsVi[0]` verbatim, so for 47 entries the expectation is the literal
string `"Xem apocryphal"`. All 47 were verified: every cross-reference target exists as a real
pack entry, so these are B1 expectation defects, not broken data.

**2. `meaning_vi` is the *resolved sense's* glosses, not the entry's gloss list.**
`src/core/language/local-language-engine.ts:96-97` emits
`quick.vietnamese.meaning = senseVietnameseMeanings(sense).join(' / ')` when a sense is selected,
falling back to the whole `meaningsVi` array otherwise, then `adapter.ts` wraps that single string
into `quick.meaning_vi: [vi]`. Meanwhile the audit's `correctMeaning` test is
`textVi.includes(meaningVi.toLowerCase())` — an **exact substring** test on the expectation
`meaningsVi[0]`. Any difference in capitalisation, trailing punctuation, or a comma-split
fragment therefore fails even when the sense is right.

### Audit-design defects

- **`xem` is missing from the usable-entry filter.** The exclusion regex at
  `dictionary-coverage.audit.test.ts` rejects `số nhiều|dạng|quá khứ|plural|past|present` but not
  `Xem`, so 47 stub entries are admitted to the corpus that were never meant to be tested.
- **The synthetic frame is semantically empty.** `makeRequest` builds
  `"The selected expression is ${surface}."`, so `contextMatch` is never reachable
  (`semanticScore >= 3 && independentSemanticScore >= 2 && margin >= 2`), and every diagnostic
  reads `Semantic margin: 0`.
- **The same frame misfires POS arbitration.** `occurrencePos`
  (`src/core/language/pos-arbitration.ts:15`) returns `'verb'` when `grammar.predicates` contains
  the token index, which happens on the copula frame for `omen` and `light`. In `omen` this drives
  the resolver onto the verb sense.

### Offsets are never joined (systemic, not per-failure)

Pack `viSenses` offsets are 6-digit **WordNet 3.0** offsets; resolver candidate IDs are **WordNet
3.1** (`wn3:a:00279332`). None of the pack's offsets exist as synsets in the shipped
`release/wordnet/wordnet-*.json` (3.1) data. VI↔EN binding is therefore done **entirely** by
`alignBilingualSenses`'s `inferred` path (POS + grammar + anchor-gloss support), never by offset
identity. `sources.english` in the pack labels the provider `'wordnet-3.0'` while serving 3.1 data —
a labeling inaccuracy worth recording separately. No reviewed overlay exists for any of the 7 C
lemmas (`reviewedEntry: null`), so all of their alignment is machine-inferred.

## Representative manually reviewed cases

### B1 — stub cross-reference (47)
`artisanship` — expect `"Xem artisan"`, got `"Thợ thủ công."`. Target `artisan` exists in the pack;
the pipeline correctly followed the cross-reference. `umbral` — expect `"Xem umbra"`, got `"Bóng."`.
Same mechanism. The expectation is testing the pack's internal indirection, not the product.

### B2 — capital + trailing period (3)
`drunkard` — expect `"Người nghiện rượu."`, got `"người nghiện rượu"`. Codepoint dump confirms both
strings are NFC-normalised and identical except for the leading capital and the final `.`.
`pacifier` (`"Người hoà giải."` vs `"người hoà giải"`) and `phylloclade`
(`"Cành dạng lá."` vs `"cành dạng lá"`) are the same defect. In all three the binding probe shows
a single candidate, selected, carrying gloss 0 — the correct sense was resolved every time.

### B3 — multi-gloss truncation (6)
`emblematic` — expect `"Tượng trưng, biểu tượng, điển hình."`, got `"tượng trưng"`.
`senseVietnameseMeanings` splits the pack gloss on `/`, `;`, `·` and commas, keeping only the first
fragment. Same for `accruement` (`"Sự dồn lại, sự tích lại."` → `"sự tích lại"`), `coherence`,
`perspective`, `predict`, `untimely`. All six have the correct gloss **bound** to the selected
candidate (`boundIdx=0`); the information is present and the audit simply cannot match it.

### B4 — delimiter-join near-miss (1)
`syllabize` — expect `"Chia thành âm tiết."`, got `"chia thành âm tiết / đọc theo âm tiết"`.
Lowercased, the expectation is `"chia thành âm tiết."`; the output continues `" / đọc…"` after
`âm tiết`, so `includes()` fails on the final `.` alone. This is the closest call in the set: the
expected text is present and correct, defeated purely by punctuation.

### C1 — correct sense absent (`lucent`)
Pack binds two VI senses (`141455 → gloss 0 "Trong."` = *clear/transparent*, `160407 → gloss 1`).
The resolver has exactly **one** candidate, `wn3:a:00279332` "softly bright or radiant", bound to
gloss **1** (`"sáng chói / sáng ngời"`). WordNet 3.1 contains only one `lucent` synset, so the 3.0
offset `141455` has no counterpart in the candidate set at all. Frame-invariant across copula and
noun frames — the gloss-0 meaning is genuinely unreachable, not merely outranked.
### C1 — correct sense absent (`nescience`) *(with A-class data defect)*
Pack binds `159018 → gloss 0 "Thuyết không thể biết."` (*the theory of the unknowable*) and
`203656 → gloss 1 "Sự không biết."` (*ignorance*). One candidate, `wn3:n:05988743` "ignorance
(especially of orthodox beliefs)", bound to gloss **1**. Gloss 0 is a semantically distinct,
esoteric doctrine with **no WordNet 3.1 synset**. Frame-invariant. This is best understood as an
**A-class data artifact** — the pack declares a VI sense with no EN counterpart — surfacing as C1.
Reported as C2's sibling rather than hidden.

### C2 — correct sense present but no usable metadata (`omen`)
Two candidates. The noun `wn3:n:07286368` "a sign of something about to happen" is the correct sense
for the bare lemma, but has `pairingState=missing`, `vi=[]`, `alignment=unresolved` — gloss 0
`"Điềm."` failed to bind to it. The verb `wn3:v:00871942` "indicate by signs" bound to gloss 1
`"báo hiệu"`. In the audit copula frame `occurrencePos` misfires to verb and the resolver selects the
verb. In a noun frame it selects the noun — but because that candidate has `vi=[]`, the engine
falls back to dumping the entry's entire 6-gloss `meaningsVi` list, which is why the noun frame
*appears* to pass. That pass is degenerate: it is the fallback path, not a sense resolution.

### C2 — correct sense present but no usable metadata (`sporty`) *(with A-class data defect)*
Three adjective candidates. The selected `wn3:a:00956733` "exhibiting or calling for sportsmanship or
fair play" carries `vi=["thẳng thắn"]` bound to gloss **1** (`"Thượng võ, thẳng thắn, trung thực,
dũng cảm."`), not gloss 0 (`"Thể thao, có tính chất thể thao."`). Its alignment evidence is
`["compatible POS", "bilingual-alignment-4", …, "sporting", "fair"]` — the `inferred` path used
anchor terms *"sporting"* and *"fair"* that overlap **gloss 1** (*chivalrous / fair*), producing a
defensible-but-different pairing. The candidate that best matches gloss 0 is
`wn3:a:00033475` "appropriate for sport or engagement in a sport", which has
`pairingState=missing`, `vi=[]`. So the correct sense exists but carries no usable metadata (C2),
and the binding that did occur chose the wrong gloss (A-flavoured data defect). Frame-invariant.
This is the clearest genuine alignment defect in the set.

### C4 — genuinely ambiguous (`withdraw`)
12 candidates, 11 alternatives, **all** with `semanticScore: 0`, `Semantic margin: 0`, "No evidence
distinguishing this meaning from the alternatives". Selected `wn3:v:01994442` "pull back or move
away or backward", bound to gloss **2** (`"Rút, rút lui."`) vs expected gloss 0 (`"Rút, rút lại."`).
Frame-invariant across copula and noun frames. No candidate carries gloss 0; even a perfect resolver
could not reach it.

### C4 — genuinely ambiguous (`world`, 9 candidates)
Nine candidates; diagnostics identical: margin 0, no distinguishing evidence. Selected
`wn3:n:09466280` "everything that exists anywhere" bound to gloss 1 (`"Vũ trụ"`) instead of gloss 0
(`"Giới."`). The eight `world` noun synsets span the entire semantic range — "all living human
inhabitants of the earth", "people in general", "the 3rd planet from the sun", "everything that
exists anywhere", "concerns of this life" — with no evidence separating them. Gloss 0 `"Giới."` is
a generic hypernym with no distinguishing signal. In a noun frame the resolver instead selects the
**adjective** `wn3:a:01568684` "involving the entire earth" via the same `occurrencePos` misfire,
which again returns `vi=[]` and triggers the degenerate full-list fallback.

### C4 — genuinely ambiguous (`light`, 47 candidates)
6 verb + 25 adjective + 14 noun + 1 adverb senses, all `semanticScore: 0`. Selected
`wn3:v:00291873` "make lighter or brighter" bound to gloss **17** (`"Soi sáng, chiếu sáng."`) vs
expected gloss 0 (`"Nhanh nhẹn."`). In a noun frame it selects adjective `wn3:a:01186408` "of
comparatively little physical weight or density" with `vi=[]`, returning the full 28-gloss list.
Widest ambiguity in the corpus; zero diagnostic signal available.

## Why C3 is empty

C3 requires a candidate that **has** the expected VI metadata and is **not** selected. Across all
17 probed lemmas and 3 frames, every candidate bound to gloss 0 was also the candidate selected —
and every unselected candidate had `pairingState=missing` / `vi=[]`. The binding probe found no
instance of "usable metadata present, yet discarded in favour of a worse candidate".

This means the earlier report's C3 labels were an artefact of comparing gloss **indices**
(`selected boundIdx=1 vs expected 0` ⇒ "wrong candidate") without checking whether the correct gloss
was carried by **any** candidate at all. Where a different gloss index was selected, the expected
gloss was simply absent (C1/C2/C4), never present-but-ignored (C3).

## T3 real-error sense-audit candidates

Ranked by concreteness of the defect and reproducibility:

| Rank | Lemma | Class | Why it qualifies |
| ---: | --- | --- | --- |
| 1 | `sporty` | C2 + A | Concrete, frame-invariant mis-binding: `inferred` alignment anchored on *"fair"* and chose gloss 1 over gloss 0. Reproducible from a single deterministic candidate set. |
| 2 | `omen` | C2 | Correct noun sense exists but is `pairingState=missing`; selection flips with frame, and the apparent noun-frame pass is the degenerate fallback. |
| 3 | `world` | C4 | Highest-value ambiguity probe: 9 candidates, zero margin, **and** the selected POS changes with the frame (noun → adjective). Exposes both the alignment gap and the `occurrencePos` defect. |
| 4 | `nescience` | C1 + A | Pack VI sense with no WordNet 3.1 EN counterpart — a clean data-provenance case. |
| 5 | `lucent` | C1 | Same provenance shape with a 1-candidate set: cleanest possible demonstration that the gloss-0 meaning is unreachable. |
| 6 | `light` | C4 | Widest ambiguity in the corpus (47 candidates, zero signal); a stress case rather than a fixable bug. |
| 7 | `withdraw` | C4 | 12 candidates, frame-invariant margin 0; useful as the controlled comparison for `world`. |

`world` is the strongest single subject for the T3 audit because it exercises the alignment gap,
the zero-margin ambiguity, and the POS-misfire defect simultaneously. `sporty` is the strongest
subject if the goal is a fixable, high-confidence alignment defect.

## Revision log

The first pass of this investigation split C into C3=2 / C4=5 using the **position** of the bound
gloss index. Re-validation rejected that method and the labels derived from it.

| Lemma | Earlier label | Corrected label | Why it changed |
| --- | --- | --- | --- |
| `lucent` | C4 | **C1** | Gloss 0 is carried by zero candidates; WordNet 3.1 has one synset. Unreachable, not ambiguous. |
| `nescience` | C4 | **C1** (+A note) | Same: 1 candidate bound to gloss 1; gloss 0 has no 3.1 synset. |
| `sporty` | C3 | **C2** (+A note) | The gloss-0-matching candidate `a:00033475` has `vi=[]`; the selected candidate *does* carry metadata, just for gloss 1. |
| `omen` | C3 | **C2** | The noun candidate exists but has no VI; the verb mis-selection is downstream of the missing metadata, not an independent discard. |
| `world`, `light`, `withdraw` | C4 | **C4** (confirmed) | `carriesExpectedGloss == 0` plus margin 0 across 9 / 47 / 12 candidates. |

Also corrected: the earlier claim that "`omen` is both C3 and C4" was an internal inconsistency
caused by the position heuristic. Every case now has exactly one primary class.

## Verification

| Check | Result |
| --- | --- |
| 64 failures reproduced without the `slice(0,50)` cap | **PASS** — `total 800`, `failures 64` |
| Binding probe, 17 lemmas × 3 frames, real resolver | **PASS** |
| All 47 stub cross-reference targets exist in pack | **PASS** — `missingTarget=0` |
| WordNet 3.0→3.1 offset absence confirmed for pack `viSenses` | **PASS** |
| Reviewed-overlay absence confirmed for all 7 C lemmas | **PASS** — `reviewedEntry: null` |
| Production source, resolver, dictionary data, metadata modified | **NOT RUN** — by design; task is read-only |
| `typecheck` / `verify:*` | **NOT RUN** — no production change |
| Architecture doc update | **NOT RUN** — not required (AGENTS.md §3: read-only investigation, no ownership or control-flow change) |

Evidence artifacts were diagnostic-only and have been removed; the tables above carry the findings.
