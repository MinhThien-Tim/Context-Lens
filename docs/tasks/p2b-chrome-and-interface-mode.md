# Task P2b — Chrome and `interfaceMode`

Branch: `rebuild/reader-v2` (after P2a commit B, `34ee4da`). Phase guide: `docs/reader-redesign-phases.md` §P2b.

## 1. Goal

After this task, the Reader chrome matches `reader-chrome.md` and these rules pass, each with a test carrying its ID as `@tag`:
`HDR-*, FTR-*, NAV-1, MOB-*, THEME-1, MORE-*, MODE-*, GEO-*, ARCH-2, ARCH-3`.
Nothing of the old chrome remains (code, CSS, selectors, helpers, test titles, `@tag`s, docs): `interfaceMode`, Simple/Advanced, Notes/Markup-dialog/Print buttons, prev/next and page count in the desktop Header, the mobile zoom stepper, the reserved Footer band, Original-PDF resize-on-quiet.

## 2. Read first

- `reader-behavior-contract.md` (v2), `reader-chrome.md`, `change-dependencies.md`, `AGENTS.md`, `docs/task-template.md`
- P2a Stage 2 report: coverage map and LEAVE OUT table (the "no row" list below comes from it)

## 3. Do (in this order; commit after each green checkpoint)

1. **Remove `interfaceMode`.** Preference migration, App branches, `data-interface-mode`, Advanced Home, `home-advanced.css`, density control. Home keeps the Simple branch.
2. **Geometry.** Reading viewport is full height at all times. Header and Footer overlay it; static padding sits inside the scroll container. Delete the reserved Footer band and the Original-PDF resize-on-quiet logic. This must make the known 88px PDF shift during quiet disappear.
3. **Mobile (≤1023).** Header = Back · title · `Text | PDF`. Footer = one full-width single-row bar with visible text labels: Contents · page number · Markup · More, plus a hairline progress line, no %, no zoom. Quiet hides both. Scroll down hides, scroll up 32px reveals both, top of document always shows, tap never toggles. `Aa ···` is the reveal button while hidden, bottom-right inside the safe-area inset (record the offset after the 320px and landscape checks). Delete the mobile zoom host, stepper and custom-scale code.
4. **Desktop (≥1024) Header**, grouped per HDR-5: `Library` · title ⌄ | `Text | PDF` | zoom −/level/+ · Contents · Highlight/Underline/Erase · `Aa` · More. Delete the Notes, Markup-dialog and Print buttons, prev/next and the page count. Remove the `setHighlightToolsOpen(true)` path (`App.tsx` ~626) and the `highlightToolsOpen` state it feeds. `Aa` opens the existing reading settings. Rename Original/Reading labels to `Text | PDF`; stored `viewMode` values unchanged. Desktop Footer = page number (button to Go to location) + thin progress line + OCR status while active, no %. The title is a plain label in this task (File switcher is P2c).
5. **More** per MORE-2. Mobile: Document · Theme · Languages · OCR [P4] · Click lookup. Desktop: Document · Languages · OCR [P4] · Click lookup. No Notes entry.
6. **Contents panel** has Contents and Pages only: no Outline tab, no clock icon.
7. **Delete** obsolete components, CSS and specs per `reader-chrome.md` §7.
8. **Tests, one per rule ID.** Required new rows (no test carries them after P2a): `ARCH-1, ARCH-2, ARCH-3, ARCH-4, ARCH-7, ARCH-8, CHR-1, CHR-3, CHR-4, INP-3, INP-4, MOB-3, FTR-1, FTR-4, FTR-5, NAV-1, MORE-2, MORE-3, MORE-4, MORE-5, MORE-6, MODE-3, GEO-6, A11Y-1, A11Y-2, A11Y-4`, plus `HDR-*` and `MOB-*`. Exceptions: `LOOK-2`, `LOOK-3` (P5). Where a rule is already true (e.g. `ARCH-7`, `ARCH-8`), still add the test now.
   - Rewrite `pdf-click-mobile.spec.ts` on role/name helpers and the stable viewport; it should carry `MORE-6`. If it still fails after step 2, report the root cause; do not weaken it.
   - Restore FTR-3 desktop half only for surviving controls (Highlight/Underline/Erase). The Markup dialog-opener assertion stays deleted.
9. **Stale-reference search** (record raw output): `interfaceMode`, `data-interface-mode`, `home-advanced`, `highlightToolsOpen`, `setHighlightToolsOpen`, `Print`, `print` handlers, `Notes` entries in chrome/More, `OVERLAY_OPEN`-style class chains, stepper/custom-scale names, old test titles and `@tag`s.

## 4. Don't

- Touch colours, fonts, OCR behavior (leave the OCR widget exactly as is), lookup copy or lookup layout, or implement pinch (Z2).
- Change who owns Back history (open item for P5); keep `BACK-1` passing as is.
- Touch `NotesPanel`, the notes store or the selection Note action (ARCH-7); only chrome entries go.
- Remove the Home Settings entry that opens the Language engines dialog; `e2e/homepage.spec.ts` utilities test guards it.
- Add File switcher, delete/import in panels, or a mobile zoom control. Known interim: mobile PDF is fit-width only until Z2.
- Fix lookup bugs out of scope: the 192px vs ≤72px language button at 1366px, `phase 3 context Quick and Full` ×10 (both → P5), `wordnet.test.ts` 5s flake.

## 5. Constraints

- Never weaken an assertion to go green. A spec asserting a removed contract is deleted, not investigated. A spec asserting a surviving behavior that fails is a real bug: fix the code and report it.
- Signal spec: `reading controls remain reachable` (8 failing at HEAD, `Contents` unreachable at 320–430px). Rewrite or delete per the rule above, and state in the report whether it was fixed by the new Contents placement.
- Follow `change-dependencies.md` for every changed surface (docs, tests, CSS, helpers move together).
- Windows: one working tree, `npm ci`, no `node_modules` junctions, `PW_REUSE_SERVER=0`, `--strictPort`, sequential, one server at a time, no `>` redirects in PowerShell (use `Out-File -Encoding ascii`).

## 6. Gate

`check:css` → `verify:reader` → `verify:pdf` → `verify:ui`, then the rule-ID specs. Viewports: 320, 390, 767, 768, 1023, 1024, 844×390, 915×412, 1280×800. Mark each item PASS / FAIL / BLOCKED / NOT RUN.
Report must include:
- Header title width at 320px in both fonts
- Last-line clearance above the Footer at 320px and 844×390
- Quiet shows text only at 390px
- `Aa ···` safe-area offset
- Rule-ID coverage table (rule → test file:line) with no empty rows except LOOK-2/3

## 7. Report

Phase report and Cleanup report from `docs/task-template.md`, plus raw stale-reference search output and a list of any spec deleted with the removed rule it asserted.
