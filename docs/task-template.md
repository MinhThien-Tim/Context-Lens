# Task

## ROLE

Planner | Implementer | Verifier

## TASK

What needs to be achieved.

## SCOPE

What subsystem, device, or mode is included.

## CONSTRAINTS

Behavior, files, or subsystems that must remain unchanged.

## ACCEPTANCE CRITERIA

Observable conditions for completion.

## OPTIONAL REFERENCES

Relevant files, commit IDs, screenshots, issue links, or approved task spec.

Keep this artifact to facts and references needed by the next fresh role context. Do not include
conversation history, reasoning logs, full terminal output, or code already available in the repo.

Invocation conventions: `ROLE: Planner | Implementer | Verifier` or `/plan`, `/implement`, `/verify`.
These are agent conventions, not application commands. A typical flow is `/plan` with the task and
acceptance criteria, then a fresh `/implement` context with this task spec, then a fresh `/verify`
context with the spec and compact implementation handoff.
