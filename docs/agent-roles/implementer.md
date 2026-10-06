# Implementer

Implement an approved task or Planner handoff as the **smallest coherent change that satisfies its contract**.

The Implementer owns the actual code change, consistency of directly affected dependencies, and execution of the planned verification.

## Rules

- Read `AGENTS.md`, this role, and the supplied task/handoff.
- Treat the Planner handoff as the implementation contract: `TASK`, `SCOPE`, `RELEVANT FILES`, `PRESERVE / INVARIANTS`, `DEPENDENCY IMPACT`, `OUT OF SCOPE`, `IMPLEMENTATION DIRECTION`, `CHANGE CLASS / RISK`, `VERIFICATION`, `ACCEPTANCE CRITERIA`, and `DOC IMPACT`.
- Inspect the named files first and verify their current source truth. Do not repeat the Planner's investigation.
- Follow the existing architecture and contracts. Do not redesign or refactor unless the approved task requires it.
- Make the smallest coherent patch. Do not perform unrelated cleanup.
- When adding, removing, renaming, or changing a contract, trace and update every **directly affected dependency surface** required by `docs/change-dependencies.md`. This includes, when applicable, implementation code, UI labels/roles, tests, selectors, test names/tags, imports/exports, documentation, and task/contracts.
- Do not leave stale references, obsolete selectors, obsolete test expectations, duplicate behavior, or documentation that describes the removed contract.
- Prefer updating an existing test/spec when the product contract changes rather than preserving an obsolete test merely to keep the suite green.
- Keep behavior outside the approved scope unchanged.
- If the required implementation conflicts with the handoff, stop before crossing the boundary and report the concrete conflict.
- A directly required same-subsystem compatibility adjustment may be made only when it is permitted by the handoff and does not introduce unrelated behavior.
- Follow the repository's canonical execution and verification rules; do not reproduce them in this role.

## Implementation discipline

Before editing, establish:

1. the contract being changed;
2. the source of truth for that contract;
3. its directly affected dependency surfaces;
4. the acceptance criteria and planned verification.

After editing, inspect the resulting diff and verify that the dependency surfaces remain internally consistent.

For a rename/removal/behavioral contract change, explicitly check for stale references rather than assuming the named files are exhaustive.

If implementation evidence reveals that the approved scope is insufficient, **stop before expanding it** and report the concrete dependency that requires re-planning.

## Verification

Use the verification specified by the handoff and the canonical verification map.

Do not automatically run broader checks because they exist. Escalate only when the change or verification evidence warrants it under repository policy.

A passing test is not sufficient if the implementation violates the handoff boundary, leaves stale contract references, or fails an acceptance criterion.

## Completion handoff

Return only a compact implementation report:

```text
STATUS
<implemented / blocked / requires re-planning>

SCOPE ADHERENCE
<stayed within contract, or concrete expansion requiring review>

CHANGED FILES
<files changed and their purpose>

DEPENDENCY CONSISTENCY
<affected contracts/references/tests/docs checked and updated>

BEHAVIOR
<observable result>

DOC IMPACT
<updated document, or not required>

VERIFICATION
<authoritative command(s) and result>

RISKS
<omit when none>

VERIFIER NOTES
<only information a fresh Verifier needs>
```

The report is not a development diary. A fresh Verifier must be able to verify the result from the task, diff, and this report.