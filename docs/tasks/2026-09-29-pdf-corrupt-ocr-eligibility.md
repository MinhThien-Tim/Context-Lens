# OCR eligibility for corrupt PDF text

## TASK

Let a page with `textIntegrity: 'corrupt'` use the existing OCR fallback even when PDF.js extracted substantial text. Preserve the native page, canonical text, and per-page source choice.

## AFFECTED SUBSYSTEM

PDF OCR preflight, queue candidate filtering, and Reading Mode source selection. Follow `docs/ARCHITECTURE.md` and `docs/reader.md`.

## CURRENT STATE / ROOT CAUSE

`ocrCandidate` accepts structured pages only when `extractionQuality === 'poor'` and `hasImage !== false`. Corrupt pages can be `good`/`partial` and can contain painted vector glyphs without an image operator. `findNextOcrCandidates` independently skips every nonempty `plainText`. A cached OCR result for a corrupt `good` page is not selected by default because `pdfPageNeedsOcr` ignores integrity. The import-time `textIntegrity` field is optional and currently diagnostic only.

## LIKELY FILES

- `src/documents/pdf/ocrEligibility.ts`, `src/reader/pdf/usePdfOcrQueue.ts`, `src/reader/pdf-reading/structuredPages.ts`.
- Colocated tests: `src/documents/pdf/ocrEligibility.test.ts`, `src/reader/pdf/usePdfOcrQueue.test.tsx`, and relevant Reading Mode source-selection tests if present; add a narrow test beside `structuredPages.ts` if needed.
- `docs/reader.md`, because OCR eligibility and source-choice contracts change.
- `src/documents/pdf/types.ts` is read-only: the optional integrity type already exists. `src/app/App.tsx` preload guard remains unchanged.

## ARCHITECTURAL INVARIANTS

One `DocumentRecord` and page model serve both PDF modes. Native `plainText`, blocks, `pageOffsets`, selection offsets, and original rendering remain intact. OCR stays in its separate existing cache and is chosen per page; explicit `pdf`/`ocr` choices remain authoritative. Keep lazy loading, cache key/version, queue batch size, and automatic preload behavior unchanged.

## IMPLEMENTATION PLAN

1. In `ocrCandidate`, consider a page eligible when `textIntegrity === 'corrupt'` **or** its existing poor-quality condition holds. The `hasImage === false` metadata veto continues for ordinary poor pages, but cannot veto a corrupt page: vector glyphs can be visible without an image operator. Continue rejecting matching cached page/language/hash records. Do not treat `suspect`, `valid`, or a missing integrity field as corrupt.
2. Remove the nonempty-text veto from the explicit `OCR next` candidate scan; let `ocrCandidate` decide. Keep `pageHasInk()` before any queued recognition. Ensure the explicit current-page action also checks `pageHasInk()` before recognition, so a visually blank page is never OCR'd even if metadata says corrupt. Do not extend the automatic first-twelve preload to corrupt pages; its empty-text guards in `App.tsx` and the queue stay in place. Keep its six-page limit and the explicit `OCR next 6 pages` behavior.
3. Make `pdfPageNeedsOcr` return true for `textIntegrity === 'corrupt'`, so a cached OCR result is the default Reading Mode source on that page. Preserve the existing quality/length behavior for all other pages, including valid partial and legacy pages. Keep explicit `pdfTextSources[page]` overrides and the native-source switch unchanged. Do not mutate the original PDF text or OCR record.
4. Update `docs/reader.md` to state that integrity affects OCR eligibility and default source selection, with automatic preload still limited to empty-text pages.

## REQUIRED BEHAVIOR

| Page state | OCR preflight and source behavior |
| --- | --- |
| Valid good text | Ineligible; native PDF text remains the source. |
| Valid partial text | No new OCR eligibility. Preserve current source-selection behavior if an OCR record already exists. |
| Corrupt text of any length/quality | Eligible if not already cached for the same page/language/hash; actual OCR requires visible ink. If OCR exists, prefer it in Reading Mode unless the user selected PDF text. |
| Empty/poor text | Existing metadata gate applies (`hasImage === false` rejects); ink check before recognition; existing source behavior remains. |
| Blank visual page | `pageHasInk() === false` prevents recognition, including explicit current-page OCR. |
| Legacy page without `textIntegrity` | Use quality/metadata/ink rules as before; absence means unassessed, not corrupt. |

## TESTS REQUIRED

- A long `good` page with `textIntegrity: 'corrupt'` and `hasImage: false` passes preflight and is selected by explicit `OCR next` only when `pageHasInk()` is true. A blank visual version is skipped. Test the explicit current-page ink guard.
- A normal `partial` page, including one with `textIntegrity: 'valid'` or `'suspect'`, does not become an OCR candidate; a valid `good` page remains ineligible.
- Existing empty/poor, blank-image, cached-record, language/hash, six-page ordering and preload limits remain covered. Preload does not start because a corrupt page has nonempty text.
- With cached OCR on a corrupt `good` page, Reading Mode defaults to OCR; explicit PDF selection wins and can be reversed. Valid partial and legacy source behavior stays as it was. No mutation of `plainText`, blocks, or canonical offsets.
- `npm.cmd run verify:pdf` on Windows PowerShell is the primary final check. Targeted tests may run first for diagnosis. Browser E2E and `verify:full` are not required unless implementation actually crosses a documented shared contract.

## OUT OF SCOPE

OCR recognition engine/configuration, cache keys or stored records, import-time integrity scoring, text reconstruction, TOC, Original Reader, lookup/Quick Card, PDF canvas, navigation, selection, highlights, zoom/pan, and canonical offsets. No automatic OCR for nonempty corrupt pages or all partial pages; no network calls.
