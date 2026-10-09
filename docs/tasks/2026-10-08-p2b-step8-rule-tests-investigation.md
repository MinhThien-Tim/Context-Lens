# P2b Step 8 investigation — rule-ID tests and stale-spec migration (Fact Report)

Role: Investigator (read-only). Date: 2026-10-08. Branch `rebuild/reader-v2` @ `4995c1d`.
No source file was modified in this investigation.

Scope: task [p2b-chrome-and-interface-mode.md](./p2b-chrome-and-interface-mode.md) §3.8 (one test per
rule ID) plus the stale-spec migrations required by the rename/deletion work already committed.
§3.9 (stale-reference search with recorded raw output) is a separate later step and is **not** part
of this report's evidence.

Rule text: [reader-behavior-contract.md](../reader-behavior-contract.md). Test-group map:
[reader-chrome.md](../reader-chrome.md) §8. Helpers: [readerNames.ts](../../e2e/readerNames.ts)
(`modeLabels`/`modeControl`, `documentItem`, `openGoToLocation`, …), `togglePdfMode` at
[e2e/readerO.ts](../../e2e/readerO.ts) line 221. Unit home: [ReaderShell.test.tsx](../../src/reader/ReaderShell.test.tsx)
with `stubViewport(width)` at line 16.

## 1. Tag inventory at HEAD

Grep `@[A-Z]+-\d` over `*.{ts,tsx}`: 25 occurrences in 8 files.

| Tag | Count | Locations |
| --- | --- | --- |
| `@MORE-1` `@ARCH-6` | 1+2 | mobile-chrome.spec.ts:69, :618 |
| `@INP-1` `@INP-2` `@CHR-2` | 1+2+2 | mobile-chrome.spec.ts:187, :201; pdf-reader-chrome-a12.spec.ts:83 |
| `@ARCH-2` `@ARCH-4` | 4+1 | src/db/database.test.ts:159,163,171,175,188 |
| `@GEO-1…5` | 4/3/2/1/1 | pdf-reader-chrome-a12.spec.ts:83,90,104,115,131,154 |
| `@FTR-2` | 1 | pdf-zoom-footer.spec.ts:14 |
| `@FTR-3` `@A11Y-3` | 3 (2+1 spec) | markup-interactions.spec.ts:6; reader-contract-surface.spec.ts:171,201 |
| `@ARCH-5` `@MODE-1` `@MODE-2` | 1+1+1 | reader-contract-surface.spec.ts:53,95,137 |
| `@LOOK-1` | 1 | ui-interactions.spec.ts:3 |
| `@BACK-1` `@A11Y-3` | 1 (+unit :113,:123) | ReaderShell.test.tsx:113,123 |

## 2. Rows with no test (32 rows — the Step 8 work list)

`ARCH-1, ARCH-3, ARCH-7, ARCH-8, CHR-1, CHR-3, CHR-4, INP-3, INP-4, MOB-1, MOB-2, MOB-3,
HDR-1, HDR-2, HDR-3, HDR-4, HDR-5, FTR-1, FTR-4, FTR-5, NAV-1, THEME-1, MORE-2, MORE-3,
MORE-4, MORE-5, MORE-6, MODE-3, GEO-6, A11Y-1, A11Y-2, A11Y-4`.

Rows already carried by an existing test are §1; `LOOK-2/3` → P5, `ZOOM-2` → Z2, `FILE-1` → P2c,
`APP-*` → P3, `OCR-*` → P4 (these are the only allowed empty rows in the §6 coverage table).

## 3. Existing tests that already assert a missing row (tag-only candidates)

Titles verified at HEAD; the tag goes on the test whose assertions already match the rule.

| Rule(s) | Candidate |
| --- | --- |
| ARCH-1, CHR-3 | [ReaderShell.test.tsx](../../src/reader/ReaderShell.test.tsx):56 “1024px is the sole responsive authority…”; mobile-chrome.spec.ts:113 |
| CHR-2 (already tagged in e2e), MOB-3 | ReaderShell.test.tsx:47 accumulated-travel quiet/reveal; mobile-chrome.spec.ts:215 (small correction does not reveal), :229 (touch ≡ wheel) |
| MOB-3 (tap never toggles), INP-4 | ReaderShell.test.tsx:80 (tap never drives chrome, reveal-only escape); mobile-chrome.spec.ts:258 (tap does not toggle), :279 (one-way reveal), :305 (320 + landscape) |
| INP-3 | ReaderShell.test.tsx:94 focus reveal; mobile-chrome.spec.ts:322 |
| INP-1/2 (extend), MODE-1 | mobile-chrome.spec.ts:344 (page jump), :388 (mode switch), :440 (More scroll) |
| MORE-1 (extend), MORE-4 | mobile-chrome.spec.ts:506 (exactly one trigger per band), :528 (sheet at every band, Escape) |
| FTR-1 | mobile-chrome.spec.ts:654 “progress and location are owned by the Footer at every mobile width” |
| NAV-1 | pdf-zoom-footer.spec.ts:92 and :109 — comment at :90 says “Untagged: NAV-1 … P2b”; both assert `Current PDF page` → `Go to location` at 1280/390 |
| ARCH-7 | reader-contract-surface.spec.ts:~220 (palette offers no Note entry, comment cites ARCH-7) |
| HDR-3 | mobile-chrome.spec.ts:69 header-absence loop (lines 73–76) |
| A11Y-3 | markup-interactions.spec.ts:6 already `@FTR-3` (add `@A11Y-3`? no — FTR-3 focus-return half already tagged in reader-contract:201; do not double-tag) |

## 4. Rows needing new tests (suggested home per reader-chrome.md §8)

| Rule | Suggested placement |
| --- | --- |
| HDR-1, HDR-3, HDR-5 | new e2e, desktop 1024/1280: Header item sets per band, HDR-5 group order + separators (helpers in readerNames.ts) |
| HDR-2, HDR-4 | new e2e: mobile Header = Back · title · Text\|PDF (title ellipsis at 320, both fonts); desktop Contents icon opens the panel |
| MOB-1 | new e2e or unit: quiet shows text only at 390 |
| MOB-2 | new e2e: Footer bar = Contents · page number · Markup · More, visible text labels, hairline progress, no %, no zoom (390 + 320) |
| FTR-1 | tag mobile-chrome:654 (mobile) **plus** desktop half (page number + progress + OCR status) — FTR-1 is both bands |
| FTR-4, FTR-5 | new e2e: Header/Footer surfaces are panels (More is the only menu); Footer never overflows horizontally (scrollWidth check at 320) |
| NAV-1 | tag pdf-zoom-footer:92/:109 (both bands, no prev/next, no second copy — :109 already asserts count 1) |
| THEME-1 | new e2e: Aa ≥1024 opens Reader settings, More→Theme ≤1023 opens the same dialog |
| MORE-2 | new e2e: exact inventory in order — mobile `Document · Theme · Languages · Click lookup`, desktop `Document · Languages · Click lookup` (OCR row deferred to P4); replace the stale list in reader-more-desktop-text.spec.ts:36 |
| MORE-3 | new e2e: Context/Notes/Markup/Contents/Fonts rows absent from More (absence assertions) |
| MORE-5 | extend mobile-chrome:528 or new: 320 sheet ≤70dvh, internal scroll, Escape, focus return |
| MORE-6 | rewrite [pdf-click-mobile.spec.ts](../../e2e/pdf-click-mobile.spec.ts) on real input (currently `test.fixme` “QUARANTINED (T0c)”), stable viewport, carry `@MORE-6` |
| MODE-3 | new e2e or unit: Text and PDF share chrome vocabulary |
| GEO-6 | new e2e in pdf-reader-chrome-a12 or mobile-chrome: last line clears the Footer at 320 and 844×390 (§6 report needs this evidence anyway) |
| A11Y-1, A11Y-2, A11Y-4 | new unit (ReaderShell) or e2e: keyboard reachability of chrome; accessible names; no gesture-only function |
| ARCH-1 | tag ReaderShell:56 |
| ARCH-3 | new e2e/unit: one `Text \| PDF` control, PDF only, `viewMode` values persisted unchanged (modeControl helper) |
| ARCH-7 | tag reader-contract:~220 note-absence + Contents-panel Notes entry exists (Step 6 parked — see §6) |
| ARCH-8 | new test: no Print entry anywhere (deletion lock, same style as `.pdf-toolbar` count 0 at pdf-ocr:69) |
| CHR-1, CHR-3 | tag ReaderShell:56 for CHR-3; CHR-1 (no reserved band — header/footer overlay, static padding inside scroller) new unit/e2e geometry assert |
| MODE-3 | see above |

## 5. Stale references verified at HEAD

### 5a. Mode-label rename (`Original`/`Reading` → `Text`/`PDF`)

[ PdfModeSwitch.tsx ](../../src/reader/pdf/PdfModeSwitch.tsx) renders `Text`/`PDF` (EN) and
`Trang gốc`/`Đọc chữ` (VI) — the rename is live. Specs still clicking the old EN names will time out:

- pdf-ocr.spec.ts:54,102,110,161,199,203,229
- pdf-stability.spec.ts:8,9,32,35,38,40,203,227,228,265
- pdf-real-samples.spec.ts:31,34,37,70,94,97
- pdf-original-first-render-footer.spec.ts:21,50; pdf-original-native-dpr.spec.ts:9;
  pdf-original-natural-scale.spec.ts:10,55; pdf-original-resolution.spec.ts:9
- pdf-zoom-actual-scale.spec.ts:19,60,99 (local helper); reader-p0.spec.ts:10,20,22,28;
  vocabulary-reader-flow.spec.ts:30,46; pdf-desktop-horizontal-scroll.spec.ts:28
- pdf-click-mobile.spec.ts:15 (inside the fixme rewrite anyway)
- Title wording “Original PDF …” in pdf-original-native-dpr:4, pdf-original-resolution:6,
  pdf-desktop-horizontal-scroll:21 — decide: these name the *view*, retitle to the new label.
- Comments only (update where they state current behavior): mobile-chrome.spec.ts:56,73,509;
  reader-contract-surface.spec.ts:31; PdfModeSwitch.tsx:14–15 header comment still says
  “Original/Reading is the single PDF presentation control”.
- The helpers are the sanctioned single home: `modeControl(page,'text'|'pdf')` — several specs
  already route through it (pdf-zoom-footer, reader-contract-surface via `openOriginalPdf`).

### 5b. Deleted controls referenced by specs

- **`Next page` / `Previous page`**: zero matches in `src/` — deleted per HDR/FTR rules.
  Broken references: pdf-ocr.spec.ts:72,74,108,123,126; pdf-real-samples.spec.ts:32;
  pdf-stability.spec.ts:33,40,196,205. Migration: `openGoToLocation` + spinbutton + `Go` (NAV-1).
- **Mobile Footer zoom stepper deleted** (reader-chrome §5, Z2 later):
  - pdf-mobile-zoom.spec.ts — whole file asserts the removed stepper (`Zoom out` inside `footer`
    at ≤1023, line 44; geometry + resize targets). Spec asserts a removed contract → **delete**,
    record the rule it asserted.
  - pdf-original-first-render-footer.spec.ts:46–59 test “mobile Footer keeps a direct zoom
    stepper operable down to 320px” → **delete that test** (rest of file survives, migrate :102).
  - mobile-chrome.spec.ts:413 test “a zoom change does not drive chrome state (§5.1/§8.2)” runs at
    390×900 and clicks Footer `Zoom in`/`Zoom out` → subject removed; INP-1 zoom clause becomes
    vacuous at mobile → **delete** and keep :344/:388/:440 + :258 for INP-1 (report it).
  - pdf-stability.spec.ts:178,189 `Zoom in`/`Zoom out` loops — check band; desktop stepper survives.
- **Old More inventory** (presence form — migrate; absence form — deletion lock, keep):
  - reader-more-desktop-text.spec.ts:36 `['Contents','Context','Notes','Markup','Text','Languages','Document','Click lookup']`
    presence assertion → new desktop MORE-2 order.
  - pdf-original-first-render-footer.spec.ts:102 same 8-item presence loop → new mobile MORE-2 order.
  - mobile-chrome.spec.ts:76 absence loop (Header) — keep (absence guards survive renames as locks).
- **Notes chrome entries removed, but Step 6 is parked (see §6)**: pdf-ocr.spec.ts:133–134
  (`Reader menu → menuitem Notes`, else Header `Notes` button) — both entries are gone; migrate to
  the surviving Contents-panel `Notes` button (ContentsPanel.tsx:27) or the Context-panel
  `Open notes` button (ContextPanel.tsx:12, reachable only from Lookup “Show more”).
- **Dead helper**: `contextItem` in readerNames.ts:66 — no callers, and the More `Context` entry it
  documents no longer exists (MORE-3); its doc comment also mis-cites BACK-1. Remove per
  change-propagation (no dead helpers for removed UI entries).

### 5c. Named stale specs from the task

- reader-more-desktop-text.spec.ts — see 5b (also test titles cite removed `§9.3` inventory).
- ui-interactions.spec.ts:~258 `reader shell at ${width}px` — `moreAction('Contents')`,
  `moreAction('Context')`, `moreAction('Text')`, `Open notes` (panel button, still valid — Step 6
  parked). More has no Contents/Context/Text items now → rewrite against the current surfaces
  (Contents via Footer/Header trigger; Theme; Context via Lookup “Show more” if kept).
- pdf-click-mobile.spec.ts — `test.fixme` rewrite (T0c) on real input, `@MORE-6` (see §4).

### 5d. Signal spec

ui-interactions.spec.ts:~234 `reading controls remain reachable at ${width}px` (320–430) already
asserts the **new** contract (Footer `Contents` visible, Markup palette, `Theme` menuitem with a
MORE-2 comment) — it was rewritten for P2b. Task §5 states it failed 8× at HEAD *before* the new
Footer placement; the verdict “fixed by the new Contents placement” requires a run of this spec in
the Verifier stage. Do not weaken it either way.

## 6. Step 6 parked — do not touch

Per the user, Step 6 (removing the Contents-panel Notes action) was **left in place**. Keep:
ContentsPanel.tsx:27 `Notes` button + `onNotes` (App.tsx:613), ContextPanel.tsx:12 `Open notes`,
NotesPanel, notes store, selection Note action. ARCH-7 tagging in §3/§4 must not assume Step 6 ran;
saved notes keep their interim entry via the Contents panel. State this in the Phase report.

## 7. Verification commands

- Unit gate: `npm run check:css` → `npm run verify:reader` → `npm run verify:pdf` →
  `npm run verify:ui` (+ `verify:storage`, `verify:fast`, `verify:full` at the final gate).
- E2e: `npx playwright test <spec> --config playwright.tiers.config.ts` per tier; Windows rules from
  [2026-10-08-p2b-chrome-in-flight-handoff.md](./2026-10-08-p2b-chrome-in-flight-handoff.md):
  one server, `PW_REUSE_SERVER=0`, `--strictPort`, sequential, no `>` redirects
  (`Out-File -Encoding ascii`), edit TypeScript only with the edit tool.
- Gate viewports (task §6): 320, 390, 767, 768, 1023, 1024, 844×390, 915×412, 1280×800.
- Rule-ID coverage table must have no empty rows except `LOOK-2/3` (+ the P-phase exceptions in §2).

## 8. Known risks / open questions for the Implementer

1. The rename/deletion propagation in §5a/5b touches ~14 spec files; it is mandatory (change rules:
   rename → every reference), but heavy specs (`@heavy`, 240 s) should be run targeted, not in full.
2. Signal spec (§5d) verdict needs a run; expected green with the new Footer — if red, it is a real
   bug in the new placement, fix code, do not weaken.
3. Which e2e specs are in the “rule-ID specs” gate set is decided by the task: every rule row in §2
   must map to `file:line` in the report table.
4. pdf-mobile-zoom deletion and mobile-chrome:413 deletion must appear in the report's
   “spec deleted + removed rule it asserted” list (task §7).
5. Deferred, do not fix here: 1366px language-button width, `phase 3 context` ×10,
   `wordnet.test.ts` flake (P5), lookup copy, pinch (Z2), Back ownership (P5), File switcher (P2c).
6. Working tree at HEAD already carries unrelated untracked docs (`docs/audits/`, handoff, task file,
   `e2e/fixtures/sample/`, `tools/`) and a modified session-summary doc — leave them as they are.
