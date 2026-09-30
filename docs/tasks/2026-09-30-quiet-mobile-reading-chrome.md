# Quieten mobile Reading Mode chrome reveal

TASK
Mobile Reading Mode header/toolbars re-enter the viewport too often during ordinary reading.
Make ordinary reading activity stop driving the chrome, while keeping controls trivially recoverable.
Do not redesign the reader shell.

AFFECTED SUBSYSTEM
Reader chrome / Reading Mode. `ReaderShell` owns transient mobile chrome visibility for all three
surfaces; `PdfReadingView` + `PdfOcrReadingPage` own Reading Mode selection/tap-to-define.

CURRENT STATE / ROOT CAUSE
All mobile chrome visibility is one boolean `quiet` in `src/reader/ReaderShell.tsx`. It renders
`chrome-quiet` on the shell, which slides `.reader-header` out and `.reader-progress` in/out
(`src/reader-layout.css:108-109`) and moves the viewport from `top: var(--reader-header-height)` to
`top: 0` (`src/styles.mobile-reader.css:41-44`).

Three defects, in order of impact:

1. `ReaderShell.tsx:45` `onPointerDownCapture`:
   `if (surface !== 'original' || !(event.target instanceof Element && event.target.closest('.pdf-page'))) setQuiet(false)`
   On Reading Mode `surface !== 'original'` short-circuits to true, so EVERY pointerdown inside the
   shell reveals the chrome. The `.pdf-page` exemption was authored for Original Mode only.
   A single scroll flick therefore runs: pointerdown reveals -> scroll `delta > 8` re-quiets ->
   next flick reveals again. This is the reported oscillation.

2. No hysteresis. The `delta > 8` re-quiet threshold (`ReaderShell.tsx:31`) is smaller than the
   reveal threshold for "something happened", so a reveal caused by a tap is undone by the very
   next scroll frame.

3. Overlay guard gap. `ReaderShell.tsx:29` blocks quieting while
   `.reader-more-menu,.pdf-reading-options,.pdf-more-menu,.pdf-reading-selection-wrap,.selection-actions`
   is present. `PdfOcrReadingPage.tsx:36` renders `.pdf-reading-selection-actions` directly inside the
   `<section>` with no `.pdf-reading-selection-wrap` wrapper, so an active OCR selection bar does not
   match the guard and the chrome can quiet out from under it.

LIKELY FILES
- `src/reader/ReaderShell.tsx`  — the only production file that must change.
- `src/reader/ReaderShell.test.tsx` — tests; already mounts `surface="reading"`.
- `docs/ui-system.md`, `docs/reader.md` — behavior + ownership changed, docs must follow.

ARCHITECTURAL INVARIANTS
- Preserve the `chrome-quiet` class contract and the `reader-reveal` button. `e2e/pdf-mobile-chrome-space.spec.ts`
  and `e2e/pdf-click-mobile.spec.ts` both assert on it.
- Preserve `ui-system.md`: quiet chrome changes opacity/transform only, never viewport size, never scrollTop,
  never location. No CSS layout change in this task.
- `ReaderShell` "observes existing scroll events, never navigation" — do not touch `usePdfScroll` or location.
- `controlsLocked` (App.tsx:592) stays an absolute keep-visible override for lookup/notes/settings/GoTo/markup.
- Do not change `PdfReadingView` / `PdfOcrReadingPage` selection, tap-to-define, or markup behavior.
- Desktop path returns early on `desktop` and must stay untouched.

IMPLEMENTATION PLAN
Keep the class, the CSS, and the two existing "reader is going back up" rules (`delta < -8`, `top < 40`).
Change only the decision function. Add one per-surface reading-surface selector so the existing Original
exemption becomes a shared rule:

    const readingSurface = surface === 'original' ? '.pdf-page' : '.pdf-reading-scroll';

(plus `.reader-viewport`/`.pdf-scroll`/`.pdf-reading-scroll`/`[data-reader-text]` for the existing
`readingGesture` marker, which already covers all surfaces.)

A. Pointerdown is a scroll candidate, not a control request.
   In `onPointerDownCapture`, skip the reveal when the target is inside the reading surface AND is not
   chrome. Original behavior is preserved exactly: on Original a `.pdf-page` hit still does not reveal,
   everything else still does. Reading Mode gains the identical rule.

B. Reveal on a confirmed tap, using the convention already in the repo.
   `PdfPage.tsx:205-226` already classifies a tap as: touch + primary + button 0 + duration < 450 ms
   + movement <= 10 px + unchanged scrollTop + no active selection. Reuse that exact shape instead of
   inventing a gesture. Arm a candidate on pointerdown inside the reading surface; on pointerup/click,
   reveal only if all of the above hold. Store it in a ref, not state.

C. Hysteresis for re-quieting.
   Require an accumulated downward distance (e.g. 32 px) on the same scroll target before re-quieting,
   instead of a single 8 px frame. A tap-reveal therefore survives the tail of the gesture that caused it,
   and one flick no longer produces reveal -> quiet -> reveal.

D. Close the OCR selection-bar gap.
   Add `.pdf-reading-selection-actions` to the overlay guard selector list at `ReaderShell.tsx:29`.

E. Do not add, remove, or reorder any DOM preventDefault/stopPropagation in the reveal path.
   Word lookup, selection, and the Quick card must keep receiving their events untouched.

OUT OF SCOPE
- Any CSS change. The 88 px `top` shift on every quiet toggle is real and is the loudest visual symptom,
  but it is a deliberate, documented, E2E-asserted layout decision. Reducing toggle frequency (A-D)
  removes the flapping. Revisit the geometry as its own task.
- Original Mode UX changes, Desktop, TextReader, panel/backdrop behavior, `PdfReadingView` tap-to-define,
  `PdfReadingNavigation`.
- Gesture model expansion, tap zones, new settings, auto-hide timers.

TESTS REQUIRED
Add to `src/reader/ReaderShell.test.tsx` (mounts `surface="reading"`):
1. Touch pointerdown inside `.pdf-reading-scroll` that becomes a scroll does NOT reveal the chrome.
2. Confirmed short stationary tap (touch, <=450 ms, <=10 px, no scroll) DOES reveal the chrome.
3. A tap followed by an 8 px scroll does NOT re-quiet; a tap followed by >32 px of downward scroll does.
4. A pointerdown inside `.pdf-page` on `surface="original"` still does not reveal (regression guard for
   the generalized selector).
5. Pointerdown on a control inside the chrome (outside the reading surface) still reveals.
6. While `.pdf-reading-selection-actions` is present, scroll does not quiet the chrome.
7. Existing tests stay green: programmatic restore, desktop, `controlsLocked`, tap-to-define, OCR next.

Run:
- `npm run verify:reader`  (typecheck + `src/reader`; covers ReaderShell)  -> authoritative
- `npm run verify:pdf`     (Reading Mode components)                      -> regression
No CSS change, so `npm run check:css` is expected to pass unchanged; run it only if a stylesheet is touched.

MANUAL / E2E (conditional per AGENTS.md, not mandatory)
- Real device per `docs/DEVICE_QA.md`: read several pages in Reading Mode, single continuous flicks
  included. Chrome must enter once and stay out. Then tap content to define a word, confirm the Quick card
  and selection bar appear without the header animating on top of them, and confirm `.reader-reveal` still
  restores the chrome. Repeat one pass in Original Mode.
- Regression only, do not treat as the gate: `e2e/pdf-mobile-chrome-space.spec.ts` (chrome-quiet geometry)
  and `e2e/pdf-click-mobile.spec.ts` (tap-to-define while quieted).

OPEN QUESTIONS / RISKS
- Threshold values (10 px slop, 450 ms, 32 px re-quiet) are copied from `PdfPage.tsx` where possible.
  Tune only if manual device QA shows the tap classifier firing on real swipes.
- Reading Mode's `onClick` tap-to-define (`PdfReadingView.tsx:79`) has no movement/duration filtering,
  unlike Original's `PdfPage` detector. A slow drag ending on a word can open Quick today. That is a
  pre-existing, separate defect — do not fix it here, but do not make it worse.
- `onFocusCapture` still reveals on any focus. If device QA shows focus flicker on mobile, scope it to
  focus landing on chrome rather than the whole shell, in a follow-up.
- `e2e/pdf-mode-layout.spec.ts` and `e2e/pdf-mobile-chrome-space.spec.ts` toggle `chrome-quiet` directly
  from the test, so they stay valid regardless of the new event policy.
