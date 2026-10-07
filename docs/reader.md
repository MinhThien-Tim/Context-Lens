# Reader Architecture

Scope: reader surfaces, PDF loading, page model, selection, markup, OCR integration.
Related: [ARCHITECTURE.md](ARCHITECTURE.md), [ui-system.md](ui-system.md), [data-storage.md](data-storage.md), [reader-chrome.md](reader-chrome.md), [reader-behavior-contract.md](reader-behavior-contract.md).

> **Status.** Chrome passages follow [reader-behavior-contract.md](reader-behavior-contract.md). The code catches up in P2b; see [reader-redesign-phases.md](reader-redesign-phases.md).
>
> Passages tagged **[P2b]**, **[P2c]**, **[P3]**, **[P4]** or **[Z2]** describe the approved target and are not yet true in code.

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
- The same selection → `runLookup` → `LookupBottomSheet` flow: Quick first, explicit Full expansion; presentation does not rerun lookup.
- `useDesktop()` gating, `locationPersistence` (`src/reader/pdf/locationPersistence.ts`) for
  debounced writes, and `pdfNavigationToken` to force a re-scroll after a programmatic jump.

**Separate / mode-specific**

| Concern | Original Reader | Reading Mode |
| --- | --- | --- |
| Rendering | `PdfPage.tsx` canvas + PDF.js text layer | `PdfReadingPage.tsx` / `PdfOcrReadingPage.tsx` DOM blocks |
| Page model source | PDF.js live document geometry (`PdfViewer` sizes map) | `PdfStructuredPage` from `db.documents.pdfPages` |
| Selection mapping | `src/reader/pdf/selectionAdapter.ts` + `PdfTextIndex` (PDF.js DOM ↔ canonical offsets) | `src/reader/pdf-reading/readingSelectionAdapter.ts` (DOM ↔ `documentRecord.content`) |
| Zoom | **[P2b]** `calculatePdfScale` natural / fit-width / fit-page / custom; desktop Header stepper; mobile has no control until pinch **[Z2]** | Reader typography only (`--reader-size`, `--reader-leading`, `--reader-font`) |
| OCR display | Never overlays OCR on the original page | Renders OCR text for pages that need it |
| Extra chrome | **[P2b]** Header Text/PDF + desktop zoom, Contents, markup tools, Aa; Footer page number and progress; Document via More | **[P2b]** Header Text/PDF; reading typography via Theme |
| Page mounting | Dominant viewport page + immediate previous/next pages, at most three canvases; neighbors skipped while OCR is busy | All pages in one scroll container |

**[P2b]** Both PDF modes share one chrome, specified in [reader-chrome.md](reader-chrome.md) and governed by [reader-behavior-contract.md](reader-behavior-contract.md). Header and Footer overlay the reading surface and reserve no space; static padding sits inside the scroll container, so chrome never shifts content or scroll mapping. The single Header `Text | PDF` control switches mode (stored values stay `reading` / `original`). Desktop zoom is a direct Header stepper; mobile has no zoom control. At ≤1023px quiet chrome hides Header and Footer together after accumulated downward travel and reveals them after accumulated upward travel, at the content top, on focus entering chrome, or through the reveal-only `Aa ···` control; taps never change chrome state. Open overlays (More, selection actions, Markup palette) block quieting. **[P2c]** Reading Mode keeps a stable full-height scroll surface with bottom padding so the last page stays reachable above the Footer.

Mode choice: `pdfViewMode` (desktop) / `pdfMobileViewMode` (mobile) preferences, overridable by
`DocumentRecord.location.viewMode`. Reading Mode is forced back to Original when there is neither
readable PDF text nor selected OCR (`pdfMode` derivation in `App.tsx`), and `PdfModeSwitch` is
disabled under the same condition.

## PDF loading and rendering

- Import: `src/documents/import/fileImport.ts` `importPdf` lazily imports `pdfjs-dist`, sets
  `GlobalWorkerOptions.workerSrc` from `new URL(..., import.meta.url)`, and stores the original
  bytes in `DocumentRecord.data` (50 MB limit). It also builds `pageOffsets`, `pdfPages`
  (via `extractStructuredPage`) and TOC (`detectContents`, `inferPdfHeadings`).
  Printed Contents recognition clusters native text by visual baseline and column, then
  pairs optional entry numbers, titles, and aligned terminal page labels; it also joins
  short wrapped titles and infers indentation within each column. Recognition is separate from destination resolution. Recognized rows
  are tagged as `toc-entry` blocks only when a unique whole extracted block matches the
  source row; its original text and offsets remain canonical. Reading Mode renders tagged
  rows as static text, including unresolved rows. Printed navigation still requires two
  verified destinations; an outline retains navigation priority. Older stored `pdfPages`
  have no tags and render as before until reimported.
- Open: `src/reader/pdf/usePdfDocument.ts` loads the Blob into a `pdfjs` document and handles
  password-protected files. The original file and the extracted text are both persisted, so
  reading keeps working offline.
- Geometry: `PdfViewer` resolves all page sizes first (`ready` gate) before mounting canvases,
  so restoring a saved location does not allocate canvases at the wrong scale.
- Render lifecycle: a mounted `PdfPage` keeps its instance and its committed canvas frame across a
  role or `renderPixels` transition whenever the computed backing geometry is unchanged. The page
  resolves a *frame target* (page, viewport, backing `width`/`height` from `canvasBackingSize`, and
  the index inputs); an identical target reuses the previous object, so the render effect is not torn
  down and the committed bitmap, page lease, text layer and saved-highlight overlay all survive
  without a second `page.render()`.
  A genuine scale or geometry change is different: the mounted canvas keeps showing the previous
  frame while the replacement renders into a bounded transient canvas sized from the same
  `canvasBackingSize(...)` result. Once the replacement completes, the mounted canvas is resized and
  the finished bitmap is drawn in a single commit, then the transient buffer is released. The buffer
  is transient and released on commit, error, cancellation and unmount; it never widens the mounted
  canvas bound or any configured pixel budget, and its peak is bounded by the same
  `renderBudget.ts` limits. The `1x1` memory release belongs to the `PdfPage` unmount, not to a
  lifecycle transition.
- Desktop default zoom is `natural`: a page-width-derived scale targeting 932 CSS px,
  clamped to the viewport width with 64 px of horizontal gutters. Explicit desktop zoom
  mode and custom scale persist in reader preferences; stored legacy `fit-page` choices
  remain `fit-page`. Zoom buttons step from the displayed scale of the visible page,
  including fit modes. The first desktop Zoom In from a fitted page reaches 125% of fit width,
  exposing horizontal overflow; subsequent steps change by 25% of fit width. Desktop custom scale
  is bounded to 0.1–6. The mobile custom scale (0.1–3) and its session-local stepper are legacy **[P2b: deleted]**; until pinch ships **[Z2]** mobile PDF renders at fit-width. Margin cropping is not implemented.
- Scrolling: `usePdfScroll` reports the page crossing the viewport top + its page fraction;
  `PdfViewer` converts that into a document `absoluteOffset` using `pageOffsets`, then persists
  a debounced location. Visibility hysteresis is reported separately. Original PDF canvas mounting
  and its high-resolution budget follow the page with the greatest viewport overlap, independently
  of location persistence and hysteresis. Narrow pages stay centered; zoomed
  pages can scroll to both horizontal edges, and zoom preserves the viewport's relative
  horizontal point of interest.
- Password failure, geometry failure, and "still opening" each render a distinct `pdf-state`
  surface in `PdfViewer`.

## Text extraction and index

- Extraction happens **at import**, not at render: `src/documents/pdf/extractStructuredPages.ts`
  produces `PdfStructuredPage { pageNumber, startOffset, endOffset, plainText, extractionQuality, blocks }`.
- Native PDF heading classification uses page-local typography together with layout separation or
  centering. Optional block `contentRole` marks only strongly isolated decorative fragments;
  unknown words, codes, and unusual names are not judged through dictionary validity.
  This is separate from page-level `textIntegrity`. Decorative text stays in canonical
  `plainText` with unchanged offsets and remains visible, selectable, and subdued in Reading Mode.
  Legacy blocks without the field render normally.
- Within an existing row chunk, extraction combines runs of at least four separate letter items
  only when baseline, font, direction, glyph widths and tracking agree. Explicit spaces, line
  endings, large gaps and detected gutters remain boundaries; ambiguous fragments retain their
  source spacing.
- Two-column ordering requires repeated body-sized text regions with comparable font sizes and
  overlapping vertical coverage (at least three right-edge baselines and two left-region baselines).
  A confirmed gutter splits rows before joining. Text crossing the gutter remains in visual order
  as a separator; each intervening band reads left column then right column. Without that evidence,
  extraction retains top-to-bottom, then left-to-right order. Sparse columns, fragmented items,
  asymmetric layouts and unmarked inset quotations remain limitations; tables/figures are not parsed.
- Line joining keeps an indented paragraph boundary when the preceding line is short and ends
  a sentence. Explicit soft hyphens are removed; hard hyphens remain because lexical compounds
  and discretionary breaks cannot reliably be distinguished from geometry. A narrow set of
  unmarked word splits is repaired only within a paragraph when repeated lines establish the
  same right edge and the next line has compatible alignment, font, and spacing. Unknown or
  ambiguous splits retain the boundary space.
  Header/footer text remains in canonical content until repetition can be established across pages.
  Legacy page fallback preserves whitespace so DOM block offsets still address the stored content.
- `extractionQuality` (`good` / `partial` / `poor`) determines whether Reading Mode is offered
  (`pdfHasReadableText`) and contributes to OCR eligibility and default page-source choice.
- Newly extracted pages also record optional `textIntegrity` (`valid` / `suspect` / `corrupt`), a
  conservative character-mapping assessment separate from text amount and layout quality. It is
  used for OCR eligibility and default page-source choice only when `corrupt`. Older stored pages
  have no integrity value (unassessed), retain the quality-based behavior, and need no migration;
  reimport assesses them.
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
- PDF Reader: `selectionAdapter.ts` converts a PDF.js text-layer range through `PdfTextIndex`. On mobile, **[P2b]** **Click lookup** is a session-local More toggle (default on; MORE-6). While it is on, a short, stationary single-finger tap on an actual text glyph maps the word through the same index and opens Quick directly; with it off, native selection remains and tap lookup is disabled. Scroll, long press, multi-touch, links and empty page space never trigger tap lookup. Chrome transitions never move the PDF viewport during contact (chrome overlays a full-height viewport, CHR-1).
- On desktop, double-clicking a single word in the Original text layer keeps native selection
  and opens Quick through the same indexed lookup handler. Phrase and drag selections keep
  the action bar for Define, Highlight and Note when no markup tool is active. With Highlight,
  Pen or Eraser active, completing a text selection applies that tool immediately. The action
  bar exposes exactly Define, Highlight, Note and Close — no Copy, no More disclosure.
- Reading Mode: `readingSelectionAdapter.ts` maps rendered blocks back to `documentRecord.content`;
  a 160 ms `selectionchange` debounce produces the selection, and the click that follows a
  selection is ignored once (`ignoreClick`). Define consumes that selection and clears its native
  range and click suppression so the first word tap after closing lookup remains usable.
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
- Eligibility: `src/documents/pdf/ocrEligibility.ts` (`ocrCandidate`, `pageHasInk`) — admits
  poor extracted text with image evidence or explicitly corrupt extracted text, even when long
  or painted as vector glyphs. A cached result for the same page, language and hash is skipped;
  every recognition path checks for visible ink first. Valid and suspect partial pages do not
  gain eligibility.
- Cache: `src/documents/pdf/ocrStore.ts` → `db.pdfOcr`, key
  `documentId:documentHash:page:language:configVersion:renderParameters`.
  `OCR_CONFIG_VERSION` is `2`. `OCR_RENDER_PIXELS` defaults to `3_000_000` and accepts only
  `1_500_000`, `2_000_000` or `3_000_000` from `VITE_OCR_RASTER_PIXELS`;
  `OCR_RENDER_PARAMETERS` is `scale<=2.5;pixels<=<n>;edge<=4096;rotation=pdf`, so the OCR raster
  is fixed by the document and does not follow display zoom. Any change here changes the cache key.
- Worker lifetime: `src/documents/pdf/ocrWorker.ts` terminates the worker on cancel, on document
  close, and after 60 s idle. The queue also holds a monotonic generation counter so an aborted or
  superseded run can never publish a stale status or result.
- Storage guard: the queue reads `navigator.storage.estimate()` before processing and errors out when
  less than 1,000,000 bytes are free. A `QuotaExceededError` while saving surfaces as an error; a
  partially recognized page is never persisted.
- Queue: `src/reader/pdf/usePdfOcrQueue.ts`. States `preparing | running | paused | done | error`,
  one job at a time, abort on document change. `preloadFirstTwelve` scans at most the first 12 pages
  on open but stops collecting candidates once **6** are gathered (`pending.length >= 6`), and skips
  pages that already carry PDF text; `App.tsx` only triggers it when a page in the first 12 has empty
  `plainText` and passes `ocrCandidate`. The 12-page explicit window (`OCR_AUTO_BATCH_SIZE`) is the
  intended contract behavior; the hard-coded 6-candidate cap is the known U6 defect deferred to the
  PDF/OCR controls phase.
- Explicit runs auto-continue. `startCurrent(page)` and `startNextUnprocessed(fromPage)` are explicit
  user actions that walk the document once in consecutive `OCR_AUTO_BATCH_SIZE` (12) page windows
  until the end, so the user never has to click again between batches. `startCurrent(page)` OCRs the
  selected page first, then continues from `page + 1` and never revisits an earlier page;
  `startNextUnprocessed(fromPage)` starts at the reading page and may include nonempty corrupt pages.
  A page whose OCR text is empty (ink-free or unreadable) is skipped without saving a `PdfOcrRecord`
  and never fails or retries the run. `completed/total` counts the whole run, so a later window does
  not reset progress. A cached result on a corrupt page becomes the default Reading Mode source
  unless `pdfTextSources` explicitly selects PDF text; the original PDF text and per-page source
  switch remain available.
- Per-page text source choice: `DocumentRecord.pdfTextSources[page] = 'pdf' | 'ocr'`, toggled by
  `PdfModeSwitch.onSource` and honored by `PdfReadingView.selectedOcr`.
- **[P4]** While an OCR run is active (`preparing | running | paused`) the Footer shows a non-interactive status beside the page number and progress line (OCR-3; no percentage). It is hidden on terminal success, terminal error, cancel and clear. Until P4 the queue, source and run actions live in Document (via More); from **[P4]** they live in the OCR More item.
- Out of scope by design: unattended whole-book OCR. The first 12 candidate pages may be preloaded locally; a full OCR run starts only from an explicit user action and then continues through the remaining 12-page windows automatically. Also out of scope: selectable OCR overlays on the original PDF page and vision-API fallback.
- Delivery: worker, core and `eng` / `vie` trained data are served from the same origin and are
  requested only when a queue run starts — a PDF with good text never downloads them. `vie` is
  fetched only for the English + Vietnamese choice. `vite.config.ts` `globIgnores` keeps `**/ocr/**`
  and the `ocr-reader` chunk out of precache, while `runtimeCaching` serves `/ocr/` with `CacheFirst`
  (30 days, 12 entries). Tesseract.js / tesseract.js-core are Apache-2.0 and the trained data comes
  from `@tesseract.js-data/eng` and `@tesseract.js-data/vie`, Apache-2.0, with the licence copy at
  `public/ocr/LICENSE.txt`.
- Accuracy limits: recognition can still be wrong for ligatures or disconnected type, faint scans,
  two-column layouts and Vietnamese diacritics (for example `học` returning `hoc`). The Original
  page always remains openable as the cross-check reference. Peak memory, thermal and battery cost on
  physical phones is still unmeasured, so explicit runs advance one 12-page window at a time and the
    user can pause or cancel between pages.

## Invariants

1. Both PDF modes consume one `DocumentRecord` and emit one `PdfDocumentLocation` shape.
   Mode switching must convert the existing location, not create a second model.
2. `structuredPages.ts` is the single page-model source. Do not re-extract text in Reading Mode.
3. Canonical offsets come from `pageOffsets`; normalization is only for alignment.
4. OCR is additive: separate table, separate key, per-page opt-in, original page retained.
5. `PdfPage` mounting stays bounded (visible page + immediate previous/next, at most three;
   neighbors paused during OCR).
6. Heavy PDF/OCR libraries stay behind dynamic `import()` and their own Rollup chunks.
7. **No scroll-observer / navigation feedback loop.** Both PDF modes read position from the shared
   `usePdfScroll` controller (passive, RAF-coalesced, complete slot geometry, boundary hysteresis)
   and jump only through an explicit `pdfNavigationToken`. Never write `location.page` from a
   visibility observer that a `scrollIntoView` effect then reacts to; only the intended scroll
   container may move.
8. **Canvas rendering stays bounded.** `renderBudget.ts` caps the visible canvas at 20,000,000
   backing pixels and each adjacent page at 2,000,000, with an 8192-pixel edge cap and device pixel
   ratio capped at 3. At most three canvas pages stay mounted, and `pageLease` cancellation must
   stop a stale render from cleaning up a page a newer render owns. A role or budget transition that
   computes identical backing geometry must not tear down or re-render a mounted page; a genuine
   geometry change renders into one bounded transient buffer and commits it atomically, so the
   committed frame is never cleared to make room for a replacement.
9. **The text layer is per-render and generational.** Each `PdfPage` render owns its own PDF.js
   text-layer DOM generation; a late completion must not publish a new `PdfTextIndex` or annotations
   over a newer one. The stylesheet must supply the TextLayer font-height, scale-X, rotation,
   minimum-font-size and scale-round custom properties so selectable spans stay aligned with the
   canvas, including PDF rotation and user units.
10. **Location writes are debounced and restore from the database.** `createLocationPersistence`
    deduplicates by location signature, debounces 350 ms, and flushes on close, page hide, and
    unmount. Closing a PDF persists the PDF location, never the text reader's window position, and
    reopening reads the latest `DocumentRecord` from IndexedDB instead of the stale library entry.
11. **Shift+arrow selection is not navigation.** `src/reader/pdf/navigation.ts` must not treat
    modifier-based selection as a page jump. Notes record a canonical offset plus a within-page
    fraction.
12. **Chrome is an overlay. [P2b]** Header and Footer never reserve space or resize the reading viewport; static padding inside the scroll container keeps the first and last lines clear (CHR-1, GEO-4, GEO-6). Visibility changes only through the paths in INP-1; tap never toggles it.
13. **Switching documents is a close-then-open lifecycle. [P2c]** A document change flushes the previous location (invariant 10), aborts the OCR queue and lookup, resets panel state and runs the open lifecycle again (GEO-3). The File switcher adds no second open path.

## Current implementation — PDF scale pipeline

Audit of `8ec43ca`; Z1 verifies. This describes current code, not target behavior. Scale is computed in `PdfViewer` (`calculatePdfScale`, desktop stepper state and legacy mobile zoom) and passed to `PdfPage`, which derives the PDF.js viewport and `canvasBackingSize`, owns render tasks and cancellation, the per-render text layer and highlight overlay. `usePdfScroll` maps scroll geometry to page, page offset and location. Any scale change (the stepper now, pinch in Z2) must keep the bitmap, text layer, overlay geometry, page slot sizes and scroll location consistent. Z1 verifies this and measures render cost; no performance figure is known from source inspection.

## Important files

`src/app/App.tsx`, `src/reader/ReaderShell.tsx`, `src/reader/TextReader.tsx`,
`src/reader/navigation.ts`, `src/reader/readingPosition.ts`, `src/reader/htmlHighlights.ts`,
`src/reader/MarkupPalette.tsx`, `src/reader/pdf/PdfViewer.tsx`, `src/reader/pdf/PdfPage.tsx`,
`src/reader/pdf/PdfTextIndex.ts`, `src/reader/pdf/selectionAdapter.ts`, `src/reader/pdf/navigation.ts`,
`src/reader/pdf/renderBudget.ts`, `src/reader/pdf/pageLease.ts`, `src/utils/debounce.ts`,
`src/reader/pdf/usePdfDocument.ts`, `src/reader/pdf/usePdfScroll.ts`, `src/reader/pdf/usePdfOcrQueue.ts`,
`src/reader/pdf/PdfModeSwitch.tsx`, `src/reader/pdf/locationPersistence.ts`,
`src/reader/pdf-reading/PdfReadingView.tsx`, `src/reader/pdf-reading/PdfReadingPage.tsx`,
`src/reader/pdf-reading/PdfOcrReadingPage.tsx`, `src/reader/pdf-reading/structuredPages.ts`,
`src/reader/pdf-reading/readingSelectionAdapter.ts`, `src/reader/pdf-reading/highlights.ts`,
`src/documents/location.ts`, `src/documents/pdf/extractStructuredPages.ts`,
`src/documents/pdf/detectContents.ts`, `src/documents/pdf/ocrEligibility.ts`,
`src/documents/pdf/ocrStore.ts`, `src/documents/pdf/ocrWorker.ts`,
`src/documents/import/fileImport.ts`, `src/lookup/context.ts`.
