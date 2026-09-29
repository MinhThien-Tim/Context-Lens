# TASK

Close the remaining current-HEAD Original PDF Reader stabilization gaps before architectural refactoring. Preserve the shared PDF model, canonical offsets, structured page model, bounded canvas rendering, navigation token, and existing mobile Original interaction behavior.

# CURRENT STATE

- HEAD is `5629ad4`. The worktree was clean at inspection.
- Reader documentation and current code describe the stabilized desktop natural-scale first render, fit-relative desktop zoom stepping, two-axis edge reachability, viewport-relative horizontal point preservation, direct desktop zoom controls, and compact Original Reader chrome.
- Focused Playwright execution was started with the command below. It reported PASS for desktop horizontal edge reachability and both desktop zoom-toolbar modes; mobile chrome-space then reported a failure, but the command had not produced final output when its single status check ended. Treat that result as **UNRESOLVED**, not as a confirmed product defect. Reproduce and capture the assertion before changing code.
- No current, confirmed defect has yet been established for Quick Card placement when lookup originates in Original Reader.

# CONFIRMED PROBLEMS

- None confirmed at current HEAD.
- Diagnostic signal requiring resolution: `e2e/pdf-mobile-chrome-space.spec.ts` reported a failing case during the focused run; exact assertion and final runner status were unavailable. Re-run this targeted case and classify the result before implementation.

# NON-PROBLEMS / ALREADY WORKING

- Desktop Original first-render quality has dedicated assertions for real initial bounds, DPR-backed resolution, pixel budgets, and post-zoom redraw in `e2e/pdf-original-first-render-footer.spec.ts`; natural-size and text/canvas alignment are covered by `e2e/pdf-original-natural-scale.spec.ts`.
- Desktop controls have direct zoom in/out, presets, keyboard dismissal, and Simple/Advanced coverage in `e2e/pdf-desktop-zoom-toolbar.spec.ts`. Both modes passed in the partial diagnostic run.
- Desktop zoom overflow and access to both horizontal edges are directly asserted in `e2e/pdf-desktop-horizontal-scroll.spec.ts`, which passed in the partial diagnostic run.
- Mobile zoom, selection geometry, page reachability, bounded canvases, and resize persistence are exercised in `e2e/pdf-mobile-zoom.spec.ts`. Do not redesign its interaction model.
- Reader mode/chrome layout has broad viewport coverage in `e2e/pdf-mode-layout.spec.ts`; Original mobile header-space behavior is specifically covered in `e2e/pdf-mobile-chrome-space.spec.ts` and remains unresolved pending a complete targeted result.
- Quick popup dimensions/pinning have generic coverage in `e2e/quick-placement.spec.ts`; Quick presentation has component-level responsive coverage in `e2e/quick-simple.spec.ts`. These do not establish Original Reader anchoring under PDF scrolling/zoom.

# ROOT CAUSE

No root cause can be assigned without a confirmed reproduction. If the mobile chrome case fails, first determine whether the mismatch is in `ReaderShell` geometry/state, shared reader layout CSS, or the Original PDF scroll container; fix only the owning layer demonstrated by the failing assertion. For any confirmed Quick Card issue, inspect the actual Original selection-to-lookup anchor path and `LookupBottomSheet` placement measurement together; do not change lookup semantics.

# SCOPE

Only current, reproducible Original Reader stabilization defects. Keep mobile and desktop interaction expectations separate. Add a narrowly targeted regression assertion for any confirmed gap that existing E2E does not cover.

# OUT OF SCOPE

PDF extraction, OCR, canonical offsets, document/location contracts, shared structured-page architecture, Reading Mode absent a confirmed shared regression, translation/dictionary logic, `App.tsx` refactoring, broad CSS cleanup, and redesign of working mobile Original behavior.

# FILES / SUBSYSTEMS

- `src/reader/pdf/PdfViewer.tsx`, `PdfPage.tsx`, and focused PDF tests only if the reproduction identifies rendering/zoom ownership.
- `src/reader/ReaderShell.tsx`, `src/reader/ReaderProgress.tsx`, `src/reader-layout.css`, `src/styles.reader-base.css`, `src/styles.desktop-reader.css`, or `src/styles.mobile-reader.css` only when the failing geometry identifies that layer.
- `src/components/LookupBottomSheet.tsx` and its placement helper only for a reproduced Original-origin Quick placement defect.
- Targeted existing/new `e2e/pdf-*.spec.ts` coverage; do not alter architecture or unrelated test surfaces.

# IMPLEMENTATION PLAN

1. Re-run the previously incomplete mobile chrome spec and record the exact assertion/result. If it passes, classify the earlier signal as unresolved environment/test completion and make no mobile change.
2. Run focused E2E coverage for initial render, natural scale, desktop zoom controls, desktop horizontal reachability, mobile zoom, and reader mode layout. Separate failures from current defects using rendered geometry and the failing assertion.
3. Inspect Quick placement from a real Original Reader selection only if a current defect is reported/reproduced. If existing tests do not cover the actual reader-origin anchor and it is in scope, add one narrow desktop E2E regression.
4. Make the smallest owning-layer fix for each confirmed failure; add/adjust only its targeted regression coverage. Preserve all listed invariants and the existing mobile behavior.

# ACCEPTANCE CRITERIA

- Every candidate issue is classified as reproduced, passing/already working, or unresolved with evidence; no speculative product change.
- First render meets the existing device-pixel and canvas-budget checks; desktop zoom control/presets function; zoomed pages remain reachable at both horizontal edges and vertically.
- Original chrome geometry has no unexplained viewport overflow or lost page position across quiet/revealed states; mobile remains consistent with its existing behavior.
- Quick placement from Original Reader is either verified by a targeted reader-origin case or explicitly recorded as unconfirmed; lookup behavior and placement preferences remain unchanged unless a placement regression is reproduced.
- Existing mobile, Reading Mode, shared location/offset, and bounded-canvas invariants remain intact.

# VERIFICATION

- Authoritative PDF subsystem check: `npm.cmd run verify:pdf`.
- Focused browser check (laptop and mobile projects as configured): `npx.cmd playwright test e2e/pdf-original-first-render-footer.spec.ts e2e/pdf-original-natural-scale.spec.ts e2e/pdf-desktop-horizontal-scroll.spec.ts e2e/pdf-desktop-zoom-toolbar.spec.ts e2e/pdf-mobile-zoom.spec.ts e2e/pdf-mobile-chrome-space.spec.ts e2e/pdf-mode-layout.spec.ts e2e/pdf-original-resolution.spec.ts`.
- If LookupBottomSheet placement code changes, also run `npm.cmd run verify:lookup` and the narrow relevant lookup placement E2E plus the new Original-origin regression. Avoid full-browser/full-suite escalation unless evidence expands the blast radius.
- Planner diagnostic command already run: same focused Playwright command above. Partial evidence: horizontal-scroll PASS, desktop toolbar Simple/Advanced PASS, mobile chrome emitted a failure, final result **UNRESOLVED** because no final runner output was observed. Do not treat it as a confirmed defect.

# REGRESSION RISKS

- Zoom/render edits can regress first-render sharpness, text/canvas alignment, page preservation, or canvas memory bounds.
- Scroll/overflow/layout edits can make one horizontal edge unreachable, disturb vertical navigation, or alter the mobile Original viewport during selection/chrome transitions.
- Shared shell/CSS changes can affect Reading Mode chrome and lookup panel placement; constrain selectors and verify both surfaces where touched.
- Lookup anchor changes can cause popup remeasurement/repositioning while scrolling or zooming; do not disturb generic placement preferences or mobile sheet behavior.
