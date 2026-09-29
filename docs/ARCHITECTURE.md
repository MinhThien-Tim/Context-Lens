# Context Lens — Architecture Map

Navigation entry point for agents. Describes the **current** implementation, not a plan.
Detail lives in the domain docs; this file stays compact on purpose.

## Project overview

Context Lens is a mobile-first, offline-capable PWA for Vietnamese learners reading English.
Runtime pieces:

- **Client** — Preact + Vite + TypeScript, single-page app (`src/main.tsx` → `src/app/App.tsx`), PWA service worker via `vite-plugin-pwa`.
- **Local-first data** — Dexie/IndexedDB database `context-lens` (`src/db/database.ts`, schema v15). No required backend.
- **Static language assets** — bundled EN→VI dictionary pack + compact WordNet 3.0 (`release/dictionary`, `release/wordnet`, loaded by `src/lookup/localAssets.ts`).
- **Optional network** — only after local/cache misses and explicit opt-in: MyMemory, configured Google/Bing gateway, Wiktionary web, optional Cloudflare Worker `/api/translate`, and user-configured AI context providers (`src/ai/providers/*`).
- **Optional extension** — `extension/` (Manifest V3) hands a URL to the article-import contract only.

## Architecture map

```text
Input
  paste / file / URL / share-target / extension
        │
        ▼
Import adapters  src/documents/import/*
        │  ImportedDocument { content, safeHtml, pageOffsets, pdfPages, toc, location }
        ▼
Persistence  src/db/database.ts  (db.documents)
        │
        ▼
Reader surfaces (App.tsx chooses one)
  ├─ TextReader             text / markdown / article / docx / epub text
  ├─ Original PDF Reader    src/reader/pdf/*         (PDF.js canvas + text layer)
  └─ Reading Mode           src/reader/pdf-reading/* (reflowed structured pages)
        │  both PDF modes share: DocumentRecord, DocumentLocation, page offsets,
        │  structuredPages, markup, usePdfScroll, lookup pipeline
        ▼
Selection  ReaderSelection { text, offset, type, context{prev,current,next,paragraph}, pdfPage?, ocr? }
        │  src/lookup/context.ts (sentence spans); PDF: PdfTextIndex / readingSelectionAdapter
        ▼
Text layer  PDF extraction + index  src/documents/pdf/extractStructuredPages.ts
            OCR supplement           src/documents/pdf/ocr*.ts
        ▼
Lookup / translation pipeline  src/lookup/service.ts (LookupService)
  1 normalizeSelection / morphology   src/lookup/normalization/*
  2 LocalLanguageEngine               src/core/language/* (lexicon, phrases, sentence cache, SenseResolver)
  3 local dictionary registry + WordNet src/lookup/dictionary/*, src/core/language/wordnet.ts
  4 sentence translation cache (db.translations) → re-rank senses
  5 Google/google-web sentence pass (optional) → re-rank senses
  6 Wiktionary web dictionary           src/lookup/webDictionary.ts (optional)
  7 TranslationRouter                   src/core/translation/*
  8 explicit Context/Grammar: ContextRouter  src/core/context/*
        │  two-level EngineCache src/core/cache.ts + SharedRequests src/core/requests.ts
        ▼
UI  src/components/LookupBottomSheet.tsx (Quick → Expanded), ReaderToolbar, notes, vocabulary
        ▼
Persistence  db.lookups / db.translations / db.contexts / db.sentenceAnalyses
             db.vocabulary / db.vocabularyCollections / db.notes / db.pdfOcr / db.learnedLexicon
```

## Major subsystems

| Subsystem | Responsibility | Primary location |
| --- | --- | --- |
| App composition & state | Routing between home and reader, all reader state, OCR queue wiring | `src/app/App.tsx` |
| Homepage / import | Paste, file, article URL, share target, library, onboarding | `src/components/PasteComposer.tsx`, `src/documents/import/*` |
| Text reader | Sanitized HTML / plain-text rendering, selection, highlights | `src/reader/TextReader.tsx` |
| Original PDF Reader | PDF.js page canvases, text layer, zoom, per-page selection | `src/reader/pdf/*` |
| Reading Mode | Reflowed structured pages, OCR pages, reading selection | `src/reader/pdf-reading/*` |
| PDF extraction / index | Page offsets, structured pages, TOC detection, canonical text | `src/documents/pdf/*`, `src/reader/pdf/PdfTextIndex.ts` |
| OCR | Tesseract.js worker, eligibility, page cache, background queue | `src/documents/pdf/ocr*.ts`, `src/reader/pdf/usePdfOcrQueue.ts` |
| Dictionary / lookup | Bundled + installed packs, local lookup, web dictionary | `src/lookup/dictionary/*`, `src/lookup/localDictionary.ts`, `src/lookup/webDictionary.ts` |
| Morphology / lemma | Normalization, lemma + compound + phrase candidates, token reconstruction | `src/lookup/normalization/*`, `src/core/language/lexicon.ts` |
| Context meaning selection | Sense ranking from sentence, phrase, collocation, translation evidence | `src/core/language/sense-resolver.ts` |
| Translation pipeline | Provider registry, priority, health, dedupe, MyMemory quality gate | `src/core/translation/*`, `src/lookup/service.ts` |
| Context / AI | Explicit ContextRouter, heuristics, prompts, Zod schema, providers | `src/core/context/*`, `src/ai/*` |
| Caching | Bounded memory + Dexie, versioned keys, shared in-flight requests | `src/core/cache.ts`, `src/core/requests.ts` |
| UI / state | Preact components; state owned by `App.tsx` and per-component hooks | `src/components/*`, `src/styles.css` |
| Offline mode | App-shell precache, stored-document readiness, offline status surfaces, local-only lookup/providers | `src/documents/offline.ts`, `src/components/OfflineBadge.tsx`, `src/lookup/service.ts`, `src/app/App.tsx` |
| Persistence / storage | Dexie schema + migrations, backup/restore, quota maintenance | `src/db/database.ts`, `src/storage/*` |
| Vocabulary / English101 | Save words, collections, CSV + versioned English101 export | `src/vocabulary/*` |
| Testing | Vitest units/integration, Playwright browser specs | `src/**/*.test.ts`, `e2e/*.spec.ts` |

## Important entry points

Inspect these first, for a task in the matching subsystem:

- **App/state/routing** — `src/app/App.tsx`, `src/main.tsx`, `index.html`
- **Reader shell & chrome** — `src/reader/ReaderShell.tsx`, `src/reader/ReaderToolbar.tsx`, `src/reader/navigation.ts`, `src/reader/readingPosition.ts`
- **Original PDF Reader** — `src/reader/pdf/PdfViewer.tsx`, `src/reader/pdf/PdfPage.tsx`, `src/reader/pdf/PdfTextIndex.ts`, `src/reader/pdf/selectionAdapter.ts`, `src/reader/pdf/navigation.ts`
- **Reading Mode** — `src/reader/pdf-reading/PdfReadingView.tsx`, `structuredPages.ts`, `PdfReadingPage.tsx`, `readingSelectionAdapter.ts`
- **PDF model & OCR** — `src/documents/pdf/types.ts`, `extractStructuredPages.ts`, `ocrEligibility.ts`, `ocrStore.ts`, `ocrWorker.ts`, `src/reader/pdf/usePdfOcrQueue.ts`
- **Lookup pipeline** — `src/lookup/service.ts`, `src/lookup/localDictionary.ts`, `src/core/language/local-language-engine.ts`, `src/core/language/sense-resolver.ts`
- **Translation providers** — `src/core/translation/router.ts`, `provider-registry.ts`, `providers/*.ts`, `src/core/translation/provider-health.ts`
- **Context/AI** — `src/core/context/context-router.ts`, `src/core/context/providers.ts`, `src/ai/provider.ts`, `src/ai/providers/*`
- **Storage** — `src/db/database.ts`, `src/storage/backup.ts`, `src/storage/storageService.ts`, `src/settings/store.ts`
- **Vocabulary** — `src/vocabulary/store.ts`, `src/vocabulary/export.ts`, `src/vocabulary/contract.ts`

## Architectural invariants

Verified against the current code. Preserve these when modifying.

1. **Shared document model across PDF modes.** Original Reader and Reading Mode render from the same `DocumentRecord` (`src/db/database.ts`) and emit the same `PdfDocumentLocation` (`src/documents/location.ts`). Mode switching recomputes the location from page + page fraction instead of creating a second position model (`changePdfViewMode` in `src/app/App.tsx`). Do not introduce an incompatible parallel pipeline.
2. **One page model, two renderers.** `src/reader/pdf-reading/structuredPages.ts` derives the page model for both modes, including a fallback for legacy records that only have `pageOffsets`. Reading Mode must not re-extract text independently.
3. **Offsets stay canonical.** `PdfTextIndex` normalizes only for alignment and never rewrites offsets; `absoluteOffset` is derived from `pageOffsets` via `pdfOffsetForPage`. Highlights and notes are stored as document offsets.
4. **OCR supplements, never replaces.** OCR results live in the separate `db.pdfOcr` table, keyed by document + hash + page + language + config version + render parameters (`ocrKey` in `src/documents/pdf/ocrStore.ts`). They render where PDF text is missing/poor or its integrity is `corrupt` (`pdfPageNeedsOcr`), and are chosen per page via `DocumentRecord.pdfTextSources`. The original page representation is always retained, and native selection inside OCR text is deliberately excluded (`PdfReadingView.captureSelection`).
5. **Lookup priority is local-first and cache-first.** `LookupService.quick` returns a synchronous local result first, enriches it with `LocalLanguageEngine`, and only continues when results are insufficient. Provider priority is assigned in `src/core/translation/provider-registry.ts`; memory and Dexie caches precede providers, and local dictionary/phrase/rules precede enabled network providers. In Auto mode the managed Worker follows local, browser, and MyMemory providers but may precede configured Google/Bing providers. This existing ordering does not fully satisfy the managed-Worker-last rule in `COST & QUOTA GUARDRAILS.md` §5; changing runtime priority is a separate behavior task.
6. **Cache must prevent repeat external requests.** `EngineCache` (`src/core/cache.ts`) is two-level and version-stamped; `SharedRequests` (`src/core/requests.ts`) dedupes in-flight work and aborts only when the last subscriber leaves. Cache keys include normalized text, language pair, mode, and schema/prompt version.
7. **Failures degrade, they do not break reading.** Timeout, quota exhaustion, offline, `429`/`503`, and provider errors fall back to cache/local results and keep the quick card visible. `COST & QUOTA GUARDRAILS.md` is binding.
8. **AI context is explicit and opt-in.** Context/Grammar are user actions routed through `ContextRouter`; local heuristics and cached results run first. User keys are never logged and never sent to project infrastructure.
9. **Versioned contracts.** Dexie schema versions, `TRANSLATION_VERSION`, `CONTEXT_VERSION`, `OCR_CONFIG_VERSION`, backup versions 1–4, and `english101.context-vocabulary` v1/v2 are explicit. A change in output shape requires a new version, never a silent overwrite.
10. **Bundle discipline.** PDF.js, Tesseract.js, epub.js, and Mammoth are lazy dedicated chunks excluded from service-worker precache (`vite.config.ts`). Keep heavy reader code out of the initial bundle.
11. **No silent reload on update.** The PWA uses `registerType: 'prompt'`; `src/main.tsx` only signals `context-lens:update-ready` and the app reloads through its explicit Reload control via `applyUpdate(true)`. A worker must never reload the reader on its own.

## How to read the documentation

Default path: `AGENTS.md` → this file → **one** matching domain doc → the source files that doc names.

> Do not read all domain docs. Read only the document selected for the current task unless the task
> genuinely crosses subsystem boundaries.

### Core entry points — always read

- `AGENTS.md` (repository root) — working rules, instruction precedence, scope, verification, stop rules
- `docs/ARCHITECTURE.md` (this file) — subsystem map, entry points, invariants, routing table

### Task-specific domain docs — read only when the task matches

- [reader.md](reader.md) — PDF, OCR, Original Reader, Reading Mode, selection, navigation
- [translation-pipeline.md](translation-pipeline.md) — dictionary, morphology, sense selection, translation/context providers
- [ui-system.md](ui-system.md) — UI, theme, layout, responsive behavior, panels
- [data-storage.md](data-storage.md) — Dexie, persistence, notes, vocabulary, backup

### Supporting references — read only when needed

- [runtime-manifests.md](runtime-manifests.md) — PWA manifest/service-worker and Worker configuration ownership
- [testing.md](testing.md) — test layout, commands, selection strategy and verification status semantics
- [agent-execution-rules.md](agent-execution-rules.md) — canonical Execution / Test Retry Policy, scope, verification and stop rules
- `COST & QUOTA GUARDRAILS.md` (repository root) — network/API/quota/cost behavior
- [DICTIONARY_PACK.md](DICTIONARY_PACK.md) — dictionary pack schema, build and license
- [DEVICE_QA.md](DEVICE_QA.md) — real-device release verification
- [../gateway/README.md](../gateway/README.md) — gateway/Worker contract

These are not default reading. Each is opened only for a task that genuinely needs it.

## Task routing

| Task | Read |
| --- | --- |
| PDF/OCR/reader | [reader.md](reader.md) |
| Dictionary/translation/context | [translation-pipeline.md](translation-pipeline.md) |
| UI/theme/responsive | [ui-system.md](ui-system.md) |
| Offline mode / PWA shell | [ui-system.md](ui-system.md) + [data-storage.md](data-storage.md) + [translation-pipeline.md](translation-pipeline.md) |
| Dexie/storage/backup | [data-storage.md](data-storage.md) |
| Test commands | [testing.md](testing.md) |
| Complex execution policy | [agent-execution-rules.md](agent-execution-rules.md) |
| Cost/network/quota | `COST & QUOTA GUARDRAILS.md` |
| Dictionary pack | [DICTIONARY_PACK.md](DICTIONARY_PACK.md) |
| Physical-device QA | [DEVICE_QA.md](DEVICE_QA.md) |
| Gateway/Worker | [../gateway/README.md](../gateway/README.md) |

Then read only the specific source files listed in that document.

## Archive — historical material, never current architecture

`docs/archive/` holds completed reports, decisions, delivery logs and raw measurement captures:

```text
docs/archive/
├─ pdf/           reader and OCR stage reports, the PDF rendering decision, the stability report
├─ translation/   superseded language-engine and local-dictionary delivery logs
├─ releases/      completed release-readiness and quality snapshots
├─ verification/  dated gateway verification evidence
└─ measurements/  raw PDF stability JSON captures
```

Rules:

- Never browse `docs/archive/` by default, and never route a task into it.
- Read an archived file only when the task explicitly needs historical rationale, regression
  investigation, or an older measurement.
- Archive content is **not** a source of current architecture truth. Code, config and the active docs
  above always override it, whatever the archived file claims.
- No active document may present an archived file as current authority. Keep the archive out of the
  default reading path.
