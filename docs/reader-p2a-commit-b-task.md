# P2a, commit B — Test foundation (tests only)

Two stages. **Stage 1 changes no file and ends with a classification table for the owner to approve. Stage 2 starts only after that approval.**

## GOAL

Every contract rule that is already true in the current code has a test tagged with its rule ID; specs that assert only the replaced chrome are deleted; specs that exercise surviving behavior are rewritten on role and accessible-name helpers. No change under `src/` except test files and test helpers; no UI, CSS or copy change.

## CURRENT CONTRACT

Branch `rebuild/reader-v2`, tip `c25b87b`. The code is still the legacy chrome. `docs/reader-behavior-contract.md` v2 is the authority.

Rules to cover now (true in current code):
- ARCH-1 (1024px boundary), ARCH-5 (FAB, Search, Form Fill absent; the Context-panel-entry half waits for P2b)
- CHR-2 (`scrollTop`, page identity and location unchanged by quiet/reveal; geometry only for surfaces where it holds today), CHR-3, CHR-4
- INP-1, INP-2, INP-3, INP-4 (reveal-only control, name "Show reading controls", keyboard operable; its bottom-right position waits for P2b)
- BACK-1 (overlay closes before leaving the document; history ownership is open item 1, do not test it)
- MORE-1, MORE-5, MORE-6 (Click lookup works in PDF under quiet chrome), A11Y-3
- MODE-1, MODE-2
- GEO-2, GEO-3, GEO-4, GEO-5; GEO-1 only where it holds today
- LOOK-1 (`.lookup-sheet .entry-glosses` visible for EN, VI, EN+VI; this is regression B, cause unknown)
- FTR-2 desktop half (Header zoom decrease/level/increase) and FTR-3 desktop half (Highlight/Underline/Erase group)

Not yet true, so **not tested in this commit**: HDR-*, FTR-1, FTR-4, FTR-5, NAV-1, MOB-*, THEME-1, MORE-2/3/4, ZOOM-2, FILE-1, ARCH-2/3/7/8, CHR-1, GEO-6, APP-*, OCR-*, LOOK-2/3.

Closed decisions and open items are unchanged and not re-tested.

## SCOPE

In: chrome-related specs and helpers: `src/reader/ReaderShell.test.tsx`, and in `e2e/` the specs that match the retired labels or the rules above (start from `ui-interactions`, `mobile-chrome`, `spike-overlay-o`, `pdf-mobile-chrome-space`, `pdf-mode-layout`, `pdf-click-mobile`, `pdf-zoom-footer`, `homepage`); the disposition table in `docs/pdf-ocr-controls.md` (§ listing e2e specs) and any `docs/testing.md` or `docs/verification-map.md` row that names a deleted or renamed spec.

Out: any other spec; lookup, OCR or storage specs (except LOOK-1); UI code; fixing failures.

## DEPENDENCIES

Trace from every deleted or renamed test outward: shared helpers, selectors, titles, `@tag`s, docs that cite the spec, `verify:*` script maps. Follow the repo's existing `@tag` convention (see `docs/testing.md`); the tag is the rule ID.

## IMPLEMENTATION

**Stage 1 — inventory (read-only, then STOP).**
1. Run each in-scope spec once at the current tip, sequentially (`PW_REUSE_SERVER=0`, `--strictPort`, one server at a time), and record PASS or FAIL per test. A test absent from the failure list is not a pass.
2. Produce one table, one row per test: spec file · test title · result at tip · decision · rule ID(s) · reason.
   Decisions, by one rule only:
   - **DELETE** — the test's subject is a removed label, selector or ownership (Reading/Original names, Document tools label, Header Notes/Markup-dialog/Print, Header previous/next and page count, mobile Footer zoom host or stepper, More items Context/Notes/Markup/Contents, Header-owned Go to location opener).
   - **REWRITE** — the subject is surviving behavior but it operates a control through a legacy name or opener: move the name or opener into one shared helper function (no Page Object classes) so P2b changes one place; keep the assertion.
   - **KEEP** — already role/name based and tagged or taggable.
   - **LEAVE OUT** — a rewritten test would fail on the current UI. Do not commit it red, do not weaken it; record the assertion and the cause (real bug, or P2b-owned such as Original-PDF geometry).
3. List, per rule ID in CURRENT CONTRACT, which rows will carry it; flag any rule with no row.
4. List the helper functions you would add or change.
STOP and report. Do not edit any file in Stage 1.

**Stage 2 — execute the approved table.** Two commits: (1) deletions and docs table; (2) rewrites, tags and helpers. No `test.fixme` or `test.skip` as migration strategy. `e2e/pdf-zoom-footer.spec.ts`: decide by the DELETE rule (delete if it only asserts the mobile Footer zoom host or stepper; retarget any desktop Header zoom coverage into a Header-zoom test tagged FTR-2).

## VERIFICATION

- `npm run verify:fast`, then every rewritten or kept spec, sequentially, at the contract matrix: 320, 390, 767, 768, 1023, 1024, 844×390, 915×412, 1280×800 (parametrize; do not copy tests).
- Tag coverage: `git grep -n -E "@(ARCH|CHR|INP|BACK|MORE|MODE|GEO|A11Y|LOOK|FTR)-[0-9]+" -- e2e src` shows every rule in CURRENT CONTRACT on at least one passing test.
- Stale references: no deleted test title, helper or spec name remains in `docs/`, `e2e/` or `src/` (git grep each).
- Mark each result PASS / FAIL / BLOCKED / NOT RUN and paste raw command output.

## REPORT

Stage 1: the classification table and the helper list only.
Stage 2: Phase report and Cleanup report (`docs/task-template.md`), the rule-to-test mapping, every LEAVE OUT row with its cause, and any pre-existing failure left in specs outside this scope. LOOK-1 is expected to be the one most likely left out: if it fails, report the failing assertion and screenshot path; it becomes its own bug task, not part of P2.
