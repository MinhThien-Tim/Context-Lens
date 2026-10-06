  ### Change propagation

**Any add / remove / rename / move is a contract change.**

Before editing, identify its dependents. After editing, update every affected layer:

`source ??? UI/accessible name ??? test selector/helper/title/@tag ??? docs/spec ??? dependent components`

- **Remove:** remove the implementation, UI entry, tests/specs, selectors/helpers, names/tags and obsolete docs.
- **Rename:** update every reference, including accessible names, CSS hooks, test titles, `@tags`, helpers and docs.
- **Add:** add the implementation, UI contract, test coverage and required documentation together.
- Do not leave compatibility aliases, dead selectors or stale test references unless the task explicitly requires them.
- After implementation, search the changed symbol/name and inspect all directly dependent files before verification.
- A test change must preserve or deliberately update its `@tag`; never leave a stale tag or selector after changing what the test covers.

