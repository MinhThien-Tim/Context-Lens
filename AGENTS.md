# Agent working rules — Context Lens

Architecture-first, verification-proportional workflow for anyone (human or agent) changing this repo.
Details: [`docs/agent-execution-rules.md`](docs/agent-execution-rules.md) · Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## Instruction precedence

Task-specific instructions > this file > `docs/agent-execution-rules.md` > domain architecture docs.
Code and config are always the final authority for behavior and facts.

## 1. Navigate from the architecture map, never by scanning

1. `docs/ARCHITECTURE.md` — subsystem map, entry points, invariants, task-routing table.
2. The one domain doc that routing table selects.
3. Only the source files that domain doc names.

Do not scan the repository. `docs/` also contains historical reports and handoffs that are not current
architecture; the documentation tiers in `docs/ARCHITECTURE.md` say which is which, and any file in `docs/`
not listed there as canonical or specialized is historical.

## 2. Scope discipline

Change only the requested subsystem. No opportunistic cleanup, refactoring, or drive-by fixes.
Report unrelated findings separately instead of fixing them.

## 3. Keep architecture docs true

If architecture, ownership, subsystem boundaries, control flow, data flow, persistence, or integration
behavior changed, update the matching domain doc in the same task. Do not touch architecture docs for
copy, naming, style, test-only, or isolated bug-fix changes.

## 4. Binding constraints

`COST & QUOTA GUARDRAILS.md` (root) and the invariants in `docs/ARCHITECTURE.md` are binding:
local/static first, cache before network, Worker API deny-by-default, safe degradation on quota
exhaustion, no hidden cost.

## 5. Verification proportional to blast radius

Start with the smallest relevant check — usually one `npx vitest run <path>` — and escalate only as far
as the change actually reaches. Test layout and every command live in [`docs/testing.md`](docs/testing.md).
Browser E2E is conditional, never mandatory. Never watch mode.

## 6. Stop instead of looping

Allow 2–3 meaningful attempts per verification problem, each backed by a concrete change. On
execution-policy, permission, sandbox, launcher, or tool blocks: stop immediately, do not weaken
settings or swap runners, report the gap.

Label every check exactly `PASS`, `FAIL`, `BLOCKED`, `UNRESOLVED`, or `NOT RUN`. Never report a
non-pass as a pass, and never change code because a check was `BLOCKED`, `UNRESOLVED`, or `NOT RUN`.

