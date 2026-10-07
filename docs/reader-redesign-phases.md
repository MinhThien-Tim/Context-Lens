# Reader Redesign — Phase Guide

Baseline: tag `pre-rebuild` (f264c3e), branch `rebuild/reader-v2`.
Acceptance = the contract rule IDs in [reader-behavior-contract.md](reader-behavior-contract.md). Spec of record: [reader-chrome.md](reader-chrome.md).

## How every phase runs

- One phase = one task in the 7-field template (`docs/task-template.md`). The task says what must exist afterwards; global rules live in `AGENTS.md` and `docs/change-dependencies.md`.
- A phase is done when its rule IDs pass **and** nothing of the removed contract remains (code, CSS, selectors, helpers, test titles, `@tag`s, docs).
- Never weaken an assertion to go green. Never investigate a spec that asserts a removed contract: delete it. A spec that asserts a **surviving** behavior and fails is a real bug: fix the code and report it.
- Commit after each green checkpoint. Close each phase with the Phase report and Cleanup report from the template.
- Windows run rules: one working tree, `npm ci`, no `node_modules` junctions; `PW_REUSE_SERVER=0`, `--strictPort`, sequential, one server at a time; never redirect with `>` in PowerShell (UTF-16), use `Out-File -Encoding ascii`.

## 0. Decisions applied by this rewrite

| Decision | Replaces |
| --- | --- |
| Desktop Header keeps its current toolbar, regrouped (navigation · mode · tools): Library · title ⌄ · `Text \| PDF` · zoom −/level/+ · Contents · Highlight/Underline/Erase · `Aa` · More. Removed: Notes, Markup-dialog and Print buttons, previous/next and the page count. Mobile Header = Back · title · `Text \| PDF` | Redesigning the desktop Header; Notes, Markup-dialog and Print buttons |
| Page number is the Footer location button at both bands. Contents: Header icon on desktop, Footer bar on mobile. Markup: Header tool group on desktop, Footer bar on mobile | legacy Header page navigation |
| Print is removed: button and handler deleted, no other entry (ARCH-8) | Print in the desktop Header toolbar |
| Mobile Footer = one full-width single-row bar (Contents · page number · Markup · More) with a hairline progress line, **[P2b]** no percentage, no zoom; immersive reading (Header and Footer both hidden while quiet); reveal by scroll direction; tap never toggles | two-row legacy Footer with a progress bar and zoom stepper; the floating pill explored in the reference image (not adopted) |
| Mobile has no zoom control (like Text mode); desktop keeps −/level/+; mobile pinch with render-after-settle is a later task (Z1 audit, then Z2) | mobile zoom stepper |
| Desktop `Aa` Header button = Theme panel; title = File switcher (P2c) | More → Theme on desktop |
| One font setting (Sans \| Serif, local) drives reading and interface | Separate UI and reading fonts |
| Text and PDF modes are similar, not identical, where their function differs (MODE-3) | — |
| More inventory per MORE-2: mobile Document · Theme · Languages · OCR [P4] · Click lookup; desktop Document · Languages · OCR [P4] · Click lookup | The 8 items of 2026-10-05; separate Appearance and Fonts rows |
| Notes is not a chrome action; implementation, data and the selection Note action stay untouched (ARCH-7) | Notes as a More item |
| Docs end state: `reader-behavior-contract.md` (WHAT) + `reader-chrome.md` (HOW) + `change-dependencies.md`; the three chrome docs are deleted, `reader.md` and `ui-system.md` are patched, not deleted | Six overlapping Reader docs |
| Mobile More trigger in the Footer, desktop More trigger in the Header | (unchanged from current code) |
| `Aa ···` kept, mobile and quiet only (desktop has no quiet state, so no `Aa ···`) | — |
| `Click lookup` kept, a More toggle | — |
| One Home layout replaces density variants | preference migration from `interfaceMode` **[P2b]** |
| Persisted `viewMode` values unchanged; only labels become `Text` / `PDF` | Renaming stored enums (would need a migration) |
| Fonts = Sans \| Serif, local | The mockup's five font names |

`Pen → Underline` (2026-10-05) stays: it is the tool name inside the Markup palette.

## P2a — Contract and test foundation (docs + tests, no UI change)

- **Goal.** Contract v2 and `reader-chrome.md` are authoritative; tests exist for every rule that is already true.
- **Do.** (1) Land the docs per the P2a task, delete the three merged docs, fix every link. (2) Classify each chrome spec by one rule: asserts a removed label/selector → delete; asserts a surviving behavior (quiet geometry, INP-*, BACK-1, Click lookup in PDF, LOOK-1) → rewrite on role/name helpers with the rule ID as `@tag`. (3) Record the failing specs that are outside this scope; do not fix them here.
- **Don't.** Change any UI or CSS.
- **Gate.** `npm run verify:fast`, then the rewritten specs. Mark each PASS / FAIL / BLOCKED / NOT RUN.

## P2b — Chrome and density preference migration

- **Goal.** HDR-*, FTR-*, NAV-1, MOB-*, THEME-1, MORE-*, MODE-*, GEO-*, ARCH-2, ARCH-3 hold; the old chrome is gone.
- **Order.** (1) Remove density preference (`interfaceMode`) migration, App branches, `data-interface-mode`, Advanced Home, `home-advanced.css`, density control. (2) Geometry: make the reading viewport full height at all times; Header and Footer overlay it with static padding inside the scroll container; delete the reserved Footer band and the PDF resize-on-quiet logic. (3) Mobile: Header = Back · title · `Text \| PDF`; Footer = one full-width bar (Contents · page number · Markup · More) with a hairline progress line; quiet hides both; delete the mobile zoom host, stepper and custom-scale code. (4) Desktop Header: regroup per HDR-5 (keep zoom −/level/+ and the Markup group), delete the Notes, Markup-dialog and Print buttons, previous/next and the page count; add `Aa` (opens the existing reading settings); rename the visible PDF mode labels to Text \| PDF; desktop Footer = page number + thin progress line + OCR status. (5) More per MORE-2 for each band. (6) Delete obsolete components, CSS and specs per `reader-chrome.md` §7. (7) One test per rule ID. (8) Stale-reference search.
- **Notes rule.** Leave `NotesPanel`, the notes store and the selection Note action untouched (ARCH-7); only the More entry goes.
- **Don't.** Touch colours, fonts, OCR behavior, lookup copy, or implement pinch (Z2). Leave the OCR widget exactly as it is. **Known interim:** until Z2 ships, mobile PDF has no in-app scale control (fit-width only).
- **Gate.** `check:css` → `verify:reader` → `verify:pdf` → `verify:ui`; viewports 320, 390, 767, 768, 1023, 1024, 844×390, 915×412, 1280×800. Report: Header title width at 320 in both fonts, last-line clearance above the Footer at 320 and 844×390, and that quiet shows text only at 390.

## P2c — File switcher (desktop)

- **Goal.** FILE-1.
- **Do.** The title becomes a trigger (accessible name "Switch document"). The panel reuses the `useLibrary` session (search, kind filter, paging) through a presentational list shared with Home. Choosing a document saves the current location, aborts the OCR queue and resets lookup and panel state, then opens the document through the existing open path (GEO-3 runs again). Back closes the panel first.
- **Don't.** Add delete or import to the panel; change the mobile Header.
- **Check first.** That location persistence flushes on a document change, and that lookup and panel state reset.
- **Gate.** `verify:reader`, `verify:ui`; one test switches between a PDF and a saved text without visiting Home.

## Z1 — PDF scale audit and benchmark (read-only; may run alongside P2a)

- **Goal.** Answer three questions without changing product code: (1) where scale and pinch are handled today (scale state, canvas CSS transform, PDF.js viewport, text layer, annotation and selection coordinates, scroll restoration, page virtualization, render scheduling); (2) the cost of rendering one page at actual scales (1.0, 1.5, 2.0 and a non-preset such as 1.37) on a mid-range Android Chrome, plus canvas memory, for text-heavy, vector-heavy and image-heavy PDFs; (3) whether re-rendering at the actual scale forces the canvas, text layer, annotation layer and scroll geometry to be synchronized.
- **Deliver.** A short written audit and a benchmark table. The owner reads the three answers before Z2 starts.

## Z2 — Mobile pinch zoom (after Z1 passes)

- **Goal.** ZOOM-2.
- **Do.** Pinch scales the surface visually only; after the gesture settles, render the visible page first, then neighbours, then the rest lazily; cancel or replace in-flight renders; commit the actual scale (not snapped to presets).
- **Don't.** Render per gesture event; change page identity, scroll position or mode.
- **Gate.** `verify:pdf` plus the device benchmark from Z1.

## P3 — Appearance, Theme, Fonts

- **Goal.** APP-1…APP-5.
- **Do.** (1) Pick the two bundled font families, record licence and source, add woff2 locally, verify with `document.fonts.check` (not by name in the UI). (2) Define the four reader tokens plus the separate lookup accent. (3) The Theme panel (`Aa` on desktop, More → Theme on mobile) groups Appearance, Colours and Font. (4) Theme panel scrolls inside itself. (5) Migrate `system` → resolved Light/Dark. (6) Record the remaining preset hex values before coding. (7) One font setting drives reading and interface typography (APP-3); check the 320px chrome in both fonts.
- **Check.** Contrast of heading/body/accent against both backgrounds goes in the report. `#C88E69` on `#F7F4EB` is likely below AA for text: use it for labels and accents only unless the check passes.
- **Gate.** `check:css`, `verify:ui`.

## P4 — OCR behavior

- **Goal.** OCR-1…OCR-6.
- **Rule (closed 2026-10-07).** A run starts only from an explicit user action; the first-12 local preload never starts a run. Once started, the run continues through 12-page windows to exhaustion (OCR-1, OCR-2).
- **Do.** (1) Remove "OCR next". (2) Move OCR out of Document into its More item (language, status, pause, resume, cancel). (3) Footer shows status only while active. (4) Replace the two string-coupled predicates (`App.tsx` ~594, `PdfModeSwitch.tsx` ~32) with queue state. (5) Fix the preload stop at 6 (`usePdfOcrQueue.ts` ~78). (6) Add the terminal-success state. (7) Migrate the 3/6-page copy and tests; update the OCR section of `reader.md`.
- **Don't.** Touch typography, theme or lookup.
- **Gate.** `verify:pdf`; unit tests over queue states; announcement test.

## P5 — Lookup popup

- **Goal.** LOOK-2, LOOK-3, plus the Back history owner (open item 1).
- **Do.** Compact POS line, "chưa xác định" only when truly unknown, drop the explanatory paragraph, use the lookup accent token. Resolve who owns history entries and delete any competing owner.
- **Don't.** Change the lookup engine, data or persistence.
- **Gate.** `check:css`, `verify:lookup`; exact-visible-text tests in EN, VI and EN+VI.

## P6 — Home residue

- **Goal.** Home runs on the P3 tokens with no leftover density or Advanced code.
- **Do.** Remove residue only; no new Home design until a mockup exists.
- **Gate.** `verify:ui`.

## P7 — Final cleanup

- **Goal.** Nothing orphaned.
- **Do.** Orphan components and CSS (including the dead `768–850px` block), stale test titles, `@tag`s, selectors, helpers, task docs, duplicate rules. Run `verify:full` once.
- **Gate.** Cleanup report with an orphan check.

## S1 — Spike: mobile pen canvas (not scheduled)

A written proposal only, no merged code. It must settle pointer-event ownership, coordinate transform, page association, persistence, scroll interaction, eraser, undo, resize/orientation and Text/PDF semantics. If the proposal is approved, it becomes its own task after P7.
