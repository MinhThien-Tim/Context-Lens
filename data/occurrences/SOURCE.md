# Occurrence source — FROZEN (v2)

**Status:** FROZEN (v2) — sampling complete. §1–§7 are the pre-sampling source
decision and remain unchanged; §8 records the outcome of the single frozen run.

This file is the authority for the occurrence source used by T1 Phase 5, T3, T4 and
T5. The sampler ([scripts/build_occurrence_dataset.mjs](../../scripts/build_occurrence_dataset.mjs))
must not be re-pointed at a different corpus. Any additional occurrence beyond this
source requires an explicit recorded reason.

**Amendments applied before sampling (T0 → T0b):**
- `resolver_seen` exclusion tightened to full example-sentence match only (min length documented); anchors/collocations/verbFrames overlap → mark only.
- Sampling: fixed seed, deterministic order, ONE run, then freeze. Rejection funnel per lemma. Per-POS cap ~60%. Per-author cap and near-duplicate sentence dedupe added.
- Pre-declared secondary tier (Gutenberg 1900–1930) for rescue when primary yields <5; tagged `source_tier`. Primary remains frozen.
- Controls: single-synset controls replaced with multi-synset where possible; `counterargument` kept as reported shortage. Stratum C added: stratified random sample of full inventory for binding-precision (report n and CI).
- Paragraph boundaries preserved; line-unwrapping documented as normalization. Per-document sha256 + retrieval date stored.
- `resolver-seen-index.json` not committed; manifest, roster, SOURCE.md, occurrences.jsonl, dataset-manifest.json (with sha256 of JSONL) committed.
- No file deletions. Terminal-loop guard applies. No C3/C4 classification.

## 1. Exact source

| Field | Value |
| --- | --- |
| Corpus | **Project Gutenberg** |
| Catalog | `https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv` |
| Text endpoint | `https://www.gutenberg.org/cache/epub/{id}/pg{id}.txt` |
| Frozen document list | [pool.json](./pool.json) — 344 documents, `{id, bucket, issued, title}` |
| Per-document SHA-256 | [corpus-manifest.json](./corpus-manifest.json) — `sha256` of the boilerplate-stripped body, `rawSha256` of the fetched file |
| Total size | 344 documents, **23,676,658 words** |
| `Text#` range | 1 – 77115 |

## 2. Why this source is suitable

1. **It is genuinely independent of everything the resolver consumes.** The resolver's
   evidence comes from WordNet 3.0 synset glosses/examples/verb frames and from the
   Skypedia Vietnamese packs. Project Gutenberg full prose is disjoint from all of
   those surfaces (see §5).
2. **Real connected prose, not synthetic frames.** Every occurrence is an authored
   sentence in a full document with surrounding paragraphs, so POS, sense,
   frequency and contextual specificity vary naturally — which is exactly the
   variation T3 needs to distinguish a general binding problem from one concentrated
   in the original failure cases.
3. **Legal and stable.** US public-domain works redistributed under the Project
   Gutenberg License; freely redistributable inside this repository, so the dataset
   can be rebuilt by any reviewer without credentials.
4. **Stable identifiers and content hashes.** The pool is a fixed list of `Text#`s
   with SHA-256 hashes, so the dataset is reproducible and any drift is detectable.

## 3. License / access basis

- Texts are works in the **public domain in the United States**.
- Redistribution is under the **Project Gutenberg License**
  (<https://www.gutenberg.org/policy/license.html>), which permits redistribution
  provided the Project Gutenberg trademark is not used to promote derived products
  and the license text is retained. The sampled sentences are quoted for
  non-commercial verification and audit purposes.
- No account, key or payment is required; access is anonymous HTTPS.
- The catalog `Issued` field records **Project Gutenberg's ebook release date**, not
  the original publication date of the work. Release dates in this pool span
  1971–2025.

## 4. Selection rule (deterministic and reproducible)

The pool is derived mechanically from the catalog, not chosen by hand:

1. **Filter** — rows with `Type == "Text"` and `Language == "en"`, excluding titles
   matching `^(Images|Music|Sound|Sheet Music|Cartons)\b` (non-prose items). This
   yields 61,729 candidate rows from 79,476 catalog rows.
2. **Bucket** — each row is assigned to the **first** bucket (in the fixed order
   `fiction, science, philosophy, medicine, essays, reference, history`) containing
   one of its bookshelves. Shelf matching is **exact** against the catalog's own
   `Category: X` vocabulary. Rows matching no bucket are dropped (2,354 rows).
   First-match assignment keeps a work in exactly one stratum.
3. **Sample within bucket** — sort rows by `Issued` year ascending, then `Text#`
   ascending; take the quota at **evenly spaced ranks**
   `round(k * (n-1) / (quota-1))` for `k` in `0..quota-1`.
4. **Quotas** — `fiction 60, science 89, philosophy 60, medicine 40, essays 30,
   reference 40, history 25` = **344 documents**.

Two properties of this rule matter and are deliberate:

- **Genre stratification is required, not cosmetic.** An all-fiction pool was measured
  first and rejected: across 6.75M words of fiction it yielded **0** occurrences of
  `lucent` and `nescience` and only 4 of `sporty`. The scholarly buckets are where
  those senses actually occur.
- **Even spacing, not oldest-first.** `sporty` and `counterargument` are 20th-century
  coinages; a pool restricted to the oldest available works cannot contain them.
  Even spacing across the whole period keeps both ends represented.

Buckets, as frozen:

| bucket | docs | words | role |
| --- | ---: | ---: | --- |
| fiction | 60 | 3,990,935 | primary app domain; high-frequency `light` / `world` |
| science | 89 | 5,669,260 | `lucent` senses |
| philosophy | 60 | 4,427,349 | `nescience` senses |
| medicine | 40 | 2,063,735 | abstract noun / adjective strata |
| essays | 30 | 1,813,984 | expository register |
| reference | 40 | 3,767,920 | encyclopedia / law / linguistics prose |
| history | 25 | 1,943,475 | expository narrative |

## 5. Does the resolver already consume this source? — **No**

Explicitly contrasting the two evidence families:

| Evidence surface | Consumed by resolver | Present in this corpus? |
| --- | --- | --- |
| WordNet 3.0 synset **examples** (48,339 in the release) | yes — `examplePatterns()` in [alignment.ts:90](../../src/lookup/dictionary/alignment.ts:90), `sense.examples` in [sense-resolver.ts:49](../../src/core/language/sense-resolver.ts:49) | **no** — WordNet is not PG prose |
| WordNet 3.0 synset **glosses** | yes — `definitionEn` evidence words | no |
| WordNet 3.0 **verb frames** | yes — `frameEvidence()` in [sense-resolver.ts:120](../../src/core/language/sense-resolver.ts:120) | no |
| Skypedia `viSenses[3]` examples | yes — [packs.ts:130](../../src/lookup/dictionary/packs.ts:130) | no |
| Skypedia Vietnamese glosses | yes — `meaningVi` / `meaningsVi` | no |
| Project Gutenberg full prose | **no** | yes |

The only sentence-shaped text the resolver sees from this repo's own test harness is
the synthetic frame `The selected expression is <surface>.`, which is generated, not
sampled, and is explicitly excluded by the sampler.

## 6. `resolver_seen` marking and exclusion

Every occurrence carries a `resolver_seen` field. The rule is:

- **`resolver_seen: false`** — the sentence is not byte-identical to any WordNet example, WordNet verb frame or Skypedia example for the lemma (full-sentence match, minimum length 20 characters after normalization). This is the expected value and must hold for every occurrence in the dataset.
- **`resolver_seen: true`** — a full-sentence collision was detected. Such an occurrence is **excluded** from the dataset and listed in `collisions` in the dataset manifest.
- **`resolver_seen: "anchor"`** — the sentence contains a resolver evidence string (anchor/collocation/verb frame) as a substring but is not a full-sentence match. These are **kept** in the dataset and marked for transparency; they do not trigger exclusion.

The check is mechanical, over the **full** example set (not only the first 8 that
`examplePatterns()` slices), normalised for case, whitespace and punctuation.

## 7. Pre-declared secondary tier (rescue only)

A secondary tier is declared **before sampling** and used **only** when the primary
tier yields fewer than 5 occurrences for a diagnostic lemma.

| Field | Value |
| --- | --- |
| Corpus | **Project Gutenberg (1900–1930)** |
| Selection | Same catalog, filter `Issued` year between 1900 and 1930 inclusive, same genre buckets, same even-spacing rule, quota 100 documents |
| Tag | `source_tier: "secondary"` on every occurrence drawn from this tier |
| Freeze | The secondary tier document list is frozen in `pool-secondary.json` before any sampling begins |

The primary tier (344 documents, 1871–2025) remains the default and is never
replaced. Any occurrence from the secondary tier is explicitly tagged and
reported in the dataset manifest with its own rejection funnel.

## 8. Sampling outcome (single frozen run)

Recorded **after** the run. The source decision in sections 1-7 is unchanged by this
section; nothing here re-opens the source.

- **Run:** one deterministic run, `seed = 0x5eed1eaf`, `samplingRuleVersion = 3.0.0`.
- **Dataset:** [occurrences.jsonl](./occurrences.jsonl) - **543** occurrences
  (diagnostic 45, control 128, Stratum C 370; 2 drawn from the secondary tier).
- **sha256 of the JSONL:** `63d148b51657c8d325f822782a9eed31a8077f049a9522b3c564554916ef4209`
  (720,850 bytes, 543 lines)
- Byte-identical across repeated runs - re-running the sampler reproduces this hash
  exactly. Verified by rerun, not assumed.
- Spread: **195 distinct documents**, 177 distinct authors, so occurrences are
  independent of any single author or work.

### 8.1 Per-lemma yield

| Lemma | Stratum | POS | Yield | Tiers | Status |
| --- | --- | --- | --- | --- | --- |
| `light` | diagnostic | adjective | 10 | primary | ok |
| `world` | diagnostic | noun | 10 | primary | ok |
| `withdraw` | diagnostic | verb | 10 | primary | ok |
| `omen` | diagnostic | noun | 6 | primary | ok |
| `lucent` | diagnostic | adjective | 5 | primary+secondary | ok (rescued by tier 2) |
| `nescience` | diagnostic | noun | 4 | primary+secondary | **reported shortage** |
| `sporty` | diagnostic | adjective | 0 | none | **reported shortage** |
| `counterargument` | control | noun | 0 | none | **reported shortage** |
| `attempt` | control | verb | 10 | primary | ok (prior VALID_SENSE_PASS) |
| `account for` | control | verb | 10 | primary | ok (prior VALID_SENSE_PASS) |
| `ape` | control | verb | 8 | primary | ok |
| `abominable` | control | adjective | 10 | primary | ok |
| `airy` | control | adjective | 10 | primary | ok |
| `array` | control | verb | 10 | primary | ok |
| `astonishment` | control | noun | 10 | primary | ok |
| `balsam` | control | noun | 10 | primary | ok |
| `behalf` | control | noun | 10 | primary | ok |
| `confiscation` | control | noun | 10 | primary | ok |
| `ecstatic` | control | adjective | 10 | primary | ok |
| `eloquent` | control | adjective | 10 | primary | ok |
| `gaily` | control | adverb | 10 | primary | ok |

Control POS spread: noun 57, adjective 40, verb 21, adverb 10 (of 128 occurrences),
so a general binding-quality failure and a failure concentrated in the original
audit cases are distinguishable.

### 8.2 Diagnostic acceptance: 5 of 7 - short of the 6/7 target

`lucent` reaches the >=5 minimum only because the pre-declared secondary tier
rescued it; `nescience` gained 1 secondary occurrence but remains at 4. Per the task
rule ("if a lemma has fewer than 5 genuinely independent occurrences, report the
shortage instead of filling the gap synthetically") the gap is reported, not padded.

Both shortfalls were verified to be **genuine corpus scarcity, not sampler defects**:

| Lemma | Measured corpus occurrences | Conclusion |
| --- | --- | --- |
| `sporty` | **0** occurrences of `sporty`/`sportier`/`sportiest` in 173.6 MB / 400 documents, against 2,396 of `sport` | The comparative-adjective family is absent from this corpus. No sampling rule could recover it. |
| `nescience` | **10** occurrences corpus-wide; 9 primary + 1 secondary raw candidates, of which 3 fell below the 6-word minimum and 2 exceeded the per-author cap | Only 4 usable independent sentences exist. |
| `counterargument` | 0 unhyphenated; **4** hyphenated as `counter-argument` | See 8.4 - now a declared surface variant, still only 1 usable sentence. |

### 8.3 Rejection funnel

`dataset-manifest.json` carries a full funnel per lemma and per tier, and the
identity

$$\text{rawCandidates} = \sum \text{rejected} + \text{accepted} + \text{notExaminedAfterTarget}$$

is asserted to close for all 21 lemmas. Buckets: short sentence, resolver
full-match, POS uncertain, POS not in roster, near-duplicate, per-author cap,
per-POS cap, plus the candidates left unexamined once the target was reached.

### 8.4 `counterargument` - spelling variant, now declared

The frozen corpus spells this lemma `counter-argument`; the unhyphenated form has
zero hits. `counter-argument` / `counter-arguments` are therefore declared
surface variants in [roster.json](./roster.json) and in `build_occurrence_roster.mjs`
so a spelling difference cannot masquerade as a data shortage.

Even with the variant the yield is 0, and that is still a **genuine** shortage: the
corpus contains only 2 sentences containing the lemma, one of which is a 4-token
fragment below the 6-word sentence minimum. The remaining control-stratum coverage
for this prior-`VALID_SENSE_PASS` case is therefore reported as a shortage rather
than padded.

### 8.5 Cross-stratum de-duplication

Stratum C draws a stratified random sample of the whole inventory and can therefore
re-draw a lemma that also sits in the named control stratum. One `gaily` sentence
was drawn by both. Repeats are not independent evidence, so Stratum C rows already
taken by the named control stratum are dropped and the count is reported as
`stratumC.droppedCrossStratumRepeats` (value: **1**), leaving 370 independent
occurrences rather than an inflated 371. The binding-precision estimate therefore
uses the deduplicated count.

`light`+`omen` and `cervical`+`neural` each appear in one sentence together; those
are *different lemmas*, so both occurrences are kept and the sentence is not a
duplicate.

### 8.6 No resolver-seen occurrences were excluded

The section 6 rule excludes a candidate only on a full example-sentence match
(>= 20 characters). **0** candidates matched, so nothing was excluded on that basis.
5 candidates overlapped a resolver anchor/collocation/verbFrame and were therefore
**marked** (`resolver_seen: "anchor"`) and kept; the remaining 538 carry
`resolver_seen: false`.

### 8.7 `context` is a sentence-centred window (defect fixed, sampling unchanged)

The first frozen run stored `context` as a **prefix** of the paragraph
(`para.slice(0, CONTEXT_MAX_CHARS)`). A paragraph prefix omits the very sentence it
annotates whenever the paragraph carries more leading text than the cap. In the
frozen 543-row run that affected **188 rows (34.6%)** — precisely the
contextual-specificity evidence that T1 Phase 5, T3, T4 and T5 read this field for.
Every one of the 188 sat exactly at the 600-character cap.

`context` is now a **sentence-centred window** (`contextWindow`, at the same
acceptance stage, so it cannot change which sentences are sampled):

- centred on the annotated sentence and clamped to the paragraph bounds;
- at most `CONTEXT_MAX_CHARS` (600) characters;
- a sentence longer than the cap is returned **whole** rather than truncated,
  because truncating it would be worse than exceeding the cap;
- re-anchored by search if the splitter's `.trim()` shifts the sentence offset.

Verification after the fix, on the same frozen seed and the same byte-identical
inputs:

- **0** of 543 rows have a `context` that omits its own sentence (was 188);
- **0** rows exceed the cap;
- the accepted set is **byte-identical** to the pre-fix run — same lemmas, same
  sentences, same documents, same paragraph indices — which proves the change is
  confined to `context` and cannot have perturbed sampling.

252 rows changed (188 repaired plus 64 re-centred for symmetry). The row count,
strata, per-lemma yields, funnels and shortages are all unchanged.

> Amendment 4 froze "one run, then freeze". The sampler is seeded and has no
> clock or filesystem-order dependence, so re-running it is deterministic and
> reproduces the same draw; this repair is a re-emit of the identical draw, not a
> second sample. The JSONL hash therefore changed and `dataset-manifest.json` was
> regenerated from the repaired run so that the freeze stays self-consistent.
