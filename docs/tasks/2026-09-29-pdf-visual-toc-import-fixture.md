# PDF visual TOC import test — incoherent fixture label column

Role for this artifact: Planner output. Architecture route: `docs/reader.md` (PDF extraction / printed TOC), `docs/ARCHITECTURE.md` → "PDF extraction / index", "Homepage / import".

## TASK

Make the standalone-failing test pass:

`src/documents/import/pdfVisualTocImport.test.tsx` → `keeps imported printed rows visible without accepting fewer than two navigation targets`
currently fails with `expected [] to deeply equal [ …(3) ]` at line 48.

Root cause is a **test fixture coordinate error**, not a product defect (see ROOT CAUSE). The fix is a test-only correction that makes the synthetic TOC page physically coherent, so the existing, documented recognizer accepts it.

## ROOT CAUSE (evidence, do not re-derive)

`recognizePdfContents` derives TOC rows from geometry (`src/documents/pdf/detectContents.ts`):

- line 39: `leftLabels = … part.x > page.width * .34 && part.x < page.width * .5` (entry-number column, 204–300 px on a 600 px page)
- line 38: `rightLabels = … part.x > page.width * .72` (page-label column, > 432 px)
- line 40: `twoColumns` is true only if **both** `leftLabels` and `rightLabels` are non-empty
- line 54: in the single-region case, a numeric last part is rejected when `last.x < minX + (maxX - minX) * .55` (i.e. `< 330 px` on a 600 px page)

The fixture places each printed page label (`101`/`202`/`303`) at `x = 210`, width 18:

- `210 > 204 && 210 < 300` → every label counts as a **left/entry-number label**, so `rightLabels` is empty → `twoColumns = false` → one full-width region.
- In that single region the same label is the trailing numeric part with `last.x = 210 < 330` → the candidate is rejected by the line-54 guard.
- Result: `rows()` returns 0 candidates → `recognizePdfContents` returns `[]` → nothing to tag → 0 `toc-entry` blocks.

With `x = 490` (as used by the sibling unit spec added in the same commit) the same fixture yields 3 recognized rows and 3 tagged `toc-entry` blocks, with navigation still `[]`.

Attribution: `git diff --quiet 9474b99 HEAD -- src/documents/pdf/detectContents.ts` and `… pdfVisualTocImport.test.tsx` are both empty — neither the detector nor the test has changed since `9474b99` added them. `git show 9474b99:…pdfVisualTocImport.test.tsx` already contains `x = 210`, while `git show 9474b99:…detectContents.ts` already contains the `.55` guard and `.34`/`.72` two-column probe. The test therefore never matched the recognizer it shipped alongside; the recognizer is not a regression.

## SCOPE

In scope (only this file):

- `src/documents/import/pdfVisualTocImport.test.tsx`

Out of scope — do not touch:

- `src/documents/pdf/detectContents.ts` and its thresholds (`.34` / `.5` / `.72` / `.55`), and `detectContents.test.ts`
- `src/documents/import/fileImport.ts`
- `src/reader/pdf-reading/*`
- OCR, Original Reader, general PDF reader navigation, heading extraction
- Task 7 verification scripts, CSS, dictionary/translation/AI
- No architecture-doc update is required: this is a test-only change and changes no architecture, ownership, control flow, data flow, or integration behavior (`AGENTS.md` §3).

## CONSTRAINTS

- Do not change expected values to match 0 entries. The test's intended semantics are correct and already implemented: recognized printed rows stay visible as `toc-entry` blocks, while printed **navigation** still requires ≥ 2 verified destinations (`resolvePdfContents` final line; `docs/reader.md` "Printed navigation still requires two verified destinations").
- Prefer aligning the fixture with the sibling spec `src/documents/pdf/detectContents.test.ts` ("keeps excerpt rows visible with zero or one destination…" uses `item('101', 490, 680)` etc.) over inventing new coordinates.
- Do not loosen the recognizer to accept a mid-column `x = 210` label. A printed page label inside the text-body column is not a layout the docs or the detector support; that would be a separate behavior task with `verify:pdf` blast radius.
- Keep the fixture's other properties unchanged: page width 600, `numPages: 4`, `Contents` title at `y = 740`, rows at `y = 680/640/600`, and the `linked` annotation at `rect: [50, 675, 240, 685]` (row `y = 680` and `row.x = 60` still satisfy the annotation-overlap test at `x = 490`).

## ACCEPTANCE CRITERIA

1. `npx vitest run src/documents/import/pdfVisualTocImport.test.tsx` passes, including both `linked = false` and `linked = true` iterations:
   - 3 `toc-entry` blocks with `['First Chapter','101', resolvedPage]`, `['Second Chapter','202',undefined]`, `['Third Chapter','303',undefined]`
   - `imported.tocSource !== 'pdf-printed'` and `imported.toc` deep-equals `[]` (one resolved target must not create printed navigation)
   - `pageOffsets`, content slices, and per-entry `content.slice(startOffset, endOffset) === entry.text` unchanged
   - 3 `.pdf-reading-toc-entry` nodes rendered, second node `'Second Chapter 202'` with `data-printed-page-label="202"` and no `a`/`button`/`[role="link"]`
2. `npm run verify:import` is green.
3. No file outside `src/documents/import/pdfVisualTocImport.test.tsx` is modified.

## VERIFICATION

- Iteration: `npx vitest run src/documents/import/pdfVisualTocImport.test.tsx`
- Gate: `npm run verify:import` (typecheck + `vitest run src/documents --exclude "src/documents/pdf/**" --exclude "src/documents/offline*"`)
- Cross-check only if the detector is touched (it should not be): `npm run verify:pdf`
- Do not run `verify:full`. Browser E2E not required.

## IMPLEMENTER HANDOFF NOTES

- This is a one-line-fixture correction: change the three printed-label `x` coordinates from `210` to a value in the page-label column (e.g. `490`, matching `detectContents.test.ts`).
- Expected post-fix trace on the fixture: 8 page-1 TextItems → 4 visual lines → 3 candidate rows → 3 recognized rows → recognition accepted (≥ 3 rows) → 3 `toc-entry` tags; `linked = true` resolves only `First Chapter` → 1 resolved target → printed navigation still rejected.
- Planner verification status: the failing assertion was reproduced and the root cause confirmed with a temporary throwaway probe that was deleted; `git status --porcelain` is clean. The full post-fix assertion set (render + `linked = true`) was **not** executed and must be run by the Implementer.
