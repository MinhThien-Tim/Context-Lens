# Reader Architecture

Scope: reader surfaces, PDF loading, page model, selection, markup, OCR integration.
Related: [ARCHITECTURE.md](ARCHITECTURE.md), [ui-system.md](ui-system.md), [data-storage.md](data-storage.md).

## Three reader surfaces

`src/app/App.tsx` picks exactly one surface from the `reader-viewport` container:

| Condition | Component | Notes |
| --- | --- | --- |
| `kind === 'pdf'` and `viewMode === 'original'` | `PdfViewer` (Original Reader) | PDF.js canvases |
| `kind === 'pdf'` and `viewMode === 'reading'` | `PdfReadingView` (Reading Mode) | Reflowed text pages |
| anything else | `TextReader` | text, markdown, article, docx, epub text |

Text/copy reader (`TextReader`) is the default and the only surface for non-PDF documents.
It renders plain `content` or sanitized `safeHtml` (markdown/article), and reuses
`src/reader/pdf-reading/PdfReadingBlock.tsx` `highlightedText` for offset-based highlights.

## Shared vs separate

**Shared between Original Reader and Reading Mode**

- `DocumentRecord` from `src/db/database.ts` — one record per document, holding `content`,
  `pageOffsets`, `pdfPages`, `data` (original Blob), `highlights`, `pdfTextSources`, `location`.
- `PdfDocumentLocation` from `src/documents/location.ts` — `page`, `pageOffset`, `textOffset`,
  `absoluteOffset`, `scrollY`, `progress`, `viewMode`, optional `textSource`.
- Page model from `src/reader/pdf-reading/structuredPages.ts` (`readingPagesForDocument`),
  including the legacy fallback that synthesizes pages from `pageOffsets`.
- `usePdfScroll` (`src/reader/pdf/usePdfScroll.ts`) — scroll → `(page, pageOffset, scrollY)`.
- Page navigation math from `src/reader/pdf/navigation.ts` (`pdfOffsetForPage`, `pdfPageForOffset`).
- Markup: `MarkupPalette` (tool state) plus `upsertHighlight` / `eraseHighlights`
  from `src/reader/pdf-reading/highlights.ts`; `src/reader/htmlHighlights.ts` for HTML documents.
- The same selection → `runLookup` → `LookupBottomSheet` flow.
- `useDesktop()` gating, `locationPersistence` (`src/reader/pdf/locationPersistence.ts`) for
  debounced writes, and `pdfNavigationToken` to force a re-scroll after a programmatic jump.

**Separate / mode-specific**

| Concern | Original Reader | Reading Mode |
| --- | --- | --- |
| Rendering | `PdfPage.tsx` canvas + PDF.js text layer | `PdfReadingPage.tsx` / `PdfOcrReadingPage.tsx` DOM blocks |
| Page model source | PDF.js live document geometry (`PdfViewer` sizes map) | `PdfStructuredPage` from `db.documents.pdfPages` |
| Selection mapping | `src/reader/pdf/selectionAdapter.ts` + `PdfTextIndex` (PDF.js DOM ↔ canonical offsets) | `src/reader/pdf-reading/readingSelectionAdapter.ts` (DOM ↔ `documentRecord.content`) |
| Zoom | `calculatePdfScale` fit-width / fit-page / custom; desktop control bar, mobile overflow menu | Reader typography only (`--reader-size`, `--reader-leading`, `--reader-font`) |
| OCR display | Never overlays OCR on the original page | Renders OCR text for pages that need it |
| Extra chrome | `PdfModeSwitch`, `PageNavigation` | `PdfReadingNavigation` |
| Page mounting | Current page + one neighbor kept mounted, skipped while OCR is busy (`neighbor` in `PdfViewer`) | All pages in one scroll container |

Mode choice: `pdfViewMode` (desktop) / `pdfMobileViewMode` (mobile) preferences, overridable by
`DocumentRecord.location.viewMode`. Reading Mode is forced back to Original when there is neither
readable PDF text nor selected OCR (`pdfMode` derivation in `App.tsx`), and `PdfModeSwitch` is
disabled under the same condition.

## PDF loading and rendering

- Import: `src/documents/import/fileImport.ts` `importPdf` lazily imports `pdfjs-dist`, sets
  `GlobalWorkerOptions.workerSrc` from `new URL(..., import.meta.url)`, and stores the original
  bytes in `DocumentRecord.data` (50 MB limit). It also builds `pageOffsets`, `pdfPages`
  (via `extractStructuredPage`) and TOC (`detectContents`, `inferPdfHeadings`).
- Open: `src/reader/pdf/usePdfDocument.ts` loads the Blob into a `pdfjs` document and handles
  password-protected files. The original file and the extracted text are both persisted, so
  reading keeps working offline.
- Geometry: `PdfViewer` resolves all page sizes first (`ready` gate) before mounting canvases,
  so restoring a saved location does not allocate canvases at the wrong scale.
- Scrolling: `usePdfScroll` reports page + page fraction; `PdfViewer` converts that into a
  document `absoluteOffset` using `pageOffsets`, then persists a debounced location.
- Password failure, geometry failure, and "still opening" each render a distinct `pdf-state`
  surface in `PdfViewer`.

## Text extraction and index

- Extraction happens **at import**, not at render: `src/documents/pdf/extractStructuredPages.ts`
  produces `PdfStructuredPage { pageNumber, startOffset, endOffset, plainText, extractionQuality, blocks }`.
- `extractionQuality` (`good` / `partial` / `poor`) drives two decisions: whether Reading Mode is
  offered at all (`pdfHasReadableText`) and whether a page is an OCR candidate (`pdfPageNeedsOcr`).
- `PdfTextIndex` (`src/reader/pdf/PdfTextIndex.ts`) maps a DOM `Range` from the PDF.js text layer
  to a canonical offset in `DocumentRecord.content`. It normalizes (NFKC, soft hyphens) **for
  alignment only**, keeps explicit text-node boundaries, and disambiguates repeated phrases with
  prefix/suffix context. Normalization never rewrites stored offsets.
- Sentence context for the lookup pipeline comes from `src/lookup/context.ts`
  (`buildSentenceIndex`, `sentenceContextAt`, `sentenceContextForRange`) via `Intl.Segmenter`,
  with abbreviation and initial merging.

## Selection

All surfaces emit the same `ReaderSelection` (`src/reader/TextReader.tsx`):

```text
{ text, offset, endOffset?, anchor?, type: 'word'|'phrase'|'sentence',
  context: { selectionStart?, previous, current, next, paragraph? }, pdfPage?, ocr? }
```

- Text reader: caret hit-testing (`rangeFromPoint`) plus native drag / long-press selection.
- Original Reader: `selectionAdapter.ts` converts a PDF.js text-layer range through `PdfTextIndex`.
- Reading Mode: `readingSelectionAdapter.ts` maps rendered blocks back to `documentRecord.content`;
  a 160 ms `selectionchange` debounce produces the selection, and the click that follows a
  selection is ignored once (`ignoreClick`).
- Selection inside an OCR page is intentionally not captured by native selection
  (`closest('[data-ocr-page]')` guard in `PdfReadingView`).
- `App.tsx` `makeRequest` builds the `LookupRequest` consumed by `LookupService`.

## Markup and notes

- `MarkupPalette` owns the active tool (`highlight` / `underline` / `eraser`) and color
  (`yellow` / `pink` / `blue`).
- Highlights are stored on `DocumentRecord.highlights` as document offsets. OCR text uses
  page-local offsets and therefore stores `ocrPage` + `ocrLanguage` instead.
- `eraseHighlights` must be called with the OCR page/language when the highlight came from OCR
  (`PdfReadingView.onErase` signature).
- Notes (`src/notes/*`) capture the current `DocumentLocation` plus, for selection notes, the
  quote and sentence. Notes with a `structuredLocation` can jump back; older notes show an
  unavailable-location message instead of inventing a target.

## OCR integration

- Worker: `src/documents/pdf/ocrWorker.ts` (`recognizePdfPage`, `terminateOcrWorker`), lazy
  `tesseract.js` chunk.
- Eligibility: `src/documents/pdf/ocrEligibility.ts` (`ocrCandidate`, `pageHasInk`) — skips pages
  with readable text, already-cached OCR, or no ink.
- Cache: `src/documents/pdf/ocrStore.ts` → `db.pdfOcr`, key
  `documentId:documentHash:page:language:configVersion:renderParameters`
  (`OCR_CONFIG_VERSION`, `OCR_RENDER_PARAMETERS` derived from `OCR_RENDER_PIXELS`).
- Queue: `src/reader/pdf/usePdfOcrQueue.ts`. States `preparing | running | paused | done | error`,
  one job at a time, abort on document change. `preloadFirstTwelve` scans the first 12 pages on
  open; `startCurrent(page)` and `startNextUnprocessed(6)` are explicit user actions.
- Per-page text source choice: `DocumentRecord.pdfTextSources[page] = 'pdf' | 'ocr'`, toggled by
  `PdfModeSwitch.onSource` and honored by `PdfReadingView.selectedOcr`.
- Progress is surfaced through the reader progress bar while the queue is active
  (`activeOcrProgress` in `App.tsx`).
- Out of scope by design: whole-book OCR, selectable OCR overlays on the original PDF page, and
  vision-API fallback.

## Invariants

1. Both PDF modes consume one `DocumentRecord` and emit one `PdfDocumentLocation` shape.
   Mode switching must convert the existing location, not create a second model.
2. `structuredPages.ts` is the single page-model source. Do not re-extract text in Reading Mode.
3. Canonical offsets come from `pageOffsets`; normalization is only for alignment.
4. OCR is additive: separate table, separate key, per-page opt-in, original page retained.
5. `PdfPage` mounting stays bounded (current page + neighbor, paused during OCR).
6. Heavy PDF/OCR libraries stay behind dynamic `import()` and their own Rollup chunks.

## Important files

`src/app/App.tsx`, `src/reader/ReaderShell.tsx`, `src/reader/TextReader.tsx`,
`src/reader/navigation.ts`, `src/reader/readingPosition.ts`, `src/reader/htmlHighlights.ts`,
`src/reader/MarkupPalette.tsx`, `src/reader/pdf/PdfViewer.tsx`, `src/reader/pdf/PdfPage.tsx`,
`src/reader/pdf/PdfTextIndex.ts`, `src/reader/pdf/selectionAdapter.ts`, `src/reader/pdf/navigation.ts`,
`src/reader/pdf/usePdfDocument.ts`, `src/reader/pdf/usePdfScroll.ts`, `src/reader/pdf/usePdfOcrQueue.ts`,
`src/reader/pdf/PdfModeSwitch.tsx`, `src/reader/pdf/locationPersistence.ts`,
`src/reader/pdf-reading/PdfReadingView.tsx`, `src/reader/pdf-reading/PdfReadingPage.tsx`,
`src/reader/pdf-reading/PdfOcrReadingPage.tsx`, `src/reader/pdf-reading/structuredPages.ts`,
`src/reader/pdf-reading/readingSelectionAdapter.ts`, `src/reader/pdf-reading/highlights.ts`,
`src/documents/location.ts`, `src/documents/pdf/extractStructuredPages.ts`,
`src/documents/pdf/detectContents.ts`, `src/documents/pdf/ocrEligibility.ts`,
`src/documents/pdf/ocrStore.ts`, `src/documents/pdf/ocrWorker.ts`,
`src/documents/import/fileImport.ts`, `src/lookup/context.ts`.

