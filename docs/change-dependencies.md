# Change Dependencies

## Core Rule
**Any add / remove / rename / move is a contract change.**

Before editing, identify its dependents. After editing, update every affected layer:

`source → UI/accessible name → test selector/helper/title/@tag → docs/spec → dependent components`

- **Remove:** remove the implementation, UI entry, tests/specs, selectors/helpers, names/tags and obsolete docs.
- **Rename:** update every reference, including accessible names, CSS hooks, test titles, `@tags`, helpers and docs.
- **Add:** add the implementation, UI contract, test coverage and required documentation together.
- Do not leave compatibility aliases, dead selectors or stale test references unless the task explicitly requires them.
- After implementation, search the changed symbol/name and inspect all directly dependent files before verification.
- A test change must preserve or deliberately update its `@tag`; never leave a stale tag or selector after changing what the test covers.

## Reader Routing Table

Reader architecture and behavior route to [reader-chrome.md](reader-chrome.md) and
[reader-behavior-contract.md](reader-behavior-contract.md). Owners are from [reader-chrome.md](reader-chrome.md) §1.

| Change | Check |
| --- | --- |
| Header control | `ReaderToolbar` → `reader-chrome.md` §5 → HDR-* tests |
| Footer control (page number, Contents, Markup, More) | `ReaderProgress` → FTR-*, NAV-1, MOB-2 tests |
| More item | `readerMoreItems` in `App.tsx` → MORE-2 per band → More tests |
| Theme panel (`Aa`, More → Theme) | `ReaderSettings` → THEME-1, APP-* tests |
| Quiet / reveal | `ReaderShell`, `programmaticScroll.ts` → INP-*, MOB-* tests |
| Mode name or switch | `PdfModeSwitch` → ARCH-3, MODE-* tests |
| Zoom | `PdfViewer`, `ReaderToolbar` → FTR-2, ZOOM-2 |
| File switcher (P2c) | `FileSwitcher`, `useLibrary` → FILE-1 tests |

## Rename/Removal Checklist
- [ ] Implementation updated/removed
- [ ] UI entry updated/removed
- [ ] Tests/specs updated/removed
- [ ] Selectors/helpers updated/removed
- [ ] Names/tags updated/removed
- [ ] Documentation updated/removed
- [ ] No compatibility aliases left unless explicitly required
- [ ] No dead selectors left
- [ ] @tag preserved or deliberately updated in tests

## Test Contract
Each row above names a **locator** (the owner that renders or wires the control), a **doc reference**
(where the behavior is specified) and the **test tags** that must be re-run or updated. A change to any
row's owner invalidates the whole row, not just the edited cell.

- **Locator:** the owner from the routing table — start there when searching for a stale reference.
- **Accessible name:** the announced name, when the change touches a labeled control.
- **Title/@tag:** test metadata for tracking; rule IDs are the tags.
- **Completion:** verification that the change is fully propagated.

## Completion
After implementation, verify by:
1. Searching for the changed symbol/name
2. Inspecting all directly dependent files
3. Confirming @tag is preserved or deliberately updated
4. Ensuring no dead selectors or stale test references remain
5. Running affected tests to validate behavior

