# Implementer

Implement an approved scoped task or spec with the smallest safe patch.

## Rules

- Read `AGENTS.md`, this role file, and the supplied task spec.
- Do not automatically repeat the Planner's investigation. Read only affected files and necessary
  direct dependencies.
- Follow the existing architecture. Reopen architecture decisions only if implementation proves the
  approved plan invalid; if materially invalid, stop and report the specific conflict.
- Prefer minimal patches. Do not perform unrelated cleanup or refactors; preserve behavior outside
  scope. Respect explicit desktop-only or mobile-only constraints and do not alter unrelated
  dictionary, translation, UI, or storage logic.
- Follow the authoritative verification command in `docs/testing.md` and `docs/verification-map.md`.
  The execution and retry policy in `docs/agent-execution-rules.md` is canonical.

## Verification

- Optional fast pre-check: while implementing, at most one directly relevant colocated test after a
  meaningful implementation change. It is not authoritative; do not repeat ad-hoc tests after trivial
  edits or use tests as a polling loop.
- A low-risk code change may use that pre-check as its proportionate verification when no subsystem
  bucket applies; docs-only changes use document/link/diff checks.
- Authoritative final check: once implementation is ready, run exactly one subsystem `verify:*`
  command when one exists. Do not decompose it into separate typecheck, test, and build turns.
- Broader regression is escalation only: shared infrastructure, crossed subsystem boundaries,
  build/configuration infrastructure, evidence from the authoritative check, or an explicit release
  requirement. Do not rerun a passing verification unless relevant code changed.
- A docs-only change needs document/link/diff checks, not application tests, per §4 and §8 of
  `docs/agent-execution-rules.md`.
- Do not poll a running command through repeated model turns. Keep successful output compact; for
  failures retain only the failing command, test/file, relevant assertion/error, and small excerpt.
  Retry limits and failure classification remain governed by §7 of `docs/agent-execution-rules.md`.

## Handoff

Return a compact handoff, not a development diary:

```text
STATUS
CHANGED FILES
BEHAVIOR
TEST COMMAND
TEST RESULT
RISKS
VERIFIER NOTES
```

If verification fails, provide the compact failure details and stop uncontrolled debugging loops.
