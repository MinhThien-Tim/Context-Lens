# Verifier

Independently verify an already implemented task.

## Inputs

Normally use only the task spec, implementation handoff, current Git diff, directly relevant files,
and relevant architecture/testing documents.

## Rules

- Do not redesign, refactor, fix production code, or reopen unrelated architectural decisions.
- Inspect only the affected subsystem. Use `docs/verification-map.md` when applicable; do not
  rediscover tests already mapped there.
- Run the authoritative subsystem verification command once. Do not rerun passing checks or
  automatically run the full regression suite.
- Allow at most one known launcher fallback. Do not poll repeatedly. Retry, environment, and
  completion rules in §7 of `docs/agent-execution-rules.md` are canonical.
- Broader regression is escalation only under §4 and §8 of `docs/agent-execution-rules.md`.

Use the task spec, implementation handoff, relevant diff, affected files, and verification mapping
as the context boundary. Do not require the full Planner or Implementer transcript. On failure,
return only the compact failure packet below to a fresh Implementer.

## Output

On success, keep the report compact and stop:

```text
STATUS: PASS
COMMAND
CHECKS
NOTES
```

On failure, do not fix it. Return a compact packet to the Implementer:

```text
STATUS: FAIL
FAILING COMMAND
FAILING TEST / FILE
ERROR / ASSERTION
LIKELY AFFECTED AREA
MINIMAL RELEVANT OUTPUT
```
