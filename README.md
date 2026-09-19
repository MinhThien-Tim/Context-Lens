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

The service worker is active in production builds. Browser AI requests require HTTPS outside localhost.

The production app downloads and precaches the included 104,738-entry English–Vietnamese dictionary (17.5 MB uncompressed). Open it online once and let the service worker finish installing before going offline. `npm run dev` does not install an offline app shell; use the production build and preview to test offline reloads. Entries without English glosses show their Vietnamese meanings in the EN tab too. Contextual AI explanations require a connection or a previously cached result.

For Gemini, select **Free — Gemini**, paste a Google AI Studio API key, and use model ID `gemini-3.6-flash`. Saving setup retries the open lookup. Model/endpoint, authentication, rate-limit, and connection failures are shown separately. A Gemini subscription alone does not configure an API key in this app.

## Current architecture

```text
src/
  ai/                 provider contract, prompts, Gemini and compatible adapters
  app/                application composition and state
  components/         bottom sheet and small reusable UI
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

1. Highlight/select the text and open the bottom sheet synchronously.
2. Render a replaceable local dictionary result.
3. Check the sentence-aware IndexedDB cache.
4. Request a contextual result directly from the configured provider.
5. Validate external JSON strictly before rendering; retain the local result on failure.

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
- Short Gemini-first onboarding and session/persistent key choices
- Versioned full system prompt, strict Zod validation, and a complete provider JSON schema
- Shared provider timeout/error handling for auth, quota, rate limit, network, and malformed responses
- Context-aware Dexie cache, offline cached-result recovery, LRU-style size limit, and robust dictionary fallback
- Offline/update status UI and versioned IndexedDB migrations
- Client-first article URL import with Readability, sanitization, metadata, important images, and configurable proxy fallback
- Lazy PDF.js and epub.js import; original files and extracted selectable text are stored for offline reading
- Web Speech pronunciation, contextual vocabulary library/search, CSV and versioned English101 JSON export, and expandable Deep Explain
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

## Stage 3 status

The first two Stage 3 slices are implemented:

- Local dictionary data is behind a versioned provider registry, ready for downloadable or English101-owned language packs.
- Portable `context-lens.backup` version 1 export/restore preserves documents and vocabulary while excluding API keys, AI cache, and original binary book files.
- The library exposes storage usage, persistent-storage status, AI-cache cleanup, and per-document deletion.
- DOCX joins the shared importer contract and remains outside the initial bundle.
- Dictionary packs require versioned schemas and explicit license/attribution metadata; see `docs/DICTIONARY_PACK.md`.
- English101 synchronization is intentionally not implemented yet. The versioned export contract remains the future integration boundary.
- A least-privilege Manifest V3 extension hands the current URL to the existing article-import contract without reading page content.
