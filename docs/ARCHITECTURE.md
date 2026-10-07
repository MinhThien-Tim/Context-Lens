# Context Lens — Architecture Map

Navigation entry point for agents. Describes the **current** implementation, not a plan.
Detail lives in the domain docs; this file stays compact on purpose.

## Project overview

Mobile-first, offline-capable PWA for Vietnamese learners reading English.

- **Client** — Preact + Vite + TypeScript SPA (`src/main.tsx` → `src/app/App.tsx`), PWA via `vite-plugin-pwa`.
- **Local-first data** — Dexie/IndexedDB `context-lens` (`src/db/database.ts`, schema v15). No required backend.
- **Static language assets** — bundled EN→VI dictionary pack + compact WordNet 3.0 (`release/dictionary`,
  `release/wordnet`, loaded by `src/lookup/localAssets.ts`).
- **Optional network** — only after local/cache misses and explicit opt-in: MyMemory, configured Google/Bing
  gateway, Wiktionary web, optional Cloudflare Worker `/api/translate`, user-configured AI providers
  (`src/ai/providers/*`).
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
| App composition & state | Home/reader routing, all reader state, OCR queue wiring | `src/app/App.tsx` |
| Homepage / import | Paste, file, article URL, share target, library, onboarding | `src/components/PasteComposer.tsx`, `src/documents/import/*` |
| Text reader | Sanitized HTML / plain text, selection, highlights | `src/reader/TextReader.tsx` |
| Original PDF Reader | PDF.js canvases, text layer, zoom, per-page selection | `src/reader/pdf/*` |
| Reading Mode | Reflowed structured pages, OCR pages, reading selection | `src/reader/pdf-reading/*` |
| PDF extraction / index | Page offsets, structured pages, TOC detection, canonical text | `src/documents/pdf/*`, `src/reader/pdf/PdfTextIndex.ts` |
| OCR | Tesseract.js worker, eligibility, page cache, background queue | `src/documents/pdf/ocr*.ts`, `src/reader/pdf/usePdfOcrQueue.ts` |
| Dictionary / lookup | Bundled + installed packs, local lookup, web dictionary | `src/lookup/dictionary/*`, `src/lookup/localDictionary.ts`, `src/lookup/webDictionary.ts` |
| Morphology / lemma | Normalization, lemma/compound/phrase candidates, token reconstruction | `src/lookup/normalization/*`, `src/core/language/lexicon.ts` |
| Context meaning selection | Sense ranking from sentence, phrase, collocation, translation evidence | `src/core/language/sense-resolver.ts` |
| Translation pipeline | Provider registry, priority, health, dedupe, MyMemory quality gate | `src/core/translation/*`, `src/lookup/service.ts` |
| Context / AI | ContextRouter, heuristics, prompts, Zod schema, providers | `src/core/context/*`, `src/ai/*` |
| Caching | Bounded memory + Dexie, versioned keys, shared in-flight requests | `src/core/cache.ts`, `src/core/requests.ts` |
| UI / state | Preact components; state in `App.tsx` and per-component hooks | `src/components/*`, `src/styles.css` |
| Offline mode | App-shell precache, stored-document readiness, offline status, local-only lookup | `src/documents/offline.ts`, `src/components/OfflineBadge.tsx`, `src/lookup/service.ts`, `src/app/App.tsx` |
| Persistence / storage | Dexie schema + migrations, backup/restore, quota maintenance | `src/db/database.ts`, `src/storage/*` |
| Vocabulary / English101 | Saved words, collections, CSV + versioned English101 export | `src/vocabulary/*` |
| Testing | Vitest units/integration, Playwright browser specs | `src/**/*.test.ts`, `e2e/*.spec.ts` |

## Entry points

Inspect these first for a task in the matching subsystem:

- **App/state/routing** — `src/app/App.tsx`, `src/main.tsx`, `index.html`
- **Reader shell & chrome** — `src/reader/ReaderShell.tsx`, `ReaderToolbar.tsx`, `navigation.ts`, `readingPosition.ts`
- **Original PDF Reader** — `src/reader/pdf/PdfViewer.tsx`, `PdfPage.tsx`, `PdfTextIndex.ts`, `selectionAdapter.ts`, `navigation.ts`
- **Reading Mode** — `src/reader/pdf-reading/PdfReadingView.tsx`, `structuredPages.ts`, `PdfReadingPage.tsx`, `readingSelectionAdapter.ts`
- **PDF model & OCR** — `src/documents/pdf/types.ts`, `extractStructuredPages.ts`, `ocrEligibility.ts`, `ocrStore.ts`, `ocrWorker.ts`, `src/reader/pdf/usePdfOcrQueue.ts`
- **Lookup pipeline** — `src/lookup/service.ts`, `localDictionary.ts`, `src/core/language/local-language-engine.ts`, `sense-resolver.ts`
- **Translation providers** — `src/core/translation/router.ts`, `provider-registry.ts`, `providers/*.ts`, `provider-health.ts`
- **Context/AI** — `src/core/context/context-router.ts`, `providers.ts`, `src/ai/provider.ts`, `src/ai/providers/*`
- **Storage** — `src/db/database.ts`, `src/storage/backup.ts`, `storageService.ts`, `src/settings/store.ts`
- **Vocabulary** — `src/vocabulary/store.ts`, `export.ts`, `contract.ts`

## Architectural invariants

Verified against current code. Preserve these when modifying.

1. **One document model across PDF modes.** Original Reader and Reading Mode render from the same
   `DocumentRecord` and emit the same `PdfDocumentLocation` (`src/documents/location.ts`). Mode switching
   recomputes the location from page + page fraction (`changePdfViewMode` in `App.tsx`). No parallel position model.
2. **One page model, two renderers.** `structuredPages.ts` derives the page model for both modes, with a
   fallback for legacy records that only have `pageOffsets`. Reading Mode never re-extracts text itself.
3. **Offsets stay canonical.** `PdfTextIndex` normalizes only for alignment and never rewrites offsets;
   `absoluteOffset` derives from `pageOffsets` via `pdfOffsetForPage`. Highlights and notes store document offsets.
4. **OCR supplements, never replaces.** Results live in `db.pdfOcr`, keyed by document + hash + page + language +
   config version + render parameters (`ocrKey`, `ocrStore.ts`). They render where PDF text is missing/poor or
   integrity is `corrupt` (`pdfPageNeedsOcr`), chosen per page via `DocumentRecord.pdfTextSources`. The original
   page representation is always kept. Native selection inside OCR text is excluded (`PdfReadingView.captureSelection`).
5. **Lookup is local-first and cache-first.** `LookupService.quick` returns a synchronous local result, enriches
   it with `LocalLanguageEngine`, and continues only when insufficient. Memory and Dexie caches precede providers;
   local dictionary/phrase/rules precede network providers. Priority is set in `provider-registry.ts`.
   **Known gap:** in Auto mode the managed Worker follows local, browser and MyMemory but may precede configured
   Google/Bing, which does not fully satisfy the managed-Worker-last rule in `COST & QUOTA GUARDRAILS.md` §5.
   Changing runtime priority is a separate behavior task.
6. **Cache prevents repeat external requests.** `EngineCache` is two-level and version-stamped; `SharedRequests`
   dedupes in-flight work and aborts only when the last subscriber leaves. Keys include normalized text,
   language pair, mode, and schema/prompt version.
7. **Failures degrade; reading never breaks.** Timeout, quota exhaustion, offline, `429`/`503` and provider
   errors fall back to cache/local results and keep the quick card visible. `COST & QUOTA GUARDRAILS.md` is binding.
8. **AI context is explicit and opt-in.** Context/Grammar are user actions via `ContextRouter`; heuristics and
   cache run first. User keys are never logged and never sent to project infrastructure.
9. **Versioned contracts.** Dexie schema versions, `TRANSLATION_VERSION`, `CONTEXT_VERSION`,
   `OCR_CONFIG_VERSION`, backup versions 1–4 and `english101.context-vocabulary` v1/v2 are explicit. A change in
   output shape needs a new version, never a silent overwrite.
10. **Bundle discipline.** PDF.js, Tesseract.js, epub.js and Mammoth are lazy dedicated chunks excluded from
    service-worker precache (`vite.config.ts`). Keep heavy reader code out of the initial bundle.
11. **No silent reload on update.** The PWA uses `registerType: 'prompt'`; `src/main.tsx` only signals
    `context-lens:update-ready`, and the app reloads through its explicit Reload control via `applyUpdate(true)`.

See [Change propagation](change-dependencies.md) for the rule that governs how edits affect dependent layers.

## Task routing

Default path: `AGENTS.md` → this file → **one** row below → the source files that doc names. Read more than one
doc only when the task genuinely crosses subsystem boundaries.

| Task | Read |
| --- | --- |
| PDF / OCR / reader | [reader.md](reader.md) |
| Reader chrome (Header, Footer, More) | [reader-chrome.md](reader-chrome.md) + [reader-behavior-contract.md](reader-behavior-contract.md) |
| Dictionary / translation / context | [translation-pipeline.md](translation-pipeline.md) |
| UI / theme / responsive | [ui-system.md](ui-system.md) |
| Offline mode / PWA shell | [ui-system.md](ui-system.md) + [data-storage.md](data-storage.md) + [translation-pipeline.md](translation-pipeline.md) |
| Dexie / storage / backup / vocabulary | [data-storage.md](data-storage.md) |
| PWA manifest / service worker / Worker config | [runtime-manifests.md](runtime-manifests.md) |
| Test commands and selection | [testing.md](testing.md) |
| Execution policy (retry, scope, stop) | [agent-execution-rules.md](agent-execution-rules.md) |
| Cost / network / quota | `COST & QUOTA GUARDRAILS.md` (repo root) |
| Dictionary pack schema, build, license | [DICTIONARY_PACK.md](DICTIONARY_PACK.md) |
| Physical-device QA | [DEVICE_QA.md](DEVICE_QA.md) |
| Gateway / Worker contract | [../gateway/README.md](../gateway/README.md) |

## Archive

`docs/archive/` (`pdf/`, `translation/`, `releases/`, `verification/`, `measurements/`) holds completed reports,
decisions, delivery logs and raw captures. It is never current architecture and is never routed into by default.
Read a file there only when the task explicitly needs historical rationale, a regression investigation or an old
measurement. Code, config and the active docs always override it; no active doc may cite an archived file as
current authority.