# Task: Fast-finish the cleanup phase (2026-10-06)

Goal: close the cleanup phase in the fewest steps. No new features. Rules: `agent-general-rules.md` (now committed to `docs/`),
Evidence rule, spec -> code -> tests, one logical change per commit, `git status --short` before/after every commit,
command output redirected to `tmp/` with `Out-File`.

## 0. Corrections accepted from the last report

- **C29 is a stale test, not a bug.** `Explain` was renamed to `Define` in `3490a22` (2026-09-27). Live spec: `reader.md:182`, `ui-system.md:152` ("Define, Highlight and Note"). My earlier "0 results" came from a shell-quoting artifact.
- **New rule:** a `git log -S` / `rg` result of 0 must be re-checked by a second method (`git log --all -G"<text>"` and `rg`) before it is used as evidence. A false "0 results" already caused one wrong classification.
- **Regression check owed:** `pdf-mobile-zoom.spec.ts` was 8/8 green at `1ac81f0`; now 2 fail at line ~35 (click `Original` has no effect on mobile). Run the test in a worktree at `1ac81f0`. Passes there => one of `d62ca2e..4ce095c` broke it: bisect those 6 commits, classify as bug, fix. Fails there => record as pre-existing with the evidence. Do not park this as "new register ID" before the bisect.

## 1. Owner decision: redundant controls (approved)

| Control | Decision | Reason |
|---|---|---|
| **"Go to location" button inside the Contents panel** (`ContentsPanel` prop `onGoTo`) | REMOVE | Tapping a Contents entry already navigates there |
| **Copy** in the PDF selection bar (inside the collapsed `More` `<details>`) | REMOVE | Native copy exists on every device (long-press callout, Ctrl/Cmd+C) |
| Page-number button (Header at >=1024px, Footer at <=1023px) that opens the Go to location dialog | **KEEP** | Only way to jump to a page number or percentage; PDFs without an outline have no Contents entries |

Pre-conditions for removing Copy (check before deleting, paste result):
- `rg -n "user-select|contextmenu|preventDefault" src --glob "*.{ts,tsx,css}"` shows the PDF text layer is not `user-select: none` and the native context menu/callout is not suppressed.
- Check what else is inside the selection bar `More` `<details>`. If Copy is its only content, remove the whole `More` disclosure (and any test selector for it). If other items exist, remove only Copy.
- If native selection is suppressed anywhere, stop and report; do not remove Copy.

Order:
1. **Spec commit:** `reader.md` / `ui-system.md`: selection actions = Define, Highlight, Note (no Copy, no More); Contents panel has no Go to location; Go to location is reached from the page indicator.
2. **Code commit:** remove both controls and their props/handlers (`onGoTo`, the Copy handler); `rg` proving no remaining users.
3. **Test commit:** delete assertions of the removed controls (each deletion cites the spec line from step 1) and add replacements:
   - Contents: tapping an entry's text navigates (assert current page/location changes).
   - Page indicator opens Go to location and a number jump works.
   - Selection bar exposes exactly Define / Highlight / Note (+ Close).

## 2. Repair `pdf-stability.spec.ts` (C29, stale, with spec citation)

- `Explain` -> `Define` (also the 10-iteration lookup loop at ~:193).
- Copy step: delete (decision above).
- `Go to location` step: replace with Contents-entry navigation, scoped to the Contents panel (the strict-mode clash was Document panel vs article).
- Run both projects; the 2 currently failing tests must pass; paste output.

## 3. Remaining tests (fast classification, fix only what is clearly stale)

- **#6 `pdf-original-resolution.spec.ts:27`:** `if (isMobile) click 'PDF options'` is stale: the mobile `.pdf-more` popup was deleted (`mobile-chrome.md §5:70-88`, `40e807d`). Rewrite with the Footer zoom stepper. Cite §5.
- **`vocabulary-reader-flow:40`, `reader-p0:10`:** probe `closest('header')` / `closest('footer')` for every band-dependent locator before classifying. Fix if stale; otherwise register an ID and defer.
- **`pdf-real-samples.spec.ts`:** re-read the `.pdf-queue-status` -> `progressbar` change; if it asserts a completion message, use the dialog `role="status"`. Commit with message "NOT RUN (env-gated)". Owner approved.
- **C5:** do not restore the deleted spec. Produce a mapping table: each deleted assertion of `pdf-desktop-zoom-toolbar.spec.ts` -> the test in `pdf-zoom-actual-scale` / `pdf-zoom-footer` that now covers it. Unmapped assertions: add a test or list as a gap.
- **C18, C23, C16:** classify during the final run; fix only if stale with a spec citation, else register and defer.

## 4. Small code cleanups (one commit)

C10 (dead backdrop `onClick`), C13 (stale comment naming `PdfDocumentTools.tsx`), delete `PdfReadingNavigation.tsx` (no importer; `rg` proof). C11 (`usePdfDocument`: reset on file change, wrong-password feedback, single `destroy()`) as its own commit with a unit test.

## 5. Hygiene (one pass)

`.gitignore` (`backup-wip.patch`, `output.txt`, `tmp/`, `_*.txt`); `.gitattributes` (own commit, normalize line endings once, alone); `verify:fast` and `verify` scripts + Stop hook; confirm `agent-general-rules.md` and this task are in `docs/`. C19: classify only (worktree before `40e807d`), do not fix.

## 6. Final run and close

One full Playwright run with the owner's tier config, `tsc --noEmit`, `check:css`, `vitest run`. Every remaining failure gets: ID, class, evidence, and either a fix or an owner-approved deferral.

Defer to the next phase (do not start now): C27 (silent OCR button on ineligible page), C26 (hard-coded Vietnamese labels), C28 follow-ups, auto-continue OCR coverage (new ID C30, needs >12-page fixture), desktop toolbar groups that duplicate More items (see report), anything else not in this task.

## 7. Done when

`git status --short` is clean; no uncommitted accepted work; `main` contains every file its docs describe; every register row is closed or deferred with an ID; final report lists commits (hash + message), tests added/changed/removed (each removal with spec citation), verification output (NOT RUN items named), failures with classification, open decisions, and the deferred list.
