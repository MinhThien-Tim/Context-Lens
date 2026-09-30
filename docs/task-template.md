# Task

Two forms use this file: a **light request** (what the user or the caller passes) and a **Planner
handoff** (the implementation contract the Planner writes). Use only the form the task needs; do not
pad the light request with repository-global rules, which already live in `AGENTS.md`,
`docs/agent-execution-rules.md`, and `docs/testing.md`.

## Light request

Enough for a very small, obvious, low-risk task, or the seed for a Planner run.

```text
ROLE                  (optional — defaults per the routing in AGENTS.md)
TASK
ACCEPTANCE CRITERIA
CONSTRAINTS           (only genuinely task-specific ones)
OPTIONAL REFERENCES   (files, commits, screenshots, issue links, spec path)
```

## Planner handoff

The canonical structure, owned by [`docs/agent-roles/planner.md`](agent-roles/planner.md). Write
it to `docs/tasks/YYYY-MM-DD-short-task-name.md` when the work continues in a later session.

```text
TASK
SCOPE
PRESERVE
OUT OF SCOPE
IMPLEMENTATION BOUNDARY
CHANGE CLASS
VERIFICATION
ACCEPTANCE CRITERIA
DOC IMPACT
OPEN QUESTIONS / RISKS   (omit when none)
```

Keep either form to facts and references needed by the next fresh role context. Do not include
conversation history, reasoning logs, full terminal output, or code already available in the repo.

Invocation conventions: `ROLE: Planner | Implementer | Verifier` or `/plan`, `/implement`, `/verify`.
These are agent conventions, not application commands. A typical flow is `/plan` with the task and
acceptance criteria, then a fresh `/implement` context with the resulting handoff, then a fresh
`/verify` context with the handoff and the compact implementation handoff.
