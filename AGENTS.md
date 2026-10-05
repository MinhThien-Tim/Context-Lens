# Agent working rules — Context Lens

Architecture-first, verification-proportional workflow for anyone (human or agent) changing this repo.
Detail: [`docs/agent-execution-rules.md`](docs/agent-execution-rules.md) · Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

```text
Precedence: task instructions > this file > docs/agent-execution-rules.md > domain docs
```

Code and config are always the final authority for behavior and facts.

## Hard rules

Check these **before every tool call, edit, commit and report**. This is the canonical short list; each rule
links to the section that owns the detail.

**Navigate and scope**
1. Navigate `docs/ARCHITECTURE.md` → **one** domain doc → only the files it names. No repository scan.
   `docs/archive/` is history, never default reading and never current truth.
2. Do exactly the task. Out-of-scope findings are reported, not fixed; a bug local to the task is fixed.
   [§1](docs/agent-execution-rules.md#1-scope)

**Requests and loops**
3. Before a tool call, name the new fact it returns. None → do not send it. Zero matches is an answer; never
   repeat or reword a query; max 5 searches per question, then report.
   [Identical-query loop](docs/agent-execution-rules.md#identical-query-loop)
4. On failure, classify once (`CODE` / `LAUNCHER` / `ENVIRONMENT` / `UNKNOWN`), take at most one safe fallback,
   max 2 attempts, then stop with `BLOCKED`. Never rerun an unchanged failing command; no watch mode; no
   polling. [Terminal Loop Guard](docs/agent-execution-rules.md#terminal-loop-guard)

**Edit and fix**
5. Read the exact range before editing. Never edit from memory or overwrite a file wholesale.
6. Root cause before fix: reproduce, one hypothesis, one refuting test. Three failed attempts → stop and report.
7. No new behavior without an approved spec line. "Stale test" needs a `file + section` citation.
   [§9](docs/agent-execution-rules.md#9-failure-classification-and-spec)
8. Never weaken a test: no `skip`, `.only`, deletion, weakened assertion or blind snapshot update.

**Verify and report**
9. Classify the diff (`PRESENTATION_ONLY` / `LOCAL_UI` / `SUBSYSTEM_LOGIC` / `SHARED_CONTRACT`), then run the
   smallest relevant check. CSS-only stops at `npm run check:css`. `verify:full` is escalation-only.
   [§4](docs/agent-execution-rules.md#4-verification-proportionality) ·
   [§8](docs/agent-execution-rules.md#8-verification-execution-and-reporting) ·
   [commands](docs/testing.md)
10. Report only what was observed. Label every check exactly `PASS`, `FAIL`, `BLOCKED`, `UNRESOLVED` or
    `NOT RUN`, with real output. Never change code because a check was blocked or not run.

**Git and stop**
11. `git status --short` before and after each step; one logical change per commit; no destructive git
    commands. [§6](docs/agent-execution-rules.md#6-working-tree-and-commits)
12. A user stop, cancel, interrupt or handoff is terminal: no retry, no further tool call, and no resolving a
    pending confirmation with another command. When the work is done and verified or blocked, stop.
    [§11](docs/agent-execution-rules.md#11-stop-condition)

## Always binding

- `COST & QUOTA GUARDRAILS.md` and the invariants in `docs/ARCHITECTURE.md`: local/static first, cache before
  network, Worker API deny-by-default, safe degradation on quota exhaustion, no hidden cost.
- Keep architecture docs true: update the matching domain doc in the same task only when architecture,
  ownership, boundaries, control/data flow, persistence or integration behavior changed. Not for copy, naming,
  style, test-only or isolated bug-fix changes.
- Recurring test symptoms: [`docs/testing-troubleshooting.md`](docs/testing-troubleshooting.md).

## Agent roles

Every task uses one fixed role. Do not redefine roles in task prompts.

| Role | Trigger | Contract |
| --- | --- | --- |
| Investigator | `/investigate`, `ROLE: Investigator`; or investigate / assess / diagnose | [`investigator.md`](docs/agent-roles/investigator.md) |
| Planner | `/plan`, `ROLE: Planner`; or plan | [`planner.md`](docs/agent-roles/planner.md) |
| Implementer | `/implement`, `ROLE: Implementer`; or implement / fix / modify / change | [`implementer.md`](docs/agent-roles/implementer.md) |
| Verifier | `/verify`, `ROLE: Verifier`; or verify / test / review completed work | [`verifier.md`](docs/agent-roles/verifier.md) |

An explicit role or slash command wins over inferred intent. These are agent conventions, not app commands.

```text
Investigator -> Fact Report -> Planner -> task spec -> Implementer -> handoff -> Verifier -> PASS | failure packet
```

- **Investigator and Planner are read-only for product code.** They inspect source, tests, docs, config and git
  state, but never edit, patch or "try the fix". A discovered defect is reported, not patched. The Investigator
  owns evidence (the Fact Report); the Planner owns execution scope (the contract the Implementer follows and
  the Verifier checks).
- **Prompts stay short.** A prompt needs the problem, the desired result, acceptance criteria, and any genuinely
  task-specific constraint. Standard restrictions ("use targeted tests", "follow the Terminal Loop Guard") are
  derived from architecture and classification, not repeated. User-supplied constraints always take precedence.
  Start from [`docs/task-template.md`](docs/task-template.md).
- **Direct implementation.** A very small, obvious, low-risk task may go straight to the Implementer, which
  derives a narrow scope and states it in its handoff. Ambiguous, multi-file, architectural or
  investigation-heavy work goes Investigator → Planner first. An existing Planner handoff is always used.

### Mixed tasks and context boundaries

If a task combines investigation and implementation, run the Investigator first and write the Fact Report to
`docs/tasks/YYYY-MM-DD-short-task-name-investigation.md`. Each later role starts in a **fresh context**:
Planner gets the Fact Report, Implementer gets the compact task spec, Verifier gets the compact handoff.

Pass only what the next stage needs: Fact Report, task spec, changed files, relevant diff, verification command,
known risks, and a compact failure packet if any. Do not pass conversation histories, reasoning logs, terminal
transcripts, repeated architecture summaries or scratch work. Stop after a confirmed `PASS`; on failure return a
compact failure packet to a fresh Planner.

Handoffs **reference** repository-global rules (this file, `docs/agent-execution-rules.md`, `docs/testing.md`,
the role files); they never reproduce them. Role files in the repo, not editor-specific custom modes, are the
source of truth, so Cline, Codex, Copilot, Claude Code and similar agents share the same reviewable
instructions. Artifacts under `docs/tasks/` contain only what a fresh context needs.

Subsystem commands: [`docs/verification-map.md`](docs/verification-map.md).