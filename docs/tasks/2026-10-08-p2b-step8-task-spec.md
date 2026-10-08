# P2b Step 8 — task spec: rule-ID tests and stale-spec migration

Role: Implementer. Planner, 2026-10-08. Branch `rebuild/reader-v2` @ `4995c1d`.
Input: [Fact Report](./2026-10-08-p2b-step8-rule-tests-investigation.md) — §numbers below are its sections.
Pointers (read, never copy): repo-global rules in AGENTS.md + editor custom instructions; task
[p2b-chrome-and-interface-mode.md](./p2b-chrome-and-interface-mode.md) §3.8/§4/§5/§6/§7; rule→group map [reader-chrome.md](../reader-chrome.md) §8; exact rule text only for rows you implement, from [reader-behavior-contract.md](../reader-behavior-contract.md).

## Objective

Land one passing test carrying the `@tag` of every rule row in Fact §2, and migrate or delete every spec the `Text\|PDF` rename and the chrome deletions left stale: tags first (A), missing tests second (B), stale-spec work last (C), each batch verified and committed as a green checkpoint. Product code changes only where a surviving spec exposes a real bug. No rule row stays empty except the phase exceptions recorded in Fact §2.

## Scope fences

- **Step 6 parked** (Fact §6): the Contents-panel `Notes` action stays (ContentsPanel.tsx:27 via App.tsx:613), with ContextPanel `Open notes` (ContextPanel.tsx:12), NotesPanel, notes store and selection Note untouched; ARCH-7 asserts these surviving entries and never assumes Step 6 ran.
- Deferred by phase: OCR behavior + OCR row/status → P4; LOOK-2/3 → P5; pinch → Z2; File switcher (incl. HDR-2 desktop activation, FILE-1) → P2c; colours/fonts/APP-* → P3.
- Task §4 don'ts, §5 deferred list and Fact §8.5/§8.6 apply by pointer: no lookup fixes, no cleanup of unrelated untracked files, no weakening to green.

## A — Tag existing tests (Fact §3; tags only, no assertion edits)

| Tag(s) to add | Tests (file:line) |
| --- | --- |
| `@ARCH-1` `@CHR-3` | src/reader/ReaderShell.test.tsx:56; e2e/mobile-chrome.spec.ts:113 |
| `@MOB-3` | ReaderShell.test.tsx:47; mobile-chrome.spec.ts:215, :229 (CHR-2 already tagged in e2e) |
| `@MOB-3` `@INP-4` | ReaderShell.test.tsx:80; mobile-chrome.spec.ts:258, :279, :305 |
| `@INP-3` | ReaderShell.test.tsx:94; mobile-chrome.spec.ts:322 |
| `@INP-1` `@MODE-1` (extend) | mobile-chrome.spec.ts:344, :388, :440 |
| `@MORE-1` (extend) `@MORE-4` | mobile-chrome.spec.ts:506, :528 |
| `@FTR-1` (mobile half) | mobile-chrome.spec.ts:654 |
| `@NAV-1` | e2e/pdf-zoom-footer.spec.ts:92, :109; delete stale "Untagged: NAV-1" comment at :90 |
| `@ARCH-7` | e2e/reader-contract-surface.spec.ts:~220 (note-absence; Contents-panel half added in B) |
| `@HDR-3` | mobile-chrome.spec.ts:69 (absence loop :73–76) |

Fact §3 parentheticals name which test matches which rule — tag only those matches. Do **not** add
`@A11Y-3` to markup-interactions.spec.ts:6 (already `@FTR-3`; focus-return half is tagged at
reader-contract-surface.spec.ts:201).

## B — New tests for the empty rows (Fact §2)

One test per row, tagged with its rule; PDF-opening tests also keep the `@pdf` tier tag. Helpers:
`modeControl` (e2e/readerNames.ts:54), `documentItem` (:61), `openGoToLocation` (:78),
`togglePdfMode` (e2e/readerO.ts:221), `stubViewport` (ReaderShell.test.tsx:16),
`expectMobileChrome`/`waitForReaderSurface` (reader-chrome.md §8).

| Rule | Target file | Band / viewport | Assertion (one sentence) | Helper |
| --- | --- | --- | --- | --- |
| ARCH-3 | e2e/reader-contract-surface.spec.ts (new) | 1280, one PDF | Exactly one mode control exists for a PDF and switching mode then reloading leaves the stored `viewMode` (`original`/`reading`) unchanged. | modeControl |
| ARCH-7 | e2e/reader-contract-surface.spec.ts (new) | 1280 + 390 | The parked Contents-panel `Notes` entry still exists while More, Header and Footer expose no Notes entry. | — |
| ARCH-8 | e2e/reader-contract-surface.spec.ts (new) | 1280 + 390 | No Print entry exists in Header, Footer or More (count-0 style of pdf-ocr.spec.ts:69). | — |
| CHR-1 | src/reader/ReaderShell.test.tsx (new unit) | stubViewport(390/1280) | Header/Footer overlay the surface with static padding on the scroll container and no reserved strip element at both band widths. | stubViewport |
| CHR-4 | e2e/mobile-chrome.spec.ts (new) | 390 | A freshly opened document shows chrome, and opening More while quiet reveals chrome that then stays revealed. | expectMobileChrome |
| MOB-1 | e2e/reader-footer.spec.ts (new) | 390 quiet | While quiet only reading text is visible: Header, Footer and progress line hidden, text edge to edge. | expectMobileChrome |
| MOB-2 | e2e/reader-footer.spec.ts (new) | 390 + 320 | Footer is one single row of exactly Contents · page number · Markup · More with visible text labels and a hairline top progress line, no % and no zoom. | role/name |
| HDR-1 | e2e/reader-header.spec.ts (new) | 390 + 1280 | Header owns exactly the per-band item sets: mobile Back · title · mode control; desktop the full HDR-1 list. | modeControl |
| HDR-2 | e2e/reader-header.spec.ts (new) | 320 (record §6 width) | Title shows the trimmed, ellipsized document name with the full name in `title` and is not interactive at ≤1023; desktop activation is P2c, label only. | documentItem |
| HDR-3 | e2e/reader-header.spec.ts (new) | 1024 + 1280 | Desktop Header never contains Search, FAB, Notes, Print, Markup-dialog, prev/next, page number or a second mode bar (mobile half tagged in A). | — |
| HDR-4 | e2e/reader-header.spec.ts (new) | 1280 + 390 | Contents opens from Header at ≥1024 and the Footer bar at ≤1023 — never both, never in More — and the panel (Contents + Pages, no Outline tab) opens with an entry that navigates. | — |
| HDR-5 | e2e/reader-header.spec.ts (new) | 1024 + 1280 | Header groups run navigation, mode, tools with separators and tools in the exact order zoom · Contents · Highlight/Underline/Erase · `Aa` · More. | — |
| THEME-1 | e2e/reader-header.spec.ts (new) | 1280 + 390 | `Aa` at ≥1024 and More → Theme at ≤1023 open the same reading-settings dialog (same accessible name). | — |
| FTR-1 | e2e/reader-footer.spec.ts (new) | 1280 | Desktop Footer owns exactly the location button and thin progress line, no % and no prev/next; OCR-active status → P4 (mobile half tagged in A). | — |
| FTR-4 | e2e/reader-footer.spec.ts (new) | 390 + 1280 | Every Header/Footer-opened surface (Contents, Go to location, Markup palette) is a panel/dialog and only More has menu semantics. | — |
| FTR-5 | e2e/reader-footer.spec.ts (new) | 320 | Footer scrollWidth never exceeds its clientWidth. | — |
| MORE-2 | e2e/reader-more.spec.ts (new) | 320 + 390 | More lists exactly Document · Theme · Languages · Click lookup in order (OCR row deferred to P4); desktop half lands in C4. | — |
| MORE-3 | e2e/reader-more.spec.ts (new) | 390 + 1280 | Context, Notes, Markup, Contents and separate Appearance/Fonts rows are absent from More at both bands. | — |
| MORE-5 | e2e/reader-more.spec.ts (new; or extend mobile-chrome:528 per Fact §4) | 320 | At 320 the More sheet fits ≤70dvh with 8px insets, scrolls internally, has no horizontal overflow and dismisses with focus returned. | — |
| MODE-3 | e2e/reader-contract-surface.spec.ts (new) | 1280, Text ⇄ PDF | After `togglePdfMode`, Header and Footer expose the same control names, order and spacing in both modes except page-location and scale. | togglePdfMode, waitForReaderSurface |
| GEO-6 | e2e/mobile-chrome.spec.ts (new) | 320 + 844×390 | Scrolled to the document end, the last readable line clears the Footer (bottom padding inside the scroller). | — |
| A11Y-1 | e2e/reader-chrome-a11y.spec.ts (new) | 390 + 1280 | Every chrome control is keyboard reachable and operable in pointer-free order, trapping focus only while an overlay is open. | — |
| A11Y-2 | e2e/reader-chrome-a11y.spec.ts (new) | 390 + 1280 | Every chrome control has a non-empty accessible name independent of icon/position/colour and the More trigger exposes expanded/collapsed. | — |
| A11Y-4 | e2e/reader-chrome-a11y.spec.ts (new) | 390 + 1280 | Every chrome function works by keyboard alone — none hover-, drag- or gesture-only (include the Click lookup toggle). | — |

MORE-6 lands in C3 (pdf-click-mobile rewrite). FTR-1, HDR-3 and ARCH-7 get both halves — record A and B
`file:line`s in the coverage table.

 `modeControl`); reader-p0.spec.ts:10,20,22,28; vocabulary-reader-flow.spec.ts:30,46;
  pdf-desktop-horizontal-scroll.spec.ts:28; pdf-click-mobile.spec.ts:15 (inside C3). Retitle “Original
  PDF …” titles: pdf-original-native-dpr:4, pdf-original-resolution:6, pdf-desktop-horizontal-scroll:21.
  Update behavior comments: mobile-chrome.spec.ts:56,73,509; reader-contract-surface.spec.ts:31;
  PdfModeSwitch.tsx:14–15 header comment.
- **C2 deleted-control propagation (Fact §5b)** — Next/Previous → `openGoToLocation` + spinbutton + `Go`:
  pdf-ocr.spec.ts:72,74,108,123,126; pdf-real-samples.spec.ts:32; pdf-stability.spec.ts:33,40,196,205.
  Notes chrome entries (pdf-ocr.spec.ts:133–134) → surviving Contents-panel `Notes` or Context-panel
  `Open notes`. Old More presence list pdf-original-first-render-footer.spec.ts:102 → new mobile MORE-2
  order. pdf-stability.spec.ts:178,189 zoom loops: keep only if desktop (stepper survives ≥1024);
  if they target the removed mobile stepper, delete and record.
- **C3 MORE-6** — pdf-click-mobile.spec.ts: drop `test.fixme` (QUARANTINED T0c), rewrite on role/name
  helpers with real input at a stable viewport, tag `@MORE-6` (+`@pdf`): the default-on Click lookup
  toggle works in a PDF under quiet chrome. Still red after the step-2 geometry → report the root
  cause, do not weaken (task §3.8).
- **C4 stale-spec migrations (Fact §5c/§5d)** — reader-more-desktop-text.spec.ts: replace :36 presence
  list with the exact desktop MORE-2 order (`Document · Languages · Click lookup`, OCR row P4), retitle
  away from the removed §9.3 inventory, tag `@MORE-2`. ui-interactions.spec.ts:~258 `reader shell at
  ${width}px`: rewrite on current surfaces (Contents from its Footer/Header trigger, `Theme` from More,
  Context via Lookup “Show more”, panel `Open notes` valid — Step 6 parked; `moreAction('Contents'|
  'Context'|'Text')` no longer exists). Run ui-interactions.spec.ts:~234 signal spec (320–430) and record
  the verdict for the report (fixed by the new Contents placement?); never weaken it.
- **C5 deletions (record each with the removed contract it asserted)** — e2e/pdf-mobile-zoom.spec.ts
  whole file (removed mobile Footer zoom stepper); mobile-chrome.spec.ts:413 (zoom clause vacuous at
  mobile; INP-1 stays via :344/:440 + :258); pdf-original-first-render-footer.spec.ts:46–59 (same
  stepper claim; file survives, :102 migrated in C2).
- **C6 dead code (change-propagation)** — remove `contextItem` (e2e/readerNames.ts:66: no callers, More
  `Context` row removed by MORE-3, comment mis-cites BACK-1) plus any selectors/tags C1–C5 orphan.
## C — Stale-spec migrations and deletions

- **C1 mode-label rename (Fact §5a)** — replace old EN mode names via `modeControl`: pdf-ocr.spec.ts:
  54,102,110,161,199,203,229; pdf-stability.spec.ts:8,9,32,35,38,40,203,227,228,265; pdf-real-samples.spec.ts:
  31,34,37,70,94,97; pdf-original-first-render-footer.spec.ts:21,50; pdf-original-native-dpr.spec.ts:9;
  pdf-original-natural-scale.spec.ts:10,55; pdf-original-resolution.spec.ts:9; pdf-zoom-actual-scale.spec.ts:
  19,60,99 (local helper →
## V — Verification (per batch)

- Checkpoint gate: `npm run check:css` → `verify:reader` → `verify:pdf` → `verify:ui`; final checkpoint
  also `verify:storage`, `verify:fast`, `verify:full` (Fact §7, task §6).
- Targeted e2e only, Windows rules per [handoff](./2026-10-08-p2b-chrome-in-flight-handoff.md)
  §VERIFICATION: `npx playwright test <spec> --config playwright.tiers.config.ts`, `PW_REUSE_SERVER=0`,
  `--strictPort`, one server, sequential; stash output with `| Out-File -Encoding ascii <log>` (never
  `>`) and check `$LASTEXITCODE`.
- A: verify:reader + run mobile-chrome, pdf-zoom-footer, reader-contract-surface. B: verify:reader +
  every new/extended spec in the B table. C: verify:pdf + verify:ui + run every touched spec (heavy
  specs targeted, never a full tier) + signal-spec run. Final: task §6 gate with all rule-ID specs at
  320, 390, 767, 768, 1023, 1024, 844×390, 915×412, 1280×800; mark PASS/FAIL/BLOCKED/NOT RUN.

## Commit plan

- Commit after each green checkpoint, staging only Step 8 files (Fact §8.6 untracked files stay):
  `P2b step 8: tag existing tests with rule IDs` → `P2b step 8: add tests for uncovered rule rows` →
  `P2b step 8: migrate stale specs to the Text/PDF chrome` (split C5 deletions into a second commit if
  large). Trailer: `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.

## Stop conditions

- Never weaken an assertion to go green.
- A spec asserting a removed contract is deleted and recorded in the C5 list — not investigated.
- A surviving-behavior spec that fails is a real bug: fix the code (edit tool for TypeScript) and report
  it in the checkpoint.
- Anything else red: stop, do not guess — write a compact failure packet (fact, repro command, output
  tail) to `docs/tasks/2026-10-08-p2b-step8-failure-packet.md` and return to a fresh Planner.

## Final deliverable (hand to the Verifier)

- Coverage-table source: rule → `file:line` for all 32 rows (A tags, B/C tests, both halves for FTR-1,
  HDR-3, ARCH-7, MORE-2); empty rows only for the phase exceptions in Fact §2.
- Deleted-specs list: the three C5 entries plus anything else deleted, each naming the removed contract
  it asserted.
- Run logs: `docs/tasks/runs/2026-10-08-p2b-step8-{a,b,c,final}.log` and Playwright JSON
  `tmp/pw-results-*.json`.
- Report inputs: Step 6 parked note (Fact §6), signal-spec verdict (Fact §5d); §6 measurements
  (title width, Footer clearance, quiet-at-390, `Aa ···` offset) are the Verifier's to record.
