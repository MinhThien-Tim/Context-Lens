# PDF visual TOC separation

## TASK

Separate recognition of a printed PDF Contents page for Reading Mode from creation of navigable `DocumentSection[]`. A recognized entry must remain visible when its destination cannot be verified.

## AFFECTED SUBSYSTEM

PDF extraction/import and Reading Mode (`docs/reader.md`). Role for this artifact: Planner.

## CURRENT STATE / ROOT CAUSE

`detectPdfContents` in `src/documents/pdf/detectContents.ts` recognizes rows, resolves candidate pages, then returns `[]` unless at least two entries have offsets. `importPdf` in `src/documents/import/fileImport.ts` uses that one return value for navigation and has no way to mark printed TOC structure in `pdfPages`. Reading Mode renders only stored `PdfTextBlock` types; old blocks remain ordinary text.

## LIKELY FILES

`src/documents/pdf/types.ts`, `detectContents.ts`, `extractStructuredPages.ts`, `detectContents.test.ts`, `src/documents/import/fileImport.ts`, `src/reader/pdf-reading/PdfReadingPage.tsx`, `PdfReadingBlock.tsx`, relevant Reading Mode tests, `docs/reader.md`. `src/documents/sections.ts` needs no model change.

## ARCHITECTURAL INVARIANTS

Keep one stored `PdfStructuredPage` model and canonical `pageOffsets`/block offsets. Do not alter Original Reader, OCR, `DocumentSection[]`, or page-offset semantics. New optional fields and a new block variant must leave legacy stored blocks renderable without migration. The original PDF stays the cross-check for excerpts.

## IMPLEMENTATION PLAN

1. Introduce a narrow `toc-entry` variant of `PdfTextBlock` with `title`, `printedPageLabel`, optional `resolvedPage`, and optional `level` (1–3). Keep `text`, `startOffset`, and `endOffset` in the existing canonical content coordinate system. For newly tagged entries, preserve the original block text and offset span; do not manufacture text or shift following blocks. A discriminated union is preferable so ordinary block fields stay unchanged. If a recognized row cannot be aligned safely to one extracted block or a contiguous text span, leave that block unchanged and do not assign a fake offset; visual tagging can expand later with separately scoped geometry work.
2. Split `detectPdfContents` into (a) recognition returning ordered printed rows and source-page identity from its current title/row/count/continuation rules, and (b) destination resolution using existing annotation, heading, unique page-label, and agreed-shift evidence. The first phase does not call link or destination APIs and does not apply the two-resolved-entry threshold. A partial PDF excerpt can therefore carry recognized visual rows without assuming its referenced chapters exist in the file.
3. At import, tag safely aligned TOC page blocks with visual entry metadata, independent of whether an outline exists or a printed entry resolves. Do this after page offsets are finalized, preserving `plainText`, `content`, and every block offset. Do not re-extract at render time. Keep recognition limited to the existing early-page source window; do not add new geometry reconstruction in this task.
4. Continue to build normal navigation from verified destinations only. Preserve the existing conservative two-destination acceptance gate for choosing the printed TOC as document navigation. Every exported section with a target must have a validated in-range page and corresponding canonical offset. Entries without verified targets have neither `page` nor `offset`, and the normal heading fallback remains available when printed navigation fails. An outline remains navigation priority; its presence must not suppress visual recognition.
5. Render `toc-entry` as a Reading Mode row with title, printed label, and optional hierarchy styling. An unresolved row is static text with no link, button, click handler, pointer affordance, or fabricated page. A resolved row may use the existing Reading Mode page-jump mechanism only after verifying `resolvedPage`; if adding that interaction would broaden this change, render it as static text and keep navigation in the existing document TOC. Preserve selectable/highlightable canonical text mapping by using the block's original `text` and `data-offset`; any separate display label must not corrupt selection offsets.
6. Legacy `pdfPages` containing only current block types render exactly as before. No migration, backfill, or render-time detection; reimport is needed for visual TOC tags on older PDFs.

## TESTS REQUIRED

- Detector unit: three or more clear printed rows with zero, then one verified destination yield the same recognized visual rows; navigation still returns no printed `DocumentSection[]` under the existing two-target gate. Include a partial-excerpt case with printed page labels beyond the PDF length.
- Detector unit: two verified, in-range destinations retain current printed navigation behavior; out-of-range, preceding-TOC, ambiguous-label, failed-link, and uncorroborated numeric targets cannot become navigable sections or `resolvedPage` values.
- Import/Reading Mode test: a recognized TOC row with no resolved target is stored/rendered as a `toc-entry` where canonical alignment is available, with title and printed label visible and no interactive target. Confirm one verified entry does not make the printed navigation TOC accepted.
- Regression: old stored pages without `toc-entry` render normally; canonical `plainText`, block offsets, and selection/highlight mapping stay stable for tagged pages.
- Authoritative implementation gate: `npm.cmd run verify:pdf`; add `verify:import` if the import contract is directly exercised. Browser E2E only if page-jump interaction is added. Planning/document-only check: inspect the added task spec and diff; application tests **NOT RUN**.

## OUT OF SCOPE

Geometry-based row reconstruction or uncertain text-span alignment; global Reading Mode redesign; changes to Original Reader, OCR, page offsets, or `DocumentSection[]`.

## OPEN QUESTIONS / RISKS

The current recognition rows come from PDF source items while Reading Mode blocks come from a separate extraction grouping. The implementation must define a conservative exact alignment rule and test it with representative source items; recognition alone is insufficient evidence to rewrite or offset a canonical block. If a fixture cannot align, keep its current text rendering and report the gap instead of synthesizing a selectable block.
