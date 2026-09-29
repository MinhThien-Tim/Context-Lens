# Task

## ROLE

Implementer

## TASK

Close the Verifier's missing-test finding for `2026-09-29-pdf-text-run-reconstruction`: prove that reconstructed glyph runs respect a detected two-column gutter and existing column order.

## SCOPE

- Add or strengthen one colocated end-to-end test in `src/documents/pdf/extractStructuredPages.test.ts`.
- Use synthetic `PdfSourceTextItem` geometry and the existing `extractStructuredPage` entry point.
- Keep the approved reconstruction task spec as the behavior contract.

## CURRENT STATE / ROOT CAUSE

The present `LEFT RIGHT` test has one row and a gap larger than the page's normal chunk threshold. It proves the large-gap split, but supplies too little repeated body text to activate `rightRegion` gutter detection and does not check column reading order. Existing column-order tests use ordinary TextItems rather than fragmented glyphs.

## IMPLEMENTATION PLAN

1. Build a two-column synthetic page with at least three right-side body baselines and two left-side body baselines of compatible font size and overlapping vertical coverage, meeting the extractor's current gutter evidence.
2. Put separate single-letter TextItems forming a word on each side of one shared baseline. Include nearby body text so the boundary from the left content to the right glyph run is smaller than the normal `max(fontSize * 2.8, pageWidth * .13)` large-gap split, yet crosses the detected gutter. This makes the test exercise the gutter boundary rather than only the large-gap rule.
3. Assert reconstructed words stay separate and that all left-column content precedes right-column content in `plainText`. Assert representative block offsets still slice the corresponding block text.
4. Run the new targeted test while diagnosing, then run `npm.cmd run verify:pdf` once as the authoritative check. If the test exposes a production defect, stop and return a compact failure packet; do not expand this verification-coverage task into a production change.

## TESTS REQUIRED

- Detected gutter evidence is present in the fixture; the cross-gutter gap alone would not trigger the large-gap split.
- Glyph fragments on both sides reconstruct within their own column and do not become one run across the gutter.
- Left column reads before right column even when right-side source items appear first or share a baseline with left content.
- Existing extractor tests remain passing.

## ARCHITECTURAL INVARIANTS

- No changes to extraction logic, persisted PDF shapes, canonical offsets, OCR, either reader mode, navigation, TOC, or text-layer rendering.
- The test must observe `extractStructuredPage` output, not private implementation state.

## OUT OF SCOPE

Production-code changes, new PDF fixtures, browser tests, full-suite verification, and unrelated PDF behavior.

## OPEN QUESTIONS / RISKS

The current gutter heuristic may reject a synthetic layout that appears visually two-column. Tune only fixture geometry to meet documented current evidence; if a valid fixture still reveals a defect, report it for a separate Implementer scope decision.
