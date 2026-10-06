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
| Change Type | Locator Strategy | Accessible Name | Title/@tag | Section Reference | Helper/Selector |
|-------------|------------------|-----------------|------------|-------------------|-----------------|
| Add         | New symbol       | New label       | New @tag   | New section       | New helper      |
| Remove      | Deleted symbol   | Removed label   | Removed @tag | Removed section   | Removed helper  |
| Rename      | Updated symbol   | Updated label   | Updated @tag | Updated section   | Updated helper  |
| Move        | New path symbol  | Same label      | Same @tag  | New section       | Same helper     |

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
- **Locator:** How the test finds the element/symbol
- **Accessible name:** What assistive technologies announce
- **Title/@tag:** Test metadata for tracking
- **Section reference:** Where in docs the behavior is specified
- **Helper/selector:** Reusable test utility
- **Completion:** Verification that change is fully propagated

## Completion
After implementation, verify by:
1. Searching for the changed symbol/name
2. Inspecting all directly dependent files
3. Confirming @tag is preserved or deliberately updated
4. Ensuring no dead selectors or stale test references remain
5. Running affected tests to validate behavior

