# Original PDF Reader selection test synchronization

## TASK

Make the desktop double-click / later phrase-selection test deterministic so `verify:pdf` can be an authoritative gate.

## AFFECTED SUBSYSTEM

Original PDF Reader selection (`docs/reader.md`).

## CURRENT STATE / ROOT CAUSE

`PdfPage.test.tsx` waits a fixed 30 ms after each event. The component schedules both double-click lookup and `selectionchange` capture in `requestAnimationFrame`; the phrase toolbar appears only after that callback calls `setPending` and Preact commits the portal. The 30 ms timeout observes elapsed time, not those transitions. The named test passed alone, while the complete `PdfPage.test.tsx` file failed at its final toolbar assertion (1/7 failed); targeted runs with either preceding test also passed. This demonstrates a nondeterministic test synchronization problem. It does not establish a production regression or persistent state leak.

`autoLookupRef` stores the looked-up word's canonical offsets. `capture()` suppresses a selection only while both offsets match. The later `0..12` phrase differs from the `4..12` word, clears the ref, and calls `setPending`. The code path is consistent with the intended behavior; the failed assertion does not prove that the callback or commit completed.

The double-click behavior and test were introduced together in commit `2ec819c` (`Refine pdf`). No evidence connects this failure to PDF extraction or TOC Tasks 1–6.

## LIKELY FILES

- Modify only `src/reader/pdf/PdfPage.test.tsx`.
- Inspect `src/reader/pdf/PdfPage.tsx` and `src/reader/pdf/selectionAdapter.ts` for context; no production change is indicated.

## ARCHITECTURAL INVARIANTS

Keep canonical PDF offsets, native selection, desktop single-word automatic lookup, phrase action toolbar, and `requestAnimationFrame` scheduling. No lookup pipeline, TOC, extraction, OCR, Reading Mode, or zoom change.

## IMPLEMENTATION PLAN

Replace the fixed sleeps in the named test with deterministic advancement of the scheduled animation frame inside `act`, then flush Preact effects/updates. Assert that the word double-click produces exactly one lookup with offsets `4..12` and no action bar. Change the selection to phrase offsets `0..12`, dispatch `selectionchange`, advance its scheduled frame, flush updates, and assert the phrase action bar is present and the lookup count remains one. Preserve the existing strong assertions. If deterministic frame synchronization still fails, diagnose the actual selection/capture state before changing product code.

## TESTS REQUIRED

- Targeted pre-check: `npx.cmd vitest run src/reader/pdf/PdfPage.test.tsx` (all seven tests together, to retain neighboring-test coverage).
- Authoritative gate after implementation: `npm.cmd run verify:pdf`.
- Check statuses at planning: named test alone **PASS** (1/1); full `PdfPage.test.tsx` **FAIL** (6/7; final toolbar assertion); `verify:pdf` **NOT RUN** in this investigation (user reports 100/101 pass).

## OUT OF SCOPE

All other Original Reader features and tests, TOC, extraction, OCR, Reading Mode, zoom/rendering, lookup pipeline, arbitrary longer sleeps, and product changes made solely for jsdom timing.

## OPEN QUESTIONS / RISKS

The exact scheduler interleaving causing the full-file failure was not directly instrumented. Confirm the deterministic test in the full file and `verify:pdf`; if either still fails, investigate event/selection state within this narrow path rather than assuming timing is the only cause.
