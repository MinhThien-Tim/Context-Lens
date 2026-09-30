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

Classify the diff first — `PRESENTATION_ONLY`, `LOCAL_UI`, `SUBSYSTEM_LOGIC`, or `SHARED_CONTRACT` —
using the canonical [change classes](docs/verification-map.md#change-classes) and the
[§4 proportional verification policy](docs/agent-execution-rules.md#4-verification-proportionality),
then start with the smallest relevant check and follow [§8](docs/agent-execution-rules.md#8-verification-execution-and-reporting)
for execution and reporting shape; escalate only as far
as the change actually reaches. A `PRESENTATION_ONLY` CSS diff runs `npm run check:css` and stops —
no `typecheck`, no subsystem Vitest, no `verify:full`. A `LOCAL_UI` diff may use targeted
verification without a mandatory whole-subsystem run. Subsystem `verify:*` commands stay
authoritative for `SUBSYSTEM_LOGIC`, and `verify:full` remains escalation-only. The per-subsystem
command table, test layout and every command live in [`docs/testing.md`](docs/testing.md).
Browser E2E is conditional, narrow and never mandatory. Never watch mode.

## 6. Stop instead of looping

The [Terminal Loop Guard](docs/agent-execution-rules.md#terminal-loop-guard) is mandatory: never repeatedly retry shell commands — classify each failure once, take at most one safe fallback, then stop and report the blocker.
Classify failures before retrying. Follow the canonical [Execution / Test Retry Policy](docs/agent-execution-rules.md#7-execution--test-retry-policy): maximum two launcher/environment execution attempts and one direct result check per problem.
On Windows PowerShell, prefer `npm.cmd` / `npx.cmd` for documented npm/npx commands. A `.ps1`
Execution Policy error alone does not establish that the equivalent `.cmd` launcher is blocked;
use the one safe fallback when available within session permissions. Full access is not required.
For a sandbox execution denial, use the tool's official approval mechanism for one narrowly scoped
retry when permitted, within the same attempt budget. Stop if approval is denied or unavailable.
Never weaken security, request Windows administrator elevation, or poll repeatedly.

Label every check exactly `PASS`, `FAIL`, `BLOCKED`, `UNRESOLVED`, or `NOT RUN`. Never report a
non-pass as a pass, and never change code because a check was `BLOCKED`, `UNRESOLVED`, or `NOT RUN`.
For recurring test symptoms and fast diagnosis paths, use
[`docs/testing-troubleshooting.md`](docs/testing-troubleshooting.md).
Retry and stop semantics remain authoritative in
[`docs/agent-execution-rules.md`](docs/agent-execution-rules.md).

## 7. Minimize redundant requests

**Spend requests on new information, not on re-reading, re-searching, or re-verifying information that
has not changed.** Batch independent reads and searches when the tool supports it; never repeat an
equivalent search, re-read an unchanged file, poll, retry a failed command, or rerun a passing check
without a reason. Do not scan unrelated subsystems for completeness and do not broaden verification
without evidence. Efficiency never weakens source verification — a cited file is still checked once
against the source. There is deliberately **no numeric request budget**: complex tasks may legitimately
need more requests, so no hard per-task or per-role cap exists. Canonical rules for all three roles:
[§3](docs/agent-execution-rules.md#3-request-and-context-efficiency).

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

### The Planner owns execution scope

The Planner is **read-only for product implementation** and the **canonical owner of execution
scope**: implementation scope, execution scope, verification scope, and out-of-scope boundaries. It
inspects source, tests, docs, config, and git state; it never edits code, tests, or config, never
applies patches, never runs a script that modifies repository files, and never "tries the fix" to
validate its own plan. A discovered defect is reported, not patched. When a task is planned, its
handoff is the implementation contract the Implementer follows and the Verifier checks against.

A user prompt normally needs only the problem, the desired result, and any genuinely task-specific
constraint. The user should **not** repeat common scope restrictions — "do not touch lookup logic",
"mobile only", "desktop unchanged", "do not modify the PDF reader", "use targeted tests", "do not run
`verify:full`", "preserve current handlers", "do not change persistence", "follow the Terminal Loop
Guard" — that the Planner can derive from architecture, classification, and investigation. The
Planner's rules in [`docs/agent-roles/planner.md`](docs/agent-roles/planner.md) own that derivation;
user-supplied task-specific constraints still take precedence and are always retained.

Repository-global rules stay in this file, [`docs/agent-execution-rules.md`](docs/agent-execution-rules.md),
[`docs/testing.md`](docs/testing.md), and the role files. Handoffs **reference** them; they never
reproduce them.

```text
# sufficient
"Mobile Full card still wastes space around Translate and AI. Inspect and make a plan to compact the controls."
"Change the Advanced theme colors to match this screenshot."
"Investigate why PDF rendering flashes black before text appears."
```

**Direct implementation requests:** do not force Planner ceremony on a trivial task. A very small,
obvious, low-risk task may go straight to Implementer, which derives a narrow scope using the same
rules and states it in its handoff. Ambiguous, multi-file, architectural, or investigation-heavy tasks
go to Planner first, and an existing Planner handoff is always used when one is present.

Task prompts should normally contain only the task details, acceptance criteria, and optional relevant
files, commits, or task-spec path. Start from [`docs/task-template.md`](docs/task-template.md).
Example: `/plan` with a task and acceptance criteria; then `/implement` with the approved spec path;
then `/verify` with the spec path and implementation handoff. Carry only the compact handoff or task
spec into the next context — never the Planner transcript.

### Mixed tasks and context boundaries

If a task combines investigation and implementation, run Planner first and write a compact task spec
to `docs/tasks/YYYY-MM-DD-short-task-name.md`. Start a fresh Implementer context with that spec,
not the Planner transcript. When implementation is complete, pass a compact handoff and start a
fresh Verifier context.

Roles are persistent; conversation context is not. Pass only the minimum artifact each stage needs:
the task spec, changed files, relevant diff, verification command, known risks, and (if needed) a
compact failure packet. Do not pass full conversation histories, reasoning logs, terminal transcripts,
repeated architecture summaries, or scratch work. The Planner transcript is disposable once the task
spec exists; stop after a confirmed PASS or return a compact failure packet to a fresh Implementer.

Repository-owned role files are the source of truth instead of editor-specific custom modes. This
keeps reviewable, version-controlled instructions consistent across Cline, Codex, Copilot, Claude Code,
and similar agents and machines, and lets them evolve with the architecture. It avoids repeating
1–2k-token role prompts for every task. Store permanent instructions once in `AGENTS.md`,
`docs/agent-roles/`, and `docs/verification-map.md`; keep task prompts task-specific (roughly 90%
persistent instructions and 10% task details, as a guideline).

Invocation conventions are `ROLE: Planner | Implementer | Verifier` or `/plan`, `/implement`,
`/verify`. They are agent conventions, not application commands. Do not copy full role instructions
into task files; artifacts under `docs/tasks/` contain only what a fresh context needs.

See [`docs/verification-map.md`](docs/verification-map.md) for existing subsystem commands. Execution,
retry, and reporting rules remain canonical in [`docs/agent-execution-rules.md`](docs/agent-execution-rules.md)
and [`docs/testing.md`](docs/testing.md).

