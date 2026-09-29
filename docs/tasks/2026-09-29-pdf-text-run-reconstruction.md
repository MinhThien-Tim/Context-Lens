# Task

## ROLE

Implementer

## TASK

Reconstruct visually continuous, letter-fragmented PDF text runs before normal line and block grouping. A sequence such as separate `[C] [O] [N] [T] [E] [N] [T] [S]` TextItems should yield `CONTENTS` when its geometry supports one tracked word.

## SCOPE

- PDF extraction at import: `src/documents/pdf/extractStructuredPages.ts` and its colocated tests.
- Use a small pure helper, preferably `reconstructTextRuns(sourceItems, geometry)`, before `groupTextItems` joins row chunks. Keep the existing line, column, block, offset and integrity pipeline.
- Change `src/documents/pdf/types.ts` only if a narrow internal type is necessary; do not alter persisted page or block contracts.

## CURRENT STATE / ROOT CAUSE

`groupTextItems` removes spaces in short tracked strings when the letters are already inside one item. For separate TextItems, its row chunk loop inserts a space whenever the horizontal gap exceeds `max(1.5, averageChar * .35)`. It has no multi-item run evidence, so ordinary tracked headings can become `C O N T E N T S`. The current single-letter suppression also drops an isolated large letter; preserve that behavior outside confidently reconstructed runs.

## IMPLEMENTATION PLAN

1. Build candidate runs from adjacent, nonblank, single-letter/glyph-like items on a common baseline using source geometry. Require a minimum run length that excludes `A / B / C`; use consistent left-to-right order, compatible font size and `fontName` when present, plausible widths, and small, reasonably consistent inter-glyph gaps relative to glyph width/font size. Reject explicit whitespace, `hasEOL` boundaries, overlaps/reversal, baseline jumps, and large gaps. Keep thresholds conservative and documented in code.
2. Keep the page's existing column evidence and row/chunk boundaries authoritative. A candidate must never bridge a detected gutter or the existing large-gap chunk split. If evidence is ambiguous, leave the source items alone. Avoid global concatenation or lexical/dictionary checks.
3. Represent only accepted runs as combined text plus a bounding width/position for downstream grouping, without mutating inputs. Ensure downstream spacing against neighboring normal words still uses the run's measured right edge and normal gap logic. Do not change `joinLines`, block classification, or canonical offset arithmetic.
4. If a helper needs column information, pass only the minimal geometry/boundary context from `groupTextItems`; do not duplicate its ordering algorithm or refactor unrelated extraction code.

## TESTS REQUIRED

In `src/documents/pdf/extractStructuredPages.test.ts`, add direct helper tests if exported and end-to-end extraction assertions for:

1. Multiple same-baseline single-letter TextItems with tracking become one word, including a heading-like run.
2. Adjacent ordinary words with their normal gap remain separate, including spacing before/after a reconstructed run.
3. Separate `A`, `B`, `C` labels remain separate; include sufficiently wide and/or inconsistent gaps to exercise ambiguity rejection.
4. Two-column glyph fragments on the same baseline remain separated by the gutter and retain existing column order.
5. Font-name or material font-size changes, baseline changes, `hasEOL`, and reversed order prevent unsafe merges.
6. Existing explicit soft-hyphen joining, hard-hyphen retention, paragraph/line extraction, offsets, and current real-column fixture remain unchanged.

Primary verification: `npm.cmd run verify:pdf` on Windows PowerShell (`npm run verify:pdf` per repo command table). No browser E2E required for this extractor-only change.

## ARCHITECTURAL INVARIANTS

- Extraction remains local at import. `plainText` and block offsets remain canonical for both reader modes and `PdfTextIndex` alignment.
- Original PDF canvas/text-layer rendering and OCR stay separate and unchanged.
- Existing two-column ordering and conservative layout fallback remain authoritative.
- Update `docs/reader.md` only if the extraction control flow or documented limitations materially change.

## CONSTRAINTS

No global single-character concatenation, dictionary guessing, normal-word spacing change, label collapse, cross-column joining, OCR/TOC/navigation/Reading Mode UI/Original text-layer change, line-break dehyphenation, or broad extractor refactor.

## OPEN QUESTIONS / RISKS

- Three or more tightly set independent labels can be geometrically indistinguishable from a tracked word. Prefer preserving them unless run length and gap consistency provide stronger evidence; add an explicit conservative test.
- `fontName` is optional in `PdfSourceTextItem`; absence should not alone block a geometrically sound run, while conflicting present names should block it.
