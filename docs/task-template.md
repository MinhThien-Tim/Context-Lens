# Task

Three forms use this file: a **light request** (what the user or the caller passes), a **Investigator Fact Report** (the evidence contract the Investigator writes), and a **Planner handoff** (the implementation contract the Planner writes). Use only the form the task needs; do not
pad the light request with repository-global rules, which already live in `AGENTS.md`,
`docs/agent-execution-rules.md`, and `docs/testing.md`.

## Light request

Enough for a very small, obvious, low-risk task, or the seed for an Investigator run.

```text
ROLE                  (optional — defaults per the routing in AGENTS.md)
TASK
ACCEPTANCE CRITERIA
CONSTRAINTS           (only genuinely task-specific ones)
OPTIONAL REFERENCES   (files, commits, screenshots, issue links, spec path)
```

## Investigator Fact Report

The canonical structure, owned by [`docs/agent-roles/investigator.md`](agent-roles/investigator.md). Write
it to `docs/tasks/YYYY-MM-DD-short-task-name-investigation.md` when the work continues in a later session.

```text
TASK
FINDINGS
SUBSYSTEM
PRESERVE / INVARIANTS AT RISK
CROSS-SUBSYSTEM IMPACT
EVIDENCE
CHANGE CLASS HINT
VERIFICATION HINT
OPEN QUESTIONS / RISKS   (omit when none)
```

## Planner handoff

The canonical structure, owned by [`docs/agent-roles/planner.md`](agent-roles/planner.md). Write
it to `docs/tasks/YYYY-MM-DD-short-task-name.md` when the work continues in a later session.

```text
TASK
FINDINGS
SCOPE
RELEVANT FILES
PRESERVE / INVARIANTS
OUT OF SCOPE
IMPLEMENTATION DIRECTION
CHANGE CLASS / RISK
VERIFICATION
ACCEPTANCE CRITERIA
DOC IMPACT
OPEN QUESTIONS / RISKS   (omit when none)
```

Keep either form to facts and references needed by the next fresh role context. Do not include
conversation history, reasoning logs, full terminal output, or code already available in the repo.

Invocation conventions: `ROLE: Investigator | Planner | Implementer | Verifier` or `/investigate`, `/plan`, `/implement`, `/verify`.
These are agent conventions, not application commands. A typical flow is `/investigate` with the symptom and acceptance criteria, then a fresh `/plan` context with the resulting Fact Report, then a fresh `/implement` context with the Planner handoff, then a fresh `/verify` context with the handoff and the compact implementation handoff.
