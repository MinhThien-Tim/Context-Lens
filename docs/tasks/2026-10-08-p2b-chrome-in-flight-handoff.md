# Planner handoff — Task P2b Chrome (in flight, resume here)

## GOAL

Task P2b (branch `rebuild/reader-v2`, phase guide `docs/reader-redesign-phases.md` §P2b): rebuild the
Reader chrome to `docs/reader-chrome.md` and land one test per rule ID
(`HDR-*, FTR-*, NAV-1, MOB-*, THEME-1, MORE-*, MODE-*, GEO-*, ARCH-2, ARCH-3`), with all old chrome
gone (`interfaceMode`, Simple/Advanced, Notes/Markup-dialog/Print, Header prev/next + page count,
mobile zoom stepper, reserved Footer band, Original-PDF resize-on-quiet).
Full task spec: the P2b task message of 2026-10-07 (9 steps, gate, report format).

## CURRENT CONTRACT

- `docs/reader-behavior-contract.md` (rule IDs = `@tag`s), `docs/reader-chrome.md` (ownership,
  §5 composition by band, §7 deletions, §8 test obligations).
- Key facts for the open work:
  - MOB-2: mobile Footer = one full-width bar, visible text labels:
    Contents · page number · Markup · More + hairline progress on top edge; no %, no zoom.
  - FTR-3: ≤1023px Footer Markup opens a compact palette **above the bar**; ≥1024px the Header
    `Highlight/Underline/Erase` group is the direct control, no dialog button, no second Markup entry.
  - `reader-chrome.md` §3: `.reader-highlight-palette` must join `OVERLAY_OPEN` in P2b.
  - A11Y-3: dismissing Markup returns focus to its opener.
  - HDR-5 desktop order: `Library` · title ⌄ | `Text | PDF` | zoom −/level/+ · Contents ·
    Highlight/Underline/Erase · `Aa` · More. THEME-1: `Aa` opens reading settings at ≥1024.
  - MORE-2: mobile Document · Theme · Languages · OCR [inside Document until P4] · Click lookup;
    desktop same minus Theme. No Notes entry.

## STATE OF THE WORK

Git: HEAD `176aa3e` "P2b step 2: full-height reading viewport, overlay chrome, no reserved Footer
band". Before it: `4ee8620`/`9d8ff83` (step 1, interfaceMode removal), `942673d` (AGENTS.md rule:
never author TypeScript via PowerShell here-strings; P3 must revisit `ARCH-4` because P3 migrates
`system` → Light/Dark).

Committed and green at last run: step 1, step 2 (geometry), plus E2E updates for NAV-1/FTR-1
(`pdf-zoom-footer.spec.ts`, `pdf-ocr-queue.spec.ts`, `readerNames.ts`,
`DocumentPosition.tsx` aria-label `Current PDF page`).
Gate at `176aa3e`: `check:css`, `verify:reader`, `verify:pdf`, `verify:ui` all pass.

**Uncommitted working tree (11 modified files, not yet committed — commit as one checkpoint after
it is verified):**

- `src/reader/ReaderToolbar.tsx` — removed Notes / Markup-dialog / Print buttons, prev-next and
  page count (−42 lines). Desktop group now: zoom stepper · Contents · Highlight/Underline/Erase ·
  More. `showMore = desktop` (Footer owns More at ≤1023).
- `src/app/App.tsx` — removed `highlightToolsOpen` state and the `setHighlightToolsOpen(true)` path;
  `readerMoreItems` now the MORE-2 inventory (Document · Theme[mobile] · Languages · Click lookup).
- `src/reader/ReaderProgress.tsx` — split into `reader-progress-desktop` (page number · progress ·
  OCR status) and `reader-progress-mobile` (contentsTrigger · location · markupTrigger · moreTrigger
  + hairline track).
- `src/reader/pdf/PdfModeSwitch.tsx` — labels `Text`/`PDF`; stored values stay `original`/`reading`.
- `src/reader/pdf/PdfViewer.tsx` — deleted `footerZoomHost`, `customScale`, resize-on-quiet (−34).
- `src/reader-layout.css`, `src/styles.mobile-reader.css` — overlay chrome geometry.
- `e2e/pdf-zoom-footer.spec.ts`, `e2e/pdf-ocr-queue.spec.ts`, `e2e/readerNames.ts` — Header→Footer
  naming, `Text`/`PDF`, Go-to-location navigation.
- Untracked: `docs/audits/`, `e2e/fixtures/sample/`, `tools/` — not reviewed; decide before commit.

## OPEN BUG (user-reported, fix first on resume)

**Mobile Footer Markup button does not open the palette.**

- Root cause: `src/app/App.tsx:619` — `markupTrigger` only toggles `activeMarkupTool`
  (`setActiveMarkupTool('highlight' | null)`); it never opens `MarkupPalette`. The
  `{highlightToolsOpen && <MarkupPalette …/>}` render was deleted together with the
  `highlightToolsOpen` state, and `App.tsx:57` now imports only the **type**
  (`import { type MarkupTool }`), so no code path renders the palette at any band.
- Fix outline (do not reintroduce the name `highlightToolsOpen` — step 9 stale search forbids it;
  e.g. `markupPaletteOpen`):
  1. Footer Markup trigger → `aria-haspopup="dialog"`/`aria-expanded`, opens the palette
     (FTR-3). Rendering at ≤1023 only; desktop keeps the direct Header tool group.
  2. Position the palette above the Footer bar (current `.reader-highlight-palette` is
     `top:60px` in `src/styles.reader-base.css:6`, mobile rule at `:146` centres it under the
     Header — wrong band; rule belongs to mobile presentation ownership in
     `src/styles.mobile-reader.css`).
  3. Add `.reader-highlight-palette` to `OVERLAY_OPEN` in `src/reader/ReaderShell.tsx:21`.
  4. Include palette-open in `ReaderShell` `controlsLocked` (App.tsx:579) so quiet is suppressed.
  5. Focus return to the trigger on close (A11Y-3); palette already has Done/`onClose`.
- Note: `reader-more`/Markup-trigger wiring already passes `markupActive` through; keep it.

Also reported earlier and since addressed in the working tree (re-verify, do not regress):
"two More buttons at Footer" — now exactly one More per band (`showMore = desktop` +
`moreTrigger` only when `!desktop`), and the bar is a single row (user showed a reference image).

## STALE TEST SURFACES FOUND SO FAR (inputs for step 8)

- `e2e/ui-interactions.spec.ts:233` — signal spec `reading controls remain reachable` at
  320/360/390/430 (8 failing at HEAD): asserts `Markup` → dialog `Markup tools` (will pass once the
  palette renders — report whether `Contents` at 320–430 became reachable via the new Footer
  placement), then `Reader menu` → menuitem `Text` (stale: MORE-2 renamed it `Theme`).
  Rewrite on role/name helpers; never weaken assertions.
- `e2e/markup-interactions.spec.ts:8` — `.reader-highlight-button` selector exists only in
  `src/styles.reader-base.css` (4 rules), no component renders it. Rewrite on role/name
  (Footer `Markup` → dialog `Markup tools`) or delete if asserting a removed contract.
- `e2e/offline.spec.ts:85` — `openMoreAction(page, 'Markup')`: Markup is gone from More (MORE-3).
- `e2e/pdf-zoom-actual-scale.spec.ts:101` — uses group `Markup tools` (desktop Header) — still valid.
- `e2e/pdf-click-mobile.spec.ts` — must be rewritten on role/name + stable viewport, carrying `@MORE-6`.
- Restore FTR-3 desktop half only for Highlight/Underline/Erase; Markup dialog-opener assertion
  stays deleted.

## IMPLEMENTATION (remaining P2b steps, in order; commit per green checkpoint)

1. Fix the Markup palette bug above (checkpoint 1).
2. Step 3 finish — mobile: quiet/reveal behavior per MOB-1/MOB-3, `Aa ···` reveal inside safe-area
   (record offset after 320px + landscape checks), delete mobile zoom host/stepper/custom-scale
   leftovers, **visible text labels** on the four Footer items (MOB-2).
3. Step 4 finish — desktop Header per HDR-5: add `Library` label for Back, `Aa` (reading settings),
   separators/order; title is a plain label (File switcher = P2c).
4. Step 5 verify MORE-2 inventory exactly; Step 6 Contents panel = Contents + Pages only
   (no Outline tab, no clock icon); Step 7 deletions per `reader-chrome.md` §7.
5. Step 8 tests — one per required rule ID (task list; exceptions LOOK-2/LOOK-3 → P5).
6. Step 9 stale-reference search, record raw output.

## VERIFICATION

- After each checkpoint: `check:css` → `verify:reader` → `verify:pdf` → `verify:ui`, then the
  rule-ID specs. Gate viewports: 320, 390, 767, 768, 1023, 1024, 844×390, 915×412, 1280×800.
- Windows run rules in `AGENTS.md` (`npm ci`, no junctions, `PW_REUSE_SERVER=0`, `--strictPort`,
  sequential, one server, `Out-File -Encoding ascii` instead of `>` redirects).
- Author/edit TypeScript only with the `edit` tool (here-strings corrupted a spec once).

## REPORT

Phase report + Cleanup report from `docs/task-template.md`; gate table PASS/FAIL/BLOCKED/NOT RUN;
Header title width at 320px in both fonts; last-line Footer clearance at 320 and 844×390; quiet
shows text only at 390; `Aa ···` safe-area offset; rule-ID coverage table (no empty rows except
LOOK-2/3); raw stale-search output; list of deleted specs with the removed rule each asserted;
state whether the signal spec's `Contents` failure was fixed by the new Footer placement.

Out of scope (do not touch): colours/fonts, OCR behavior, lookup copy/layout, pinch (Z2), Back
ownership (P5), NotesPanel/store/selection Note, Home Settings → Language engines dialog,
File switcher (P2c), delete/import in panels, mobile zoom. Known deferred: 1366px lookup button,
`phase 3 context` ×10, `wordnet.test.ts` flake (P5).
