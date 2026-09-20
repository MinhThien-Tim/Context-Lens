# Context Lens

A mobile-first PWA for Vietnamese learners to understand English words and phrases without leaving the reading flow. The repository contains the stable reader foundation, completed Stage 2 features, and Stage 3 hardening work (`0.3.0-alpha.2`).

## Run locally

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Open the local URL shown by Vite. For production and verification:

```bash
npm test
npm run build
npm run preview
```

For the Cloudflare Free online translation pilot, use `npm run gateway:build`, `npm run gateway:check` (local packaging only), and `npm run gateway:dev`. The normal `npm run dev` starts the local reader without the gateway. The pilot requires a server-side `IP_HASH_SECRET` and `ONLINE_ENABLED=true`; no Google API key is required. See [gateway setup, quotas and staging checklist](gateway/README.md). Google unofficial availability is experimental; successful translations are cached on the device, and server failures preserve local reading results.

The service worker is active in production builds. Browser AI requests require HTTPS outside localhost.

The production app downloads and precaches the included 104,738-entry English–Vietnamese dictionary (17.5 MB uncompressed). Open it online once and let the service worker finish installing before going offline. `npm run dev` does not install an offline app shell; use the production build and preview to test offline reloads. Entries without English glosses show their Vietnamese meanings in the EN tab too. Context explanations use cached results and local rules first; optional AI runs only after an explicit Context or Grammar action.

Basic reading requires no API key. In Settings, **Auto** uses memory/Dexie cache, a ready browser model, and offline dictionaries. Optional MyMemory web translation and configured Google/Bing gateways can extend quick translation. Context providers (user API, Hosted Lite gateway, local model) are configured separately. See [language-engine architecture and gateway contracts](docs/LANGUAGE_ENGINES.md).

For Gemini, choose **Gemini context** and enter your own API key and an available model ID. Saving setup updates the engines; it does not send a context request until you press Context or Grammar.

## Current architecture

```text
src/
  ai/                 provider contract, prompts, Gemini and compatible adapters
  app/                application composition and state
  components/         progressive quick/context bottom sheet
  core/translation/   typed translation router, provider registry, health, adapters
  core/context/       explicit context router, heuristics, bounded prompts, providers
  core/               bounded two-level cache, deadlines, shared requests, transport
  db/                 Dexie schema and preferences
  documents/          location contracts and lazy document import adapters
  lookup/             context extraction, local dictionary, cache, validation
  reader/             text reader interaction and position persistence
  settings/           API-key onboarding and storage
  storage/            quota, persistence, backup, and restore
  vocabulary/         contextual vocabulary persistence
  test/               shared test setup and fixtures
public/                PWA icon
extension/             optional Manifest V3 URL handoff extension
```

The interaction pipeline is intentionally latency-first:

1. Tap/select text and show a local result immediately.
2. After a 150 ms stable-selection delay, TranslationRouter checks memory ? Dexie ? browser ? dictionary/vocabulary ? enabled network adapters.
3. Keep the quick card visible while reading.
4. Only an explicit Context, Grammar, or More action invokes ContextRouter: cache ? deterministic rules ? configured context providers.
5. Preserve the quick card on timeout, quota exhaustion, unsupported languages, cancellation, or provider failure.

Dexie v8 adds separate translation/context caches and offline notes without replacing documents, vocabulary, dictionary packs, or legacy lookup records. Both caches use bounded memory and deferred, hit-weighted LRU cleanup. Context AI returns a compact task-specific explanation which is adapted to the existing reader UI. `npm run typecheck` runs TypeScript validation; this repository has no separate lint configuration.

Locations store both an absolute offset and normalized progress. PDF locations also track pages; EPUB locations track chapters with a reserved CFI field. This keeps restoration stable when viewport or typography changes. IndexedDB migrations are versioned and older documents are upgraded automatically.

API keys are session-only by default. Persistent keys are stored in this browser's IndexedDB only when the user opts in. Keys are never logged. The app has no required backend.

## Implemented

- Installable PWA manifest, share-target declaration, offline app shell, and auto-updating service worker
- Mobile-first text paste and sanitized Markdown rendering, local document library, cancellable import progress, debounced reading-position storage, real progress, and reader preferences
- Tap-to-look-up and native drag/long-press phrase selection
- Previous/current/next sentence extraction without whole-document AI requests
- Immediate bottom sheet with EN, VI, and EN + VI modes
- Bundled English–Vietnamese offline dictionary plus curated English glosses and contextual phrase handling
- Gemini, Anthropic, and OpenAI-compatible direct-browser providers; OpenAI uses the compatible adapter
- Separate translation/context settings and session/persistent key choices
- Versioned full system prompt, strict Zod validation, and a complete provider JSON schema
- Shared provider timeout/error handling for auth, quota, rate limit, network, and malformed responses
- Context-aware Dexie cache, offline cached-result recovery, LRU-style size limit, and robust dictionary fallback
- Offline/update status UI and versioned IndexedDB migrations
- Client-first article URL import with Readability, sanitization, metadata, important images, and configurable proxy fallback
- Lazy PDF.js and epub.js import; original files and extracted selectable text are stored for offline reading
- Web Speech pronunciation, contextual vocabulary library/search, CSV and versioned English101 JSON export, and explicit Context/Grammar panels
- Private offline document/selection notes with edit/delete and versioned backup/restore
- Reorderable provider priority, configuration/cooldown status, and opt-in non-sensitive engine diagnostics
- Web Share Target URL/text ingestion
- Versioned local-dictionary registry with replaceable language-pack providers and morphology fallback
- Data/storage dashboard, persistent-storage request, cache cleanup, document deletion, and portable backup/restore
- Lazy DOCX text import through Mammoth
- Validated, licensed dictionary-pack installation and removal
- Storage-pressure cache eviction plus accessible modal focus traps, Escape handling, and keyboard phrase lookup
- Tests for extraction, selection normalization, caching, validation, provider behavior, offline lookup, locations, and documents

## Deferred intentionally

- OCR for scanned PDFs and visual-fidelity PDF page rendering
- Vocabulary review scheduling and richer phrase reconstruction
- Hosted article proxy implementation; the client fallback contract uses `VITE_ARTICLE_PROXY_URL`

## Production readiness

- The licensed English-Vietnamese distribution pack and reproducible build pipeline are complete; see `docs/DICTIONARY_PACK.md` and `release/dictionary/manifest.json`.
- Visual PDF rendering is prioritized before OCR; see `docs/PDF_RENDERING_DECISION.md`.
- Real Android/iOS QA remains a deployment gate and requires connected physical devices or a device farm; see `docs/DEVICE_QA.md` and `docs/RELEASE_READINESS.md`.
- English101 synchronization remains deliberately postponed.

## Stage 3 contracts already in place

- `DocumentRecord.kind` and `DocumentLocation` are extensible for future DOCX/renderers without changing existing records.
- Importers return one `ImportedDocument` contract and accept cancellation/progress callbacks.
- Vocabulary export uses `english101.context-vocabulary` version 1; later sync should adapt this payload rather than read IndexedDB directly.
- Provider prompts, cache keys, database migrations, and external response schemas are explicitly versioned.
- Heavy reader code is isolated in lazy chunks and cached only after use.

## Implementation status

The staged local-first foundation is implemented:

- Local dictionary data is behind a versioned provider registry, ready for downloadable or English101-owned language packs.
- Portable `context-lens.backup` version 2 export/restore preserves documents, vocabulary, and notes while excluding API keys, AI cache, and original binary book files; version 1 backups remain importable.
- The library exposes storage usage, persistent-storage status, AI-cache cleanup, and per-document deletion.
- DOCX joins the shared importer contract and remains outside the initial bundle.
- Dictionary packs require versioned schemas and explicit license/attribution metadata; see `docs/DICTIONARY_PACK.md`.
- VI→EN exact reverse lookup, multi-sentence/paragraph context, typed complexity decisions, and conservative phrase heuristics extend offline coverage.
- Integration and performance tests enforce offline flows, local latency budgets, initial bundle budgets, and lazy reader chunks.
- English101 synchronization is intentionally not implemented yet. The versioned export contract remains the future integration boundary.
- A least-privilege Manifest V3 extension hands the current URL to the existing article-import contract without reading page content.
