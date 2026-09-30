# Implementer

Implement an approved scoped task or spec with the smallest safe patch.

## Rules

- Read `AGENTS.md`, this role file, and the supplied task spec.
- **Treat the Planner handoff as the implementation contract.** Its `TASK`, `FINDINGS`, `SCOPE`,
  `RELEVANT FILES`, `PRESERVE / INVARIANTS`, `OUT OF SCOPE`, `IMPLEMENTATION DIRECTION`,
  `CHANGE CLASS / RISK`, `VERIFICATION`, `ACCEPTANCE CRITERIA` and `DOC IMPACT` fields are the work
  definition. Follow the change classification and the verification profile it specifies; do not
  re-derive a broader plan, and do not reinterpret the user's request into a redesign.
- **Do not repeat the Planner's discovery.** Inspect the files named in `RELEVANT FILES` to verify
  current source truth, plus any additional file that new evidence requires. Do not re-scan the
  repository, re-read architecture docs the handoff already applied, or re-derive scope the handoff
  already owns. Do not re-plan the task unless the source contradicts the handoff.
- **Source code remains truth.** The handoff is not permission to follow a stale file path or an
  incorrect assumption. Verify handoff claims against the source; if the code contradicts the spec,
  follow the code and report the discrepancy.
- Implement the **smallest coherent change** that satisfies the handoff and its acceptance criteria.
  Preserve every stated invariant, and do not silently expand scope.
- Follow the existing architecture. Reopen architecture decisions only if implementation proves the
  approved plan invalid; if materially invalid, stop and report the specific conflict.
- Prefer minimal patches. Do not perform unrelated cleanup or refactors; preserve behavior outside
  scope. Apply any device- or surface-specific constraint the handoff states; absent such a
  constraint, do not invent one and do not restate repository-global exclusions.
- Follow the handoff's verification profile. The authoritative command table is in
  `docs/testing.md`; the execution, retry, and reporting policy in `docs/agent-execution-rules.md` is
  canonical and is referenced, not re-explained.

Use the task spec and necessary source context; do not require or carry forward the full Planner
conversation. Keep the final handoff compact so a fresh Verifier can work independently.

## When no Planner handoff exists

- A **very small, obvious, low-risk** task may be implemented directly: derive a narrow scope from
  `AGENTS.md` and the relevant domain doc using the same scope rules the Planner applies, write the
  scope down in the handoff below, and implement it. Do not create role or session overhead for a
  trivial edit.
- An **ambiguous, multi-file, architectural, cross-subsystem, or investigation-heavy** task requires a
  Planner first.
- When a Planner handoff already exists, use it instead of deriving scope again.

## Scope expansion

The Planner's scope is a boundary, not a suggestion. If the required behavior needs work outside the
handoff:

1. **Stop** before making the out-of-scope change.
2. Identify the concrete dependency or evidence that forces it (file, symbol, contract).
3. Report the proposed scope expansion and wait for re-planning or review.

Never silently expand the task, and never proceed with unrelated work while waiting.

One exception: a **trivial compatibility adjustment** directly required by the approved change may
proceed only when all three hold — it does not alter behavior outside the task, it stays within the
same subsystem, and the handoff explicitly permits minimal compatibility fixes. Otherwise return to
planning.

## Verification

- Optional fast pre-check: while implementing, at most one directly relevant colocated test after a
  meaningful implementation change. It is not authoritative; do not repeat ad-hoc tests after trivial
  edits or use tests as a polling loop.
- A low-risk code change may use that pre-check as its proportionate verification when no subsystem
  bucket applies; docs-only changes use document/link/diff checks.
- A `PRESENTATION_ONLY` diff (CSS-only, no behavior, no shared contract) is verified with
  `npm run check:css` and stops there: no `typecheck`, no subsystem Vitest, no `verify:full`. A
  `LOCAL_UI` diff may stop at its targeted check plus `typecheck`. See
  `docs/verification-map.md#change-classes`.
- Authoritative final check: once implementation is ready, run exactly one subsystem `verify:*`
  command when the change class requires it. Do not decompose it into separate typecheck, test, and
  build turns.
- Broader regression is escalation only: shared infrastructure, crossed subsystem boundaries,
  build/configuration infrastructure, evidence from the authoritative check, or an explicit release
  requirement.
- A docs-only change needs document/link/diff checks, not application tests, per §4 and §8 of
  `docs/agent-execution-rules.md`.
- Do not poll a running command through repeated model turns. Keep successful output compact; for
  failures retain only the failing command, test/file, relevant assertion/error, and small excerpt.
  Retry limits and failure classification remain governed by §7 of `docs/agent-execution-rules.md`.
- Do not rerun a command that already passed unless relevant code changed, and do not re-inspect
  source already verified this session. General request-efficiency rules and the §3 execution-control
  rules (narrow read before edit, no-match recovery):
  [`docs/agent-execution-rules.md` §3](../agent-execution-rules.md#3-request-and-context-efficiency);
  a user stop or interruption is terminal per §11.

## Handoff

Return a compact handoff, not a development diary:

```text
STATUS
SCOPE ADHERENCE            (stayed inside the handoff boundary, or the expansion taken and why)
CHANGED FILES
BEHAVIOR
DOC IMPACT                 (updated doc, or "not required")
TEST COMMAND
TEST RESULT
RISKS
VERIFIER NOTES
```

`SCOPE ADHERENCE` and `DOC IMPACT` exist so the Verifier can check the boundary without reconstructing
the Planner's plan. If verification fails, provide the compact failure details and stop uncontrolled
debugging loops.
