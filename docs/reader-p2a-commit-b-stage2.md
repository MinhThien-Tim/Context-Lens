# P2a, commit B — Stage 2 (execute the amended Stage 1 table)

Base: `reader-p2a-commit-b-task.md` (same GOAL, SCOPE, DEPENDENCIES, VERIFICATION, REPORT). The Stage 1 table is **approved with the amendments below**. Where an amendment contradicts a Stage 1 row, the amendment wins. Do not use interactive question tools; if blocked, stop and report.

Definitions (clarified): **DELETE** = remove the test. **KEEP** = leave the test, only its names or openers go through helpers. **REWRITE** = same test, retagged or with legacy assertions removed. **LEAVE OUT (untouched)** = out-of-scope spec row, no edit. **LEAVE OUT (not committed)** = a rewritten or new test that fails on the current UI: do not commit it red and do not weaken it; record assertion, cause and screenshot path.

Mixed tests: if a test mixes a surviving assertion with a legacy one, REWRITE it: remove only the legacy assertion, keep the rest, and list each removed assertion in the report with the contract rule that retired it.

## Amendments

**`e2e/pdf-zoom-footer.spec.ts`**
- "PDF page navigation is owned by the Header alone at 1280px": DELETE (it passes and asserts an ownership NAV-1 removes). It was wrongly LEAVE OUT.
- "the Header Current PDF page button opens Go to location at 1280px": KEEP, opener through a new helper `openGoToLocation(page)`; untagged (NAV-1 is P2b).
- "the Footer Current PDF page button opens Go to location at 390px": **KEEP, not DELETE.** NAV-1 keeps the Footer location button at every band; this behavior survives. The Stage 1 reason was wrong. Untagged until P2b.
- "PDF page navigation is owned by the Footer alone at 390px": DELETE (asserts previous/next buttons).
- Mobile Footer zoom stepper and "zoom host exactly once at 390px": DELETE. Desktop Header zoom ×10: REWRITE, tag FTR-2.

**`e2e/mobile-chrome.spec.ts`** (expand the grouped rows into one row per title in the report, then apply the mixed-test rule)
- "presents and stays usable at {7 sizes}": REWRITE, drop the inventory assertion, tag MORE-1 and ARCH-6. Never tag MORE-3.
- "More exposes exactly the eight §9.3 items, in order": DELETE (legacy inventory).
- "OCR next lives only in the document-tools surface": KEEP untouched except the More-item name through a helper. No MORE-3 tag (OCR next retires in P4).
- "real user scroll quiets the Header while the Footer stays visible": REWRITE, keep the Header quiet/reveal assertions (INP-1, INP-2, CHR-2), remove only "Footer stays visible" (retired by MOB-1).
- "every Footer control meets the 44px hit target": REWRITE, tag ARCH-6, iterate whatever controls the Footer has (by role) so the inventory change does not break it. Not A11Y-3.
- "Footer band is reserved in both states": DELETE. "mobile Footer owns a direct zoom stepper": DELETE. "progress and location owned by the Footer": untouched.

**`e2e/ui-interactions.spec.ts`**
- "phase 3 context Quick and Full at {5 widths}" (10 failures): **LEAVE OUT (untouched), not DELETE.** Quick and Full are current lookup UI, not retired; the failure (timeout on `.selection-actions`) is a pre-existing lookup-spec bug for its own task.
- "desktop Quick stays contained…": REWRITE, tag LOOK-1; the reason "Quick name retired" is wrong, the only legacy part is the density opener. Cover EN, VI and EN+VI glosses.
- The 1366px lookup failure is a **lookup layout bug**: the compact language button is 192px wide against a 72px expectation (`ui-interactions.spec.ts:75`). `.entry-glosses` (LOOK-1) passes. Report it as its own bug; do not commit it red.

**Other specs**
- `e2e/spike-overlay-o.spec.ts`: **DELETE the whole spec** (a feasibility spike for the retired reserved-footer overlay model; superseded by `pdf-reader-chrome-a12` and the P2b tests). Keep `e2e/readerO.ts`; renaming it is P7.
- `e2e/pdf-click-mobile.spec.ts`: LEAVE OUT (untouched), cause: blocked by the known PDF viewport shift during quiet (separate task). **MORE-6 therefore has no row in this commit**; remove the mapping to the unrelated 320px lookup test.
- `e2e/homepage.spec.ts`: "switching density in reader preserves reading position" DELETE (asserts retired density switching and the Footer percentage). All other titles untouched. **Home guard:** "homepage utilities remain operable" (it opens the Language engines dialog) stays and must pass. Home keeps its Settings entry that opens Language engines; do not edit `homepage.spec.ts:46` or the dialog name.
- `e2e/pdf-reader-chrome-a12.spec.ts`: **add to scope.** It was not run in Stage 1. Run it at the tip, then tag its existing assertions GEO-2…GEO-5 (and CHR-2 where it applies) without changing them.
- `src/reader/ReaderShell.test.tsx`: approved as classified, except "OCR next lives only in the document-tools surface…" is KEEP with no MORE-3 tag. "closes the focused Context panel on Escape…": tag BACK-1 (overlay half) and A11Y-3.
- `pdf-mobile-chrome-space` ×2 and `pdf-mode-layout` ×1 (`test.fixme`, synthetic chrome): DELETE as classified.

**New tests approved (4)**: ARCH-5 (FAB, Search, Form Fill absent at both bands), MODE-1 (Text ⇄ PDF leaves content, page identity and geometry unchanged), MODE-2 (mode control disabled with a perceivable state when no readable text), FTR-3 desktop half (Highlight, Underline, Erase present in the Header group, not a dialog button). Names go through helpers.

**Coverage map corrections.** Remove every MORE-3 mapping (P2b rule). MORE-6: none. A11Y-3 only on focus-return and keyboard-menu tests. ARCH-6 added. The report's rule-to-test table must list what remains after these corrections and flag any rule with no row.

**Helpers.** `setInterfaceMode(page, density)` keeps its density parameter in this commit (the UI still has both modes; P2b removes the parameter). Use density iteration only where the test is about density; otherwise one default. Every renamed-in-P2b name (mode labels, More item "Document", Go to location opener, Context entry) lives in exactly one helper.

**Docs.** Besides repointing citations of deleted docs: (1) replace `docs/reader-redesign-phases.md` with the supplied file (it adds the Home Language-engines guard to P2b and P6); (2) confirm `docs/ui-system.md` Homepage section still says the brand-header Settings opens the Language engines dialog, and run `git grep -n -i "language engines" -- docs ':!docs/tasks' ':!docs/archive'`: it must return at least that Home mention, not any Reader More item. If the earlier purge removed it, restore it; (3) update the disposition table in `docs/pdf-ocr-controls.md` to match what you did.

## Commits

1. Deletions, docs repoints, `phases.md` replacement, disposition table.
2. Rewrites, tags, helpers, the four new tests, and the `pdf-reader-chrome-a12` tags.

Stage 2 verification and report are those of the base task, plus: the expanded per-title table for `mobile-chrome` and the amended rows, and raw output of the Language-engines grep.
