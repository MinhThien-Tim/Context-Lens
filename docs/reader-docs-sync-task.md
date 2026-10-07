# P2a, commit A — Docs sync (docs only)

## GOAL

Every Reader doc in `docs/` agrees with `reader-behavior-contract.md` v2 and with the others, says truthfully which parts the code does not yet implement (phase tags), and contains no retired vocabulary. No code or test changes in this commit.

## CURRENT CONTRACT

Branch `rebuild/reader-v2`, tip `4ac6b87`. The code still has the legacy chrome (`interfaceMode`, Notes/Markup/Print buttons, Footer zoom and percentage on mobile). The docs describe the approved target; every passage not yet true in code carries **[P2b]**, **[P2c]**, **[P3]**, **[P4]** or **[Z2]**.

Closed decisions (do not reopen; they are recorded in contract §8):
- Notes is not a chrome action (ARCH-7).
- OCR never starts on its own beyond the first-12 local preload; a run starts only from an explicit user action and then continues through 12-page windows (OCR-1, OCR-2).
- The Contents panel offers Contents and Pages. No Outline tab, no clock icon.
- `Aa ···` sits bottom-right inside the safe-area inset (exact offset recorded in P2b).
- Mobile Footer items carry visible text labels.
- One font setting drives reading and interface (APP-3).
- Review-board directions A and C are the Light and Dark presentation of APP-2; B is not adopted.

Open (do not close, do not decide): Back history owner (P5), terminal-success OCR state (P4), Z1 results (Z2), fate of the Book/News/Academic presets (P3).

## SCOPE

In:
1. Replace in `docs/` with the supplied files: `reader-behavior-contract.md`, `reader-chrome.md`, `reader-redesign-phases.md`, `reader-redesign-session-summary.md`.
2. Apply `reader-ui-system-refinements.md` sections 0 to 2 to `docs/reader.md` and `docs/ui-system.md` (banner, phase tags, per-band tables, removal of the duplicate More paragraph, new invariants, "Current implementation" subsection for the scale pipeline).
3. Purge the retired vocabulary listed in section 3 of that file from every doc under `docs/` except `docs/tasks/`.
4. `docs/change-dependencies.md`: Reader routing rows point to `reader-chrome.md` and `reader-behavior-contract.md`.
5. Delete `docs/reader-docs-patches.md` (a one-shot instruction file, now obsolete). Do not commit the refinements file or this task file.

Out: anything under `src/` or `e2e/`; test files and helpers (commit B); decisions listed as open.

## DEPENDENCIES

Relative links among docs; `ARCHITECTURE.md`, `docs/testing.md`, `docs/verification-map.md` and `docs/agent-execution-rules.md` references to the three deleted docs (`reader-chrome-foundation.md`, `mobile-chrome.md`, `desktop-reader.md`) or to `reader-docs-patches.md`; the retired labels in task docs are historical and stay.

## IMPLEMENTATION

- One commit: `docs: sync reader docs to contract v2`.
- Rewrite passages that carry retired vocabulary rather than deleting facts that still hold: PDF loading, extraction, OCR, lookup, offline and theme content stays.
- Keep the target described, not the legacy: the old Footer percentage, Footer zoom stepper, previous/next buttons, `PageNavigation`, Notes/Context as chrome entries and `Original/Reading` must not appear as current behavior. Mention legacy only inside a **[P2b]** migration note.
- Use relative links only (`[x](x.md)`), never absolute or chat-style URLs.
- Keep **current implementation** (scale pipeline, OCR queue behavior) separate from **target contract**; do not edit contract rules to match code.
- Do not change product decisions. If a passage cannot be reconciled without a decision, leave it as written, tag it, and list it in the report.

## VERIFICATION

Run from the repo root in PowerShell.

```powershell
git diff --stat           # only docs/ paths, no src/ or e2e/
git grep -n -i -E "Original/Reading|Reading/Original|Text and theme|Language engines|Click word lookup|Reading appearance|PageNavigation|ReaderFab|reader-chrome-foundation|mobile-chrome\.md|desktop-reader\.md|reader-docs-patches" -- docs ':!docs/tasks'
git grep -n -i -E "Simple/Advanced|interfaceMode|previous page|next page|prev/next|Footer.*(zoom|percent)|zoom.*Footer" -- docs ':!docs/tasks'
git grep -n -i "Document tools" -- docs ':!docs/tasks'
Get-ChildItem docs -Recurse -Filter *.md | ForEach-Object { $d = $_.DirectoryName; Select-String -Path $_.FullName -Pattern '\]\(([^)#:]+\.md)' -AllMatches | ForEach-Object { $_.Matches } | ForEach-Object { $t = Join-Path $d $_.Groups[1].Value; if (-not (Test-Path $t)) { "missing: $($_.Value)" } } }
npm run verify:fast
```

Pass criteria: the first command lists only `docs/`; the three greps return only hits that are a **[P2b]**-tagged migration note or the surface name `Document tools`; the link check prints nothing; `verify:fast` is green. Mark each result PASS / FAIL / BLOCKED / NOT RUN.

## REPORT

Phase report and Cleanup report (`docs/task-template.md`). Also list: every remaining grep hit with its justification; every passage left ambiguous for lack of a decision; confirmation that the closed decisions are unchanged and the four open items are still open.
