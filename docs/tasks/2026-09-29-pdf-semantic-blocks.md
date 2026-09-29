# PDF Reading Mode semantic blocks

## TASK

Conservatively improve native PDF heading classification and mark only high-confidence decorative blocks for subdued Reading Mode presentation. Preserve unusual author text and the PDF Tasks 1–6 baseline.

## AFFECTED SUBSYSTEM

PDF structured extraction and native-text Reading Mode. Final gate: `npm.cmd run verify:pdf` (current reported baseline: typecheck and 101/101 PDF tests PASS).

## CURRENT STATE / ROOT CAUSE

`classifyLine` in `extractStructuredPages.ts` calls a line a heading primarily when `fontSize >= median * 1.28` and text length is at most 100. `Line` retains geometry and a `letterSpaced` flag, but not `fontName`; the classifier has no nearby-line context. `PdfReadingBlock` renders every stored block normally. Page-level `textIntegrity` assesses widespread character mapping damage and feeds OCR eligibility; it cannot decide whether one block is decorative. `groupTextItems` already discards a lone large letter in one narrow case; leave that extraction rule unchanged here.

## LIKELY FILES

- Production: `src/documents/pdf/extractStructuredPages.ts`, `src/documents/pdf/types.ts`, `src/reader/pdf-reading/PdfReadingBlock.tsx`, `src/styles.reader-base.css`.
- Tests: `src/documents/pdf/extractStructuredPages.test.ts`, `src/reader/pdf-reading/PdfReadingPage.test.tsx`.
- Architecture description after implementation: `docs/reader.md` (new block metadata and Reading Mode behavior).
- Inspect `src/reader/pdf-reading/readingSelectionAdapter.ts` and `structuredPages.ts` as contracts; do not change them unless a specific test exposes a requirement.

## ARCHITECTURAL INVARIANTS

Keep source text, block text, block order, `plainText`, separators, and canonical `startOffset`/`endOffset` unchanged. `shiftStructuredPage` must shift all blocks identically. No IndexedDB migration: add only optional `contentRole?: 'semantic' | 'decorative' | 'uncertain'` to `PdfTextBlock`. Absent means normal rendering. Page corruption (`textIntegrity`) remains separate from block decoration; no change to `extractionQuality`, OCR eligibility, OCR text rendering, TOC resolution, Original Reader, or PDF.js item extraction. `toc-entry` is never decorative. No dictionary, WordNet, or network decision.

## IMPLEMENTATION PLAN

1. Retain each reconstructed line's dominant `fontName` when unambiguous, plus existing size, x/y, width, column and tracking data. Derive body style from substantial paragraph-like lines on the same page; if no reliable body sample exists, use only the strongest geometry. Do not change glyph reconstruction or line text.
2. Replace the single size threshold with a small, named evidence score evaluated before block grouping, using page width and adjacent lines. Require at least two independent cues, with one being typography (size at least 1.28× body median, or a bold/alternate font reliably distinct from body) and one being layout (centered within a modest tolerance, clear vertical separation, or a nearby chapter number/title pair). Short length, uppercase, small caps, page-top position, and tracking can support but cannot suffice. Reject sentence-like prose and preserve quote/dialogue/list/footnote precedence; cap candidate length and line count. Keep level assignment size-based. Make grouping use the same heading decision so same-size headings do not merge into body paragraphs. A repeated style may support classification only when safely established; do not add cross-page state. Treat raw font IDs without a reliable body comparison as weak evidence; italic alone is weak.
3. After blocks are formed, classify native blocks using their group geometry and neighboring groups. Default to `semantic` or leave the field absent; use `uncertain` when evidence is mixed, and render it normally. Set `decorative` only for an isolated short block with at least two independent strong layout/style signals (for example abnormal glyph composition plus out-of-column publisher/title-page placement and a style discontinuity). Require separation from running prose; do not mark any block containing a sentence, a chapter/section label, a `toc-entry`, or a token repeated in contextual prose. Unknown spelling, proper names, codes, digits, symbols, formulas, all caps, and foreign text carry no negative lexical weight. `cssao` qualifies only in a fixture with strong surrounding layout evidence. No page-level `textIntegrity` input to this decision.
4. Render `decorative` as a subdued, still-visible and selectable block with its existing `id`, `data-offset`, text and highlight markup. This preserves DOM selection and highlight mapping and lets readers inspect possible false positives. `semantic`, `uncertain`, and legacy blocks render identically to today. Use one narrow CSS class; do not alter OCR rendering or hide via `display:none`, `visibility:hidden`, or `aria-hidden`.

## TESTS REQUIRED

In `extractStructuredPages.test.ts`, add fixtures for: existing large heading; same-size bold/alternate font plus whitespace; centered title; tracked title; separate `CHAPTER 4` and `THE MACHINE`; short prose, all-caps prose, quote and dialogue remaining non-headings. Add decorative ornament and publisher/logo artifact with strong geometry, plus negative cases for an unknown name, `QXZ-17` repeated in prose, `Kx7R` once within prose, formula/technical notation, and a standalone legitimate section label. Verify ordinary prose around one decorative block stays semantic and page `textIntegrity`/quality do not change from the same source text. Assert exact `plainText`, every block substring at its offsets, and shifted offsets after `shiftStructuredPage`. Preserve existing Task 3 tracked-text and Task 4 joining cases.

In `PdfReadingPage.test.tsx`, render decorative, uncertain, semantic, legacy and `toc-entry` blocks. Assert only decorative has the subdued class; every block remains visible/selectable and keeps its `data-offset`; a highlight and a DOM selection after a decorative block still resolve to canonical offsets. `toc-entry` remains fully visible even if short/unusual or supplied with conflicting decorative metadata. Confirm OCR page behavior remains separate through existing tests. Use existing TOC tests as the Task 5–6 regression gate.

Run `npm.cmd run verify:pdf` once as authoritative verification after implementation. No browser E2E unless a concrete browser-only selection/style risk remains after focused DOM tests.

## OUT OF SCOPE

PDF.js extraction, Task 3 reconstruction, Task 4 repair, TOC recognition/destinations, page integrity or OCR policy, Original Reader, canonical offsets, selection logic, lookup, navigation, network, and general document AI. Do not remove suspicious text from `plainText`.

## OPEN QUESTIONS / RISKS

Font IDs can be opaque and page layouts sparse. If body style or layout cannot be established confidently, leave the block visible and unmarked. Test fixtures must include enough body lines to establish a real median; a title-only page cannot prove an alternate font is a heading. The prior large-single-letter extraction discard is an existing limitation outside this task; the section-label regression should use a retained source item or a constructed block.
