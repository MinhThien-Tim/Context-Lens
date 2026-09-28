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

Do not scan the repository. The routing table in `docs/ARCHITECTURE.md` selects exactly one document
for the task at hand; do not read all domain docs unless the task genuinely crosses subsystem
boundaries.

`docs/archive/` is historical material — completed reports, decisions and raw measurements. Never
browse it by default, and read a file there only when the task explicitly needs historical rationale,
regression investigation or an older measurement. Archive content is never current architecture truth;
code, config and the active docs override it.

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

Start with the smallest relevant check — usually one `npm run verify:<subsystem>` (the per-subsystem
command table lives in [`docs/testing.md`](docs/testing.md)) — and follow [§8](docs/agent-execution-rules.md#8-verification-execution-and-reporting)
for execution and reporting shape; escalate only as far
as the change actually reaches. Test layout and every command live in [`docs/testing.md`](docs/testing.md).
Browser E2E is conditional, never mandatory. Never watch mode.

## 6. Stop instead of looping

Classify failures before retrying. Follow the canonical [Execution / Test Retry Policy](docs/agent-execution-rules.md#7-execution--test-retry-policy): maximum two launcher/environment execution attempts and one direct result check per problem.
On Windows PowerShell, prefer `npm.cmd` / `npx.cmd` for documented npm/npx commands. A `.ps1`
Execution Policy error alone does not establish that the equivalent `.cmd` launcher is blocked;
use the one safe fallback when available within session permissions. Full access is not required.
For a sandbox execution denial, use the tool's official approval mechanism for one narrowly scoped
retry when permitted, within the same attempt budget. Stop if approval is denied or unavailable.
Never weaken security, request Windows administrator elevation, or poll repeatedly.

Label every check exactly `PASS`, `FAIL`, `BLOCKED`, `UNRESOLVED`, or `NOT RUN`. Never report a
non-pass as a pass, and never change code because a check was `BLOCKED`, `UNRESOLVED`, or `NOT RUN`.

## Agent roles

For every task, use one fixed role: Planner → [`docs/agent-roles/planner.md`](docs/agent-roles/planner.md),
Implementer → [`docs/agent-roles/implementer.md`](docs/agent-roles/implementer.md), or Verifier →
[`docs/agent-roles/verifier.md`](docs/agent-roles/verifier.md). Do not redefine roles in task prompts.

- `/plan` or `ROLE: Planner` → Planner.
- `/implement` or `ROLE: Implementer` → Implementer.
- `/verify` or `ROLE: Verifier` → Verifier.
- Without an explicit route: investigate / assess / diagnose / plan → Planner; implement / fix /
  modify / change → Implementer; verify / test / review completed work → Verifier.
- An explicit role or slash command wins over inferred intent. These are agent conventions, not app
  commands.

Planner → compact task spec → Implementer → implementation + compact handoff → Verifier → PASS or
compact failure packet. Roles exchange artifacts, relevant diffs/files, and required architecture
docs; they do not depend on a shared long-running transcript. Do not include chain-of-thought or
verbose reasoning in handoffs.

Task prompts should normally contain only `TASK`, `SCOPE`, `CONSTRAINTS`, `ACCEPTANCE CRITERIA`, and
optional relevant files, commits, or task-spec path. Start from [`docs/task-template.md`](docs/task-template.md).
Example: `/plan` with a task and acceptance criteria; then `/implement` with the approved spec path;
then `/verify` with the spec path and implementation handoff.

See [`docs/verification-map.md`](docs/verification-map.md) for existing subsystem commands. Execution,
retry, and reporting rules remain canonical in [`docs/agent-execution-rules.md`](docs/agent-execution-rules.md)
and [`docs/testing.md`](docs/testing.md).

