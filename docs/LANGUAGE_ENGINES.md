# Language engines

Context Lens is a reading assistant with two independent routers. Translation never invokes an LLM by default. Existing document importers, reading positions, dictionary packs, vocabulary exports, backups, and extension URL handoff remain in place.

## File map

| Path | Responsibility |
| --- | --- |
| `src/core/translation/types.ts` | Normalized translation contract and provider interface |
| `src/core/translation/router.ts` | Cache-first routing, sequential fallback, deadlines, deduplication |
| `src/core/translation/provider-health.ts` | Pair/provider cooldown with bounded backoff |
| `src/core/translation/provider-registry.ts` | Enabled providers and user-selected priority |
| `src/core/translation/providers/` | Browser, dictionary, saved vocabulary, optional MyMemory, configured gateways |
| `src/core/context/context-router.ts` | Explicit context modes, compact cache, rules, complexity decisions and fallback |
| `src/core/context/schema.ts`, `adapter.ts` | Compact AI output validation and compatibility with the existing reader UI |
| `src/core/context/{heuristic,complexity-estimator,prompt-builder}.ts` | Local phrase senses, complexity hints and context limits |
| `src/core/context/providers.ts` | Existing BYOK adapters, Hosted Lite quota, local compatible endpoint |
| `src/core/{cache,requests,errors,network}.ts` | Shared infrastructure; provider-independent UI errors |
| `src/db/database.ts` | Version 8 migrations in the existing database |
| `src/notes/` | Offline notes attached to documents and selections |
| `src/lookup/service.ts` | Compatibility facade for existing reading/vocabulary response shape |
| `src/lookup/context.ts` | Reusable sentence spans, abbreviation repair and selection normalization |
| `src/settings/engines.ts`, `EngineSettingsForm.tsx`, `ApiSettings.tsx` | Engine preferences and existing BYOK setup |
| `src/app/App.tsx`, `src/components/LookupBottomSheet.tsx` | Independent quick/context state and explicit actions |

## Fallback flow

Quick: bounded memory → Dexie → ready browser translation → installed/bundled dictionary → saved vocabulary → optional web lookup (Wiktionary, then MyMemory when translation is still needed) → configured Google gateway → configured Bing gateway. Web lookup requires the explicit `publicTranslation` opt-in; automatic fallback alone never enables it. Provider selection can promote a configured engine; Offline excludes all network adapters. Flags take precedence over selected priority. Automatic fallback can be disabled.

Context: exact model cache (or previously available result when offline/no AI) → known phrase rule → simple dictionary explanation → user API → Hosted Lite → local model. Explicit engine selection can reorder this chain. Unknown or ambiguous phrases remain eligible for AI; recognized percentage “account for” and “make up one's mind” avoid it. Grammar and other explicit modes are never mistaken for ordinary word translation.

Defaults enable local engines and configured user API for **explicit** context actions. Public translation, custom gateways, Hosted Lite and local LLM remain off. The managed pilot is compiled in only when `VITE_MANAGED_TRANSLATION=true`; its experimental Google web adapter uses a bounded unauthenticated endpoint without token extraction, retry, proxy rotation or challenge bypass. Bing ships only as a clean-unavailable adapter. AI translation fallback and DeepL remain extension points, not enabled implementations.

Local/browser translation deadlines are 90/280 ms. Network defaults to 1200 ms, configurable within 200–2000 ms. Context providers have a 20-second outer deadline including response parsing. No automatic retry doubles paid requests. Failures cool a pair for 30 seconds, 2 minutes, 10 minutes, then up to 1 hour. Three distinct active failed pairs trigger provider-level cooldown. Missing dictionary entries and unsupported browser pairs do not count as outages.

Concurrent identical requests share work. Each subscriber can abort independently; the final departing subscriber aborts the underlying request. Selection changes, close and leaving the reader cancel stale work. No AI on hover, scroll, page load, or selection. No network fan-out.

## Cache and migration

One versioned `context-lens` database stores documents, settings and provider-independent translation/context caches. Existing documents, vocabulary, notes, settings, packs and legacy lookups remain untouched by the gateway work; old AI lookups remain a read-only fallback for EN→VI meaning requests without AI/offline.

Translation identity: normalized NFC text with case/punctuation preserved, source, target, word/phrase/sentence/paragraph mode and version. Provider ID is metadata rather than cache identity, so a successful Google result prevents an unnecessary Bing lookup for the unchanged request. Context identity remains separate and includes selection, bounded sentence, relevant adjacent sentences, source/target/display language, context mode, prompt version, provider family/endpoint and model. Keys use unambiguous JSON encoding instead of a collision-prone short hash. Text stays in local storage; no analytics were added.

Each cache has a 128-result memory limit. Persistent defaults: 5,000 translation rows and 1,000 context rows, configurable through `EngineSettings`. Successful AI context also writes a provider-independent offline alias, so it uses two rows. Hits update on memory and disk reads. Cleanup is deferred, transactionally capped, and favors frequently used entries among older candidates. Storage errors do not discard useful results. Clearing lookup data clears both new caches and memory; backups continue to omit caches and API keys.

## Provider configuration

### Managed Cloudflare pilot

`npm run gateway:build` opts the frontend into the same-origin `/api/translate` service. A separate `google-web` adapter follows local engines and can be disabled with the Online translation setting or Offline mode. The server uses an experimental Google GTX endpoint, SQLite-backed Durable Object admission, daily per-IP/global quotas, a persisted circuit breaker and no retry. Device cache remains first; no translation bodies are stored on the server. This supersedes the statement below that no experimental adapter ships, specifically for the opt-in pilot build. Deployment defaults to disabled. See `gateway/README.md` and `gateway/VERIFICATION.md`.

The version 1 gateway contract accepts `auto`, `google-web`, and `bing-web` selections and returns a normalized response containing `version`, `text`, and the concrete provider ID. Auto routing is deterministic and sequential (`google-web` then `bing-web`), never fan-out. Google is isolated behind its provider adapter. Bing has an isolated unavailable adapter because no stable unauthenticated request was justified without fragile web-token or scraping behavior. Manual selection never calls the other provider, cancellation stops fallback, and quota/cooldown state is tracked per attempted provider. `google-cloud-v2` and `azure-translator` are reserved type-safe extension points only and are not executable providers.

### Browser

Feature-detected `Translator` API. Selection lookup only uses `availability() === 'available'`. **Prepare browser language model** is an explicit settings action that permits model download. Unsupported platforms/pairs fall through. No browser API enters reader UI components.

Reference: https://developer.chrome.com/docs/ai/translator-api

### Optional public translation

Wiktionary and MyMemory share one explicit web-lookup opt-in. Wiktionary definitions are cached on-device for 30 days; empty results are cached for six hours, transient failures for five minutes, and concurrent lookups for the same lemma share one request. MyMemory is invoked only through its translation provider, preventing the former duplicate call from the dictionary layer. It uses only the documented GET lookup API, never its contribution/upload endpoints. The request is anonymous, with no email or key. Maximum translation input is 500 UTF-8 bytes; daily quota and HTTP errors fall through. Only the selected word/text is sent; document context and metadata are excluded. Provider terms, availability and quotas remain externally controlled.

References: https://mymemory.translated.net/doc/spec.php and https://mymemory.translated.net/doc/usagelimits.php

### Google/Bing gateway

Configure an HTTPS translation URL you operate (HTTP loopback allowed for development). This repository implements the client contract, not a deployed backend or direct official API credentials. The gateway should call the selected official provider and normalize its result:

```json
{ "provider": "google", "text": "prerequisite", "sourceLang": "en", "targetLang": "vi" }
```

Successful response:

```json
{ "text": "điều kiện tiên quyết", "detectedLang": "en" }
```

Optional `transliteration` is supported. HTTP 402/429 means quota. No cookies are sent. The endpoint must allow the app origin through CORS. Provider credentials belong on your server. Google/Bing controls have no effect without a configured endpoint.

### Future official providers

The reserved path is intentionally small:

```text
Context Lens → TranslationRouter → Gateway → official provider adapter
```

`google-cloud-v2` and `azure-translator` already have reserved IDs and server-side configuration extension points, but neither executes. A later implementation can add adapters without changing the frontend response shape or cache identity. Secrets should remain server-side; example deployment names are `GOOGLE_TRANSLATE_KEY`, `AZURE_TRANSLATOR_KEY`, and `AZURE_TRANSLATOR_REGION`. No real secrets, billing integration, OAuth, service accounts, credential UI or production BYOK flow are included.

### Context

BYOK reuses Gemini, Anthropic and OpenAI-compatible adapters and their existing strict JSON schema. The prompt includes requested mode and language direction. Local models use an OpenAI-compatible loopback endpoint, a model name, and no Authorization header when the key is empty. CORS still applies.

Hosted Lite is optional and requires an endpoint receiving bounded `{ selectedText, sentence, previousSentence, nextSentence, mode, sourceLang, targetLang }`. It returns the compact `ContextExplanation` schema, with fields such as `meaning`, `grammar`, `whyHere`, `simplified`, `chunks`, and `confidence`; irrelevant fields may be omitted. Client quota is reserved atomically across tabs in Dexie per UTC day and endpoint. Failed attempts still consume a reservation. The server **must independently enforce quotas**; a browser counter is not abuse protection. No server is provisioned by this change.

Quick requests contain selection only. Meaning/grammar normally contain selection and sentence. Simplification/structure may include up to 500 characters from each neighbor. Selection is capped at 2,000 characters; the sentence window at 3,200. Notes, vocabulary records and document metadata are never sent with context. AI no longer regenerates quick lookup data; a local adapter maps compact explanations into the existing EN/VI `deep` UI shape.

Provider order is configurable separately for quick and context engines. Debug mode exposes provider id, cache hit/miss, latency and normalized status only; it never displays selected text, prompts, API keys, or raw provider responses. Active pair/provider cooldowns appear in Settings.

Notes live only in IndexedDB and are linked to a document, optional selected text/sentence, and reading position. Backup version 2 includes notes; restore accepts both version 1 (zero notes) and version 2. Deleting a document also deletes its notes. Notes never enter translation/context inputs.

## Verification and limits

Regression coverage includes cache hits, fallback ordering, ignored-abort timeout, cancellation isolation, pair/provider cooldown, migration from v5, insert/read/eviction, local EN↔VI, ambiguous phrases, quota/offline fallback, multi-sentence selection, paragraph extraction, strict structured-response validation, notes, and complete offline reading flows. Existing import, backup, vocabulary and reader tests remain in the suite. Run `npm test`, `npm run typecheck`, `npm run build`.

Automated budgets require local dictionary p95 below 100 ms, warm memory-cache p95 below 50 ms, initial JavaScript below 350 KiB per entry asset, and initial CSS below 100 KiB. On the development machine the measured p95 values were 0.022 ms and 0.325 ms; the production build reported 259.1 KiB and 278.7 KiB initial JavaScript assets, 17.1 KiB CSS, with four heavy reader chunks kept lazy. These numbers are environment-specific. Browser adapter tests use mocks, and desktop smoke testing does not replace Android/iOS QA. Actual provider credentials, downloaded browser models and deployed gateways require environment-specific checks.

The large existing dictionary is indexed EN→VI. VI→EN can reverse-search exact Vietnamese meanings in installed packs and uses a bounded memo cache; broad or approximate reverse translation still benefits from browser/public/configured providers. Heuristics deliberately cover a small set of confident patterns, including percentage and causal `account for`, `make up one's mind`, and `maintain public confidence`, rather than general offline grammar. The notes editor is local-only; no full local LLM runtime is bundled. Browser secret vault APIs are unavailable in this PWA: session storage remains default, persistent IndexedDB keys are opt-in and disclosed in Settings.

Next improvements: expand licensed VI→EN packs, deploy and test a quota-enforcing hosted/gateway service, profile on physical mobile devices, and add further context rules only with disambiguation regression cases. The original adapter architecture was reviewed at https://github.com/ttop32/MouseTooltipTranslator; its fragile web endpoints were not copied.
