# Translation & Lookup Pipeline

Scope: what actually happens between a selection and a rendered meaning.
Related: [ARCHITECTURE.md](ARCHITECTURE.md), [reader.md](reader.md), [data-storage.md](data-storage.md).

## Control modules

| Concern | Module |
| --- | --- |
| UI-facing facade (all three modes) | `src/lookup/service.ts` (`LookupService`, singleton `lookupService`) |
| Synchronous local result | `src/lookup/localDictionary.ts` (`localLookup`) |
| Local semantics / morphology / sense ranking | `src/core/language/local-language-engine.ts`, `lexicon.ts`, `phrases.ts`, `sentence-engine.ts`, `sense-resolver.ts`, `wordnet.ts` |
| Normalization + lemma candidates | `src/lookup/normalization/*` |
| Dictionary sources | `src/lookup/dictionary/registry.ts`, `packs.ts`, `seedDictionary.ts` |
| Optional web dictionary | `src/lookup/webDictionary.ts` (Wiktionary REST definitions) |
| Translation routing | `src/core/translation/router.ts`, `provider-registry.ts`, `provider-health.ts`, `public-quality.ts` |
| Explicit context/AI routing | `src/core/context/context-router.ts`, `providers.ts`, `heuristic.ts`, `prompt-builder.ts`, `schema.ts`, `adapter.ts` |
| Direct browser AI providers | `src/ai/provider.ts`, `src/ai/providers/{gemini,anthropic,openaiCompatible}.ts` |
| Caching / dedupe | `src/core/cache.ts`, `src/core/requests.ts` |
| Settings that gate the pipeline | `src/settings/engines.ts` (`EngineSettings`), `src/settings/store.ts` (AI key) |

`LookupService` rebuilds its engines only when the `EngineSettings` signature changes
(`configure`), so toggling a setting is the only thing that re-creates routers.

## Quick lookup — actual order

`LookupService.quick(request, settings, signal, onLocal, initial?)`:

1. **Immediate local result (synchronous).** `localLookup` returns a `LookupResponse` from the
   installed dictionary packs and curated lexical units (`matchKnownExpression`). This is what the
   quick card shows instantly. App passes this same result as `initial` to avoid repeating the
   initial lookup; the service publishes subsequent snapshots through `onLocal`.
2. **Local asset readiness.** `ensureLocalDictionaryAssets()` (bundled EN→VI pack + WordNet) with
   errors swallowed — a partial load is still usable. Sentence-cache reads and a read-only
   selection-translation cache probe overlap asset readiness. The probe uses the router's existing
   memory/Dexie cache and validity rules, never a provider. Cached selection translations fill
   missing entry-level content without becoming context evidence or sense pairs. The asset loader
   publishes bundled dictionary readiness independently of WordNet, exposing those meanings
   before WordNet or sentence analysis finishes. Already-ready assets do not repeat local lookup.
3. **Cached sentence translation.** Looks up `db.translations` with
   `translationKey({ text: sentence, 'en'→'vi', mode: 'sentence' })`; on hit, the sentence
   translation is remembered locally and the look is marked `translationCacheHit`. This path never
   re-requests.
4. **Local semantic analysis.** `LocalLanguageEngine.analyzeSelection` (normalization → token
   reconstruction → lemma/morphology → phrase detection → sentence analysis → `SenseResolver`),
   merged over the base result with `applyLocalResult`.
5. **Stop conditions.** If `quickEngine === 'offline'`, or the result is complete
   (English definition + useful Vietnamese meaning) under `quickEngine === 'auto'` without a selected missing sense,
   the local result is returned. A complete base plus cached selection gloss also stops Auto
   before network (selected-sense translation retains its existing gate). `onLocal` is always called first so the surface can enrich
   progressively rather than block on network.
6. **Google sentence pass (optional).** When a Google/`google-web` provider is available, the
   sentence is translated and `analyzeSelection` is re-run so senses can be re-ranked. Success with
   a context-matched sense returns immediately. Otherwise the reranked snapshot is published
   before later fallbacks.
7. **Wiktionary web dictionary (optional).** Only when `automaticFallback && publicTranslation &&
   targetLang === 'vi'`. `lookupWebDictionary` has its own `db.settings` cache with TTLs
   (success 30 d, miss 6 h, failure 5 min) and refuses to run while offline. Results merge into the
   existing senses (`mergeDictionaryResult`) and are published before translation fallback.
   Every publication checks the same AbortSignal; the UI also guards callbacks and completion
   with its selection controller. Provider order, quality gates and cache versions are unchanged.
8. **Translation router.** Skipped entirely if `optionalTranslationEnabled(settings)` is false.
   Under `quickEngine === 'auto'` with a Vietnamese meaning already present, the router is skipped.
   Otherwise the selection goes to the router, with `localContext` (lemma, context POS, known
   meanings, confidences) attached when a local dictionary result exists.
9. **Result shaping.** `source` is derived from the router result (`cache` / `browser` / `offline` /
   `translation`), translated meanings become `unpairedMeaningsVi` when they are not already linked
   to a sense, and the quick card keeps the local lexical unit when one exists.

Sentence translation is a **separate explicit action** (`translateSentence`) that shares the same
router cache; it never runs on scroll.

## Lemma resolution and morphology

`rankedLemmaCandidates` (`src/lookup/dictionary/seedDictionary.ts`) is the single morphology owner for
every layer. It returns the exact form first, then irregular lemmas, then rule candidates:

- plural, `-ed`/`-ing` (doubled consonant, silent `e`, final `y` → `i`), and comparative/superlative
  `-er`/`-est` (`-ier`/`-iest` → `y`, doubled consonant, silent `e`);
- a bounded irregular table for forms no rule reaches (`written` → `write`, `children` → `child`,
  `better` → `good` / `well`);
- a short list of real words whose `-er`/`-est` belongs to the word (`computer`, `career`, `water`,
  `paper`, `brother`), because rule-based stripping cannot separate them.

Every candidate is only a guess: a provider must still contain it. The exact form always outranks a
derived lemma, so a real entry is never looked past.

**Exact entry vs lemma entry.** `InstalledDictionaryPack.lookup` answers in three cases:

1. a rich exact entry answers on its own;
2. a morphology redirect (`Quá khứ và phân từ quá khứ của X`) resolves to the lemma;
3. a weak derived entry (no English gloss, one meaning) that looks past itself to a lemma the pack
   contains, which may also be a degree or adjective form.

In cases 2 and 3 the match carries `surfaceEntry` plus `morphology { baseLemma, inflection }`.
`lookupLocalLexeme` merges the lemma as the authoritative content and uses the exact entry only for
what the lemma lacks, then removes senses repeated by id or by identical English definition. The
result keeps the surface form, the lemma, and the morphology metadata.

`LensResult.selection.status` reports `fragment` only when token-boundary evidence
(`isPartialSelection`) shows the selection covers part of a larger token. A complete token that no
source knows is `unknown`; a dictionary miss is never a fragment.

## Dictionary sense contract

English senses remain independent of entry-level Vietnamese meanings: explicit source
sense links (including curated pairs), unique exact gloss reuse, and conservative stable lexical
alignment can attach VI to an EN sense. `pairingState` distinguishes
paired senses from senses missing VI; `unpairedMeaningsVi` retains aggregate glosses without
implying array-order alignment. WordNet senses carry `source: 'wordnet'`, and all senses survive
context ranking, even when the quick view initially compacts them.

Installed packs resolve the observed `Xem <lemma>` Vietnamese redirects within the same pack,
without network access or changing the English lemma/senses. Resolution uses a per-path visited
set and at most two hops. `vietnameseReferences` records resolved targets or unresolved
missing/cycle/depth states; failed reference text remains available and the quick card marks it.
Sense-linked meaning arrays are retained without flattening away their source boundaries.

## Conservative context ordering

`SenseResolver` prioritizes lightweight sentence POS evidence before semantic scoring.
POS checks consult the shared lexicon for following nouns and predicates, including words
with multiple parts of speech; an adverb between a subject and predicate is not forced into a verb.
`occurrencePos` is shared by the local result and sense ranking. It narrows only to POS values
present in the lexical entry or candidate senses. Predicate detection consults lexical POS
candidates and never excludes a verb from its `-ly` spelling. Determiner and linking-verb
adjacency alone cannot introduce a new POS. Sentence analysis cache version 4 includes
token POS candidates and the revised predicate output.
Collocations, lexical overlap, constructions and aligned cached sentence translations remain
local evidence. A Context label requires semantic score >= 3 and margin >= 2; close candidates
retain dictionary order within the likely POS. POS alone never confirms a sense.
Exact identical English glosses with matching POS may reuse an existing, unique explicit local
VI pair; aggregate Vietnamese glosses remain unpaired. Comparative output adds `hơn` only
for the bounded intelligence/judgment adjective glosses; morphology metadata stays intact.

Auto stops on useful local EN/VI without requiring a Context label. When a confident selected
sense (or the only sense) lacks useful VI and no usable aggregate VI exists, the existing
word-fallback router translates just its English gloss in sentence mode, using the existing
translation cache and provider gates. Unresolved reference text does not count as useful VI;
usable aggregate VI beside an unresolved reference still prevents this fallback.
No provider, cache or phrase detector is added. Offline mode never enters this fallback.

## Explicit Context / Grammar

`LookupService.explain(request, ai, settings, mode, signal)` → `ContextRouter.explain`:

1. `boundedContext` (`prompt-builder.ts`) trims the context window before anything is keyed or sent.
2. Cache probe order: exact provider-family keys (only when online and providers exist) → the
   `local` key → the legacy `available` key when offline or provider-less. Legacy `db.lookups`
   rows (`context-v2` / `context-v4` / current) are consulted only in the legacy path.
3. A local heuristic result (`heuristicContext`) or a "simple complexity" decision short-circuits
   without AI when `aiRequested` is false.
4. A confident local sense (`local.confidence >= 0.6`, mode `meaning-in-context`) also returns
   without AI.
5. Only then does it iterate `ContextProvider`s. `src/ai/providers/*` implement Gemini, Anthropic,
   and an OpenAI-compatible adapter; the user supplies the key and model.

Switching the EN/VI tab never repeats a request: tab changes are pure rendering over the
already-stored `LookupResponse`.

## Provider priority

`translationProviders(settings)` (`src/core/translation/provider-registry.ts`) builds the list,
sorts it by `translationProviderOrder` (`browser`, `dictionary`, `vocabulary`, `mymemory`, `google`,
`bing`), then assigns `priority = (index + 1) * 10`. Under `quickEngine === 'auto'` it adds
`+200` for network providers and `+100` for `browser`, so offline lexical sources always precede
browser models, which always precede the network.

Gating:

- `quickEngine === 'offline'` keeps only `dictionary` and `vocabulary`.
- A non-`auto` `quickEngine` pins the chosen provider; if `automaticFallback` is false, the list is
  reduced to that provider alone.
- `ManagedTranslationProvider` (`/api/translate`) is appended **last** and only when
  `settings.managedTranslation` **and** the build flag `VITE_MANAGED_TRANSLATION === 'true'`.
  Standalone builds therefore never call an undeployed API.

| Provider id | File | Network | Notes |
| --- | --- | --- | --- |
| `dictionary` / `vocabulary` | `providers/dictionary.ts` | no | Local packs + saved words |
| `browser` | `providers/browser.ts` | no | Browser-local model, only if ready |
| `mymemory` | `providers/public.ts` | yes | Anonymous read-only API, 500-byte limit, gated by `evaluatePublicTranslationQuality` |
| `google` / `bing` | `providers/gateway.ts` | yes | Only when the user configures a `translationEndpoint` |
| managed | `providers/managed.ts` | yes | Cloudflare Worker `/api/translate`; allowlisted in `COST & QUOTA GUARDRAILS.md` |

Router behavior (`router.ts`): cache first, then providers by ascending `priority`; network
providers are skipped while offline; providers in cooldown (`ProviderHealthManager`) are skipped;
each attempt is wrapped in `withDeadline`. MyMemory results pass through
`evaluatePublicTranslationQuality` — `reject` drops the result, `uncertain` defers it in case a
Google-family provider later succeeds, `accept` is used and cached.

`LookupService` also builds two narrower routers: `wordFallback` excludes
`google` / `google-web` / `online-auto` and is used for single words under `quickEngine === 'auto'`;
`googleContext` is restricted to `google` / `google-web` / managed and is used only for the sentence
re-ranking step and explicit sentence translation.

## Provider defaults, flags and hosted behavior

`defaultEngineSettings` (`src/settings/engines.ts`) is the shipped baseline. Code and this table win
over any older report:

| Setting | Default | Effect |
| --- | --- | --- |
| `quickEngine` / `contextEngine` | `auto` | Auto means local-first; see the gates above |
| `automaticFallback` | `true` | `false` pins one provider and disables managed Auto selection |
| `publicTranslation` | `true` | Wiktionary + MyMemory web lookup. A one-time `webLookupDefaultsVersion` migration flips legacy stored `false` to `true` |
| `managedTranslation` | `true` | Only takes effect with the `VITE_MANAGED_TRANSLATION=true` build flag |
| `userApi` | `true` | BYOK context provider is offered for explicit actions |
| `hostedAiLite`, `localLlm`, `googleProvider`, `bingProvider` | `false` | Off until the user configures them |
| `hostedDailyQuota` | `20` | Clamped to 0–1000 when the provider is built |
| `networkTimeoutMs` | `2500` | Clamped to 200–4000 ms in `provider-registry.ts` |
| `translationCacheLimit` / `contextCacheLimit` | `5000` / `1000` | Dexie rows; memory is 128 entries per engine |

**Context providers.** `contextProviders(settings, ai)` builds at most three, ordered by
`contextProviderOrder` (default `['user-api', 'hosted-lite', 'local']`):

- `user-api` — requires `settings.userApi`; family is `${provider}:${baseUrl}`.
- `hosted-lite` — requires `settings.hostedAiLite && settings.hostedEndpoint`; daily quota is
  `hostedDailyQuota` clamped to 0–1000.
- `local` — requires `localLlm && localEndpoint && localModel`; an OpenAI-compatible loopback
  endpoint, no `Authorization` header when the key is empty.

`aiRequested` is derived in `src/lookup/service.ts` as
`(userApi || hostedAiLite || localLlm) && ai.provider !== 'none' && ai.provider !== 'demo'`.
Selecting `contextEngine: 'local'` excludes every network context provider regardless of that flag.

**Hosted Lite contract.** The endpoint receives a bounded
`{ selectedText, sentence, previousSentence, nextSentence, mode, sourceLang, targetLang }` and returns
the compact `ContextExplanation` schema (`src/core/context/schema.ts`), where irrelevant fields may
be omitted. The client reserves quota atomically in Dexie per UTC day and endpoint, so parallel tabs
share one counter; a failed attempt still consumes its reservation. The server must enforce quota
independently — a browser counter is not abuse protection. No hosted endpoint is provisioned by this
repository.

**Deadlines and backoff.** The context router wraps each provider call in a 20 s outer deadline
including body parsing (`context-router.ts`). `ProviderHealthManager` uses
`BACKOFF = [30s, 2m, 10m, 1h]`, tracked per provider/pair; missing dictionary entries and
unsupported browser pairs are not outages. The frontend pipeline never retries a request by itself.

**Managed selection detail.** With `onlineTranslationProvider === 'auto'` and
`automaticFallback === false`, `provider-registry.ts` sends `google-web` explicitly rather than
Auto, because Auto already depends on fallback.

**Browser provider.** Feature-detected `Translator` API; a selection lookup only uses it when
`availability() === 'available'`, and the model download requires the explicit
*Prepare browser language model* settings action. Selecting text never downloads a model or sends a
document.

## Caching

- `EngineCache` (`src/core/cache.ts`): in-memory map (default 128 entries) over a Dexie table, with
  a version stamp, hit counter, `lastUsedAt`, and deferred hit-weighted LRU cleanup bounded by
  `translationCacheLimit` / `contextCacheLimit`. Enabled per-engine by
  `cacheTranslations` / `cacheContext` / `cacheSentenceAnalysis`.
- Keys: `translationKey` = `[TRANSLATION_VERSION, normalizeText(text), sourceLang, targetLang, mode]`;
  `contextKey` = `[CONTEXT_VERSION, selection, sentence, previous, next, paragraph, sourceLang,
  targetLang, languageMode, mode, providerFamily, aiRequested]`. Bump the version constant when the
  payload shape changes.
- `SharedRequests` (`src/core/requests.ts`) dedupes concurrent identical work; the underlying
  `AbortController` is aborted only when the last subscriber leaves.
- Sentence analyses are cached separately in `db.sentenceAnalyses` (`SentenceAnalysisCache`).

## Debugging guide

| Symptom | First place to look |
| --- | --- |
| Inflected word not matched | `src/lookup/normalization/*` (`normalizeSelection`, `lemmaCandidates`, `reconstructToken`), then `src/core/language/lexicon.ts` |
| Wrong sense for this sentence | `src/core/language/sense-resolver.ts` scoring, then `inferContextPos` in `local-language-engine.ts` |
| Missing English definition | dictionary pack senses, `src/core/language/wordnet.ts`, then `unpairedMeaningsVi` handling |
| Missing Vietnamese meaning | `localDictionary.ts` `meaningsVi`, Wiktionary branch gating, router result shaping |
| Sentence never translated / repeated requests | `translationKey` inputs, `settings.cacheTranslations`, `EngineCache` version |
| Fallback not firing | `optionalTranslationEnabled`, `quickEngine`, `automaticFallback`, `ProviderHealthManager` cooldown |
| Context action returns local instead of AI | `aiRequested` flag, `heuristicContext`, `estimateComplexity`, `local.confidence` gate |
| Which provider actually ran | `src/core/diagnostics.ts` via `recordDiagnostic`, visible in debug mode; also `LookupStatistics` |

`src/core/diagnostics.ts` records the decision points (`localStop`, `wiktionary`,
`googleContextResolved`, `googleUnresolved`, `cacheHit`, `googleCircuitSkip`, provider errors) and is
the fastest way to see which branch actually ran. API keys and reader content are never logged.

## Invariants

1. Local first, cache second, network last, managed Worker very last.
2. No new external request when a valid cached or local result exists.
3. Identical concurrent requests are shared, and cancelling one consumer does not create another.
4. Cache keys must include normalized text, language pair, mode, and version — a cache hit must
   never return a different context than the one requested.
5. Every failure path keeps the local/quick result visible; the reading flow never breaks.
6. AI context runs only on explicit Context/Grammar actions and only with user-configured keys.
7. `COST & QUOTA GUARDRAILS.md` §5 and §6 are binding on any new provider or route.

## Important files

`src/lookup/service.ts`, `src/lookup/localDictionary.ts`, `src/lookup/localLexeme.ts`,
`src/lookup/webDictionary.ts`, `src/lookup/localAssets.ts`, `src/lookup/context.ts`,
`src/lookup/types.ts`, `src/lookup/normalization/*`, `src/lookup/dictionary/*`,
`src/core/language/*`, `src/core/translation/*`, `src/core/context/*`, `src/core/cache.ts`,
`src/core/requests.ts`, `src/core/diagnostics.ts`, `src/ai/*`, `src/settings/engines.ts`.

## Structured evidence and stable bilingual alignment

`sentence-engine.ts` caches bounded occurrence constructions from `constructions.ts`: complement
shape, nearby preposition, imperative and passive cues. These features do not consult dictionary
candidate POS. `SenseResolver` consumes frames and candidate example patterns as supporting evidence;
a shared generic frame cannot establish Context. Object + adjective and object + copular infinitive
share a bounded predicative pattern; evaluative modifiers with an of-complement use compatible
definition evidence without lemma-specific branches. Collocations match token lemmas around the selected
offset. Repeated tokens without a supplied offset do not receive occurrence construction evidence.
Detached concessive adverbs require occurrence syntax and compatible candidate POS; ordinary verbs
never receive clause-level contrast evidence. Candidate diagnostics preserve POS conflicts, semantic
scores and margin even when the result remains ambiguous. The score >= 3 and margin >= 2 gates remain.
Translation also requires independent semantic support >= 2; translation alone cannot establish Context.
Multi-clause translations retain weak whole-sentence evidence (at most 1 point); equal clause counts
are not treated as proof of alignment.

`lookup/dictionary/alignment.ts` runs before occurrence resolution and has no sentence input.
It preserves explicit links, reuses unique exact English glosses with matching POS, and otherwise
requires multiple stable bilingual lexical anchors, matching source POS and no equally supported
English competitor (anchor margin at least 2). It matches exact Vietnamese gloss fragments from local lexical records, never array
order or fuzzy similarity. Only supported fragments are linked; other parts of compound source
glosses remain available. Results use a bounded versioned memory cache. Unresolved source senses
and entry glosses remain available. Alignment tiers are heuristic evidence tiers, not calibrated
probabilities. A broad gloss may remain unresolved across many English senses.

Sense alignment metadata distinguishes `explicit`, `identical-gloss`, `inferred`,
`translated-definition` and `unresolved`; it records a confidence tier and evidence references.
`fillSelectedSense` marks provider definition translations as low-confidence display assistance
with `dependsOnSenseId`. Resolver translation scoring and exact-gloss reuse reject dependent
translations. Alignment confidence remains separate from occurrence sense confidence. Existing
`pairingState`, paired rows and unpaired meanings remain compatible; provider gates and request
counts are unchanged. No new automatic translation or AI requests are introduced.

## Bounded sentence grammar

`grammar.ts` extracts local clause spans, token-to-clause indices and predicate features once
in `SentenceEngine` (analysis version 3). Predicate windows are limited to six preceding tokens;
argument/complement windows are bounded. Auxiliary chains, tense/aspect, voice, negation,
argument candidates and modifier classes remain independent of dictionary sense candidates.
`constructions.ts` owns complement and preposition/particle observations. PhraseDetector still
owns known lexical phrases. Missing lexical POS can leave argument heads or voice unknown.

SenseResolver reuses cached predicates for occurrence POS and construction/frame evidence.
Frame conflicts receive a moderate penalty; frame matches remain weak. Tense/aspect,
negation and modifiers are exposed as diagnostic provenance and do not independently establish
Context. Existing semantic thresholds and translation alignment gates remain unchanged.
Clause spans describe source structure only and never establish bilingual alignment.

## Stable grammar in bilingual alignment

`alignment.ts` prepares bounded patterns from stable source examples (up to eight examples,
240 characters each) or supplied `grammarPatterns`. Source verb frames and complement,
preposition/particle patterns constrain inferred candidates. Frame/pattern incompatibility
rejects inference; a match adds weak support to the existing competitor margin. At least two
POS-compatible independent lexical anchors must still support each linked Vietnamese fragment.
Explicit pairs are preserved, generated definition translations are excluded from exact reuse,
and broad or unsupported source meanings remain unresolved. Multiple supported VI fragments may
belong to one English sense; shared VI strings never merge English senses.

Alignment memoization is stamped `bilingual-alignment-2`; learned lexical records use
`local-lexicon-8`. No Dexie migration or dictionary pack format change is required.

Cached translation evidence uses the selected token's predicate and source clause span.
Strong whole-sentence support requires one grammar clause and one punctuation segment on both
sides. Multiple clauses, missing grammar or target boundary mismatch receive at most one point.
A valid exact offset identifies a repeated occurrence; an absent or invalid offset contributes
no occurrence translation evidence. No positional clause pairing is inferred. Independent
semantic evidence and the existing Context thresholds remain mandatory. Provider priority,
opt-in gates, request counts and translation `localContext` are unchanged.

## Task 2 scoring calibration and accepted limitations

Frame evidence distinguishes MATCH, UNKNOWN, SOFT_CONFLICT and HARD_CONFLICT. WordNet frame absence or non-intersection is incomplete usage metadata and contributes no penalty. A match remains weak support (at most one point). Only contradictory explicit controlled grammar patterns exclude a candidate before ranking; extracted example mismatches cannot reject it. Every English dictionary sense remains visible.

Construction events are compared across compatible same-POS candidates before scoring: unique support keeps its bounded score, support shared by a minority is capped at one, and support shared by at least half contributes zero. Compatibility diagnostics remain available. Lexical evidence, independent evidence gates and the semantic margin still determine Context. Alignment retains two lexical anchors, POS checks, competitor margin and provenance; disjoint frames alone cannot bypass a competitor. Cache versions are `bilingual-alignment-3` and `local-lexicon-9`. No provider or network route changes.

Release-data regression policy: `Think about the consequences.` and `I think highly of her.` have distinct definition argument/modifier evidence; removing the incomplete-frame penalty should preserve that evidence. `They think him foolish.` and `I think him to be honest.` intentionally remain ambiguous: multiple WordNet judgment/belief senses share predicative examples, and frames do not supply independent semantic distinctions. Generic `think that`, bare `think`, and `think of` also require richer lexical context. Broad Vietnamese glosses and overlapping examples cannot resolve WordNet's finer sense granularity. Do not add phrase-specific winners without independent lexical data.

The quick explanation adds a quiet EN/VI note only for ambiguous analyzed results with multiple same-POS candidates within one semantic point. It excludes explicit pattern conflicts and does not warn for ordinary dictionary lists or missing translations.

Stabilization verification: typecheck and diff checks PASS. The focused language/alignment launch was BLOCKED by esbuild `spawn EPERM`; the exact approved retry started, but the single permitted result-status check returned no final report (UNRESOLVED). Later calibration and UI regression additions are NOT RUN. Full suite is NOT RUN because focused verification is unresolved. The prior unrelated `PdfPage.test.tsx` missing Explain-button failure remains outside scope; PDF code is untouched.
