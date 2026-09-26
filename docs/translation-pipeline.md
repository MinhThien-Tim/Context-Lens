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

`LookupService.quick(request, settings, signal, onLocal)`:

1. **Immediate local result (synchronous).** `localLookup` returns a `LookupResponse` from the
   installed dictionary packs and curated lexical units (`matchKnownExpression`). This is what the
   quick card shows instantly.
2. **Local asset readiness.** `ensureLocalDictionaryAssets()` (bundled EN→VI pack + WordNet) with
   errors swallowed — a partial load is still usable.
3. **Cached sentence translation.** Looks up `db.translations` with
   `translationKey({ text: sentence, 'en'→'vi', mode: 'sentence' })`; on hit, the sentence
   translation is remembered locally and the look is marked `translationCacheHit`. This path never
   re-requests.
4. **Local semantic analysis.** `LocalLanguageEngine.analyzeSelection` (normalization → token
   reconstruction → lemma/morphology → phrase detection → sentence analysis → `SenseResolver`),
   merged over the base result with `applyLocalResult`.
5. **Stop conditions.** If `quickEngine === 'offline'`, or the result is complete
   (English definition + Vietnamese meaning) with `confidence >= 0.8` under `quickEngine === 'auto'`,
   the local result is returned. `onLocal` is always called first so the surface can enrich
   progressively rather than block on network.
6. **Google sentence pass (optional).** When a Google/`google-web` provider is available, the
   sentence is translated and `analyzeSelection` is re-run so senses can be re-ranked. Success with
   a context-matched sense returns immediately.
7. **Wiktionary web dictionary (optional).** Only when `automaticFallback && publicTranslation &&
   targetLang === 'vi'`. `lookupWebDictionary` has its own `db.settings` cache with TTLs
   (success 30 d, miss 6 h, failure 5 min) and refuses to run while offline. Results merge into the
   existing senses (`mergeDictionaryResult`).
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
