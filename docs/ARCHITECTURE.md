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
4. **OCR supplements, never replaces.** OCR results live in the separate `db.pdfOcr` table, keyed by document + hash + page + language + config version + render parameters (`ocrKey` in `src/documents/pdf/ocrStore.ts`). They render only where PDF text is missing/poor (`pdfPageNeedsOcr`) and are chosen per page via `DocumentRecord.pdfTextSources`. The original page representation is always retained, and native selection inside OCR text is deliberately excluded (`PdfReadingView.captureSelection`).
5. **Lookup priority is local-first and cache-first.** `LookupService.quick` returns a synchronous local result first, enriches it with `LocalLanguageEngine`, and only continues when results are insufficient. Provider priority is assigned in `src/core/translation/provider-registry.ts`; the effective order is memory cache → Dexie cache → local dictionary/phrase/rules → ready browser model → enabled network providers → managed Worker last. This matches `COST & QUOTA GUARDRAILS.md` §5.
6. **Cache must prevent repeat external requests.** `EngineCache` (`src/core/cache.ts`) is two-level and version-stamped; `SharedRequests` (`src/core/requests.ts`) dedupes in-flight work and aborts only when the last subscriber leaves. Cache keys include normalized text, language pair, mode, and schema/prompt version.
7. **Failures degrade, they do not break reading.** Timeout, quota exhaustion, offline, `429`/`503`, and provider errors fall back to cache/local results and keep the quick card visible. `COST & QUOTA GUARDRAILS.md` is binding.
8. **AI context is explicit and opt-in.** Context/Grammar are user actions routed through `ContextRouter`; local heuristics and cached results run first. User keys are never logged and never sent to project infrastructure.
9. **Versioned contracts.** Dexie schema versions, `TRANSLATION_VERSION`, `CONTEXT_VERSION`, `OCR_CONFIG_VERSION`, backup versions 1–4, and `english101.context-vocabulary` v1/v2 are explicit. A change in output shape requires a new version, never a silent overwrite.
10. **Bundle discipline.** PDF.js, Tesseract.js, epub.js, and Mammoth are lazy dedicated chunks excluded from service-worker precache (`vite.config.ts`). Keep heavy reader code out of the initial bundle.

## Documentation tiers

Only **Canonical** documents are part of the normal reading path. **Specialized** documents are read only
for the matching task. Every other file in `docs/` is **historical / reference**: it records decisions,
stage reports and handoffs, not the system as built. If a document is not listed in either list below,
treat it as historical and do not read it unless the task asks for that history.

### Canonical — current architecture

- [reader.md](reader.md) — reader surfaces, PDF loading, page model, selection, OCR integration
- [translation-pipeline.md](translation-pipeline.md) — lookup order, morphology, sense selection, fallbacks
- [ui-system.md](ui-system.md) — home vs reader layout, panels, theme, responsive behavior, state ownership
- [data-storage.md](data-storage.md) — Dexie tables, caches, settings, backup/restore, vocabulary
- [testing.md](testing.md) — test layout, commands, targeted verification, blocked-execution rule
- [agent-execution-rules.md](agent-execution-rules.md) — agent scope, navigation, verification proportionality, stop and handoff rules

### Specialized — read only for the matching task

- `COST & QUOTA GUARDRAILS.md` (repository root) — binding cost, quota and gateway rules
- [DICTIONARY_PACK.md](DICTIONARY_PACK.md) — dictionary pack schema, versioning, license/attribution
- [DEVICE_QA.md](DEVICE_QA.md) — real-device release gate matrix and smoke script
- [../gateway/README.md](../gateway/README.md) — Worker gateway setup, quotas, staging checklist

### Historical / reference — not current architecture

`LANGUAGE_ENGINES.md`, `local-language-engine.md`, `LOCAL_DICTIONARY_PIPELINE.md`, `PDF_MOBILE_READING.md`,
`PDF_RENDERING_DECISION.md`, `PDF_OCR_STAGE2_REPORT.md`, `PDF_OCR_STAGE3_REPORT.md`, `PDF_OCR_STAGE4_REPORT.md`,
`PDF_STABILITY_REPORT.md` with the `PDF_STABILITY_*.json` measurement captures, `QUALITY_PHASE_4_5.md`,
`READER_UI_UPGRADE.md`, `RELEASE_READINESS.md`.

These describe context, decisions and completed work. Where they disagree with a canonical document or
with the code, the canonical document and the code win.

## Task routing

| If changing | Read first |
| --- | --- |
| PDF rendering, reader modes, page mapping, selection, OCR | [reader.md](reader.md) |
| Dictionary, morphology, sense ranking, translation providers, fallbacks, AI context | [translation-pipeline.md](translation-pipeline.md) |
| Layout, panels, theme, responsive/mobile, component placement | [ui-system.md](ui-system.md) |
| Dexie schema, IndexedDB, caches, settings, backup, library, vocabulary persistence | [data-storage.md](data-storage.md) |
| Tests, verification, release checks | [testing.md](testing.md) |
| Dictionary pack schema, versioning, license/attribution | [DICTIONARY_PACK.md](DICTIONARY_PACK.md) |

Then read only the specific source files listed in that document.
