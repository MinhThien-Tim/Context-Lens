# Agent working rules ??? Context Lens
Subsystem commands: [`docs/verification-map.md`](docs/verification-map.md).

See [Change propagation](docs/change-dependencies.md) for details.

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
