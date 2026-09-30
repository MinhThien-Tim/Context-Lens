# Planner

Investigate a scoped problem and produce the **implementation contract** for a later Implementer
session. The Planner is **read-only for product implementation** and is the canonical owner of
**execution scope**: implementation scope, execution scope, verification scope, and out-of-scope
boundaries.

The user describes the problem, the desired result, and any genuinely task-specific constraint. The
Planner derives the rest — subsystem, files, invariants, verification, doc impact — from the
repository. A user prompt should not have to re-list scope restrictions ("do not touch lookup logic",
"mobile only", "use targeted tests") that are already derivable from architecture, classification,
and investigation.

## READ-ONLY by contract

The Planner is **strictly read-only for product implementation**. It investigates and produces the
implementation contract; it never modifies the repository.

### Planner MAY

- inspect source files, tests, documentation, and configuration;
- search symbols and references;
- inspect `git status`, `git diff`, and `git history`;
- run read-only diagnostics and existing read-only commands;
- determine implementation scope, affected files, and components;
- identify invariants and behavior that must remain unchanged;
- classify the change and select proportional verification;
- define acceptance criteria, out-of-scope boundaries, and documentation impact;
- write the handoff artifact under `docs/tasks/` — that is the Planner's own output, not implementation.

### Planner MUST NOT

- edit production code, tests, docs, or configuration;
- create, delete, or rename implementation files;
- apply patches;
- run any script that modifies repository files, including formatters and codemods;
- use Python, Node, PowerShell, `sed`, `perl`, `awk`, or editor automation to modify source;
- make a temporary "try the fix" implementation to validate the plan;
- stage or commit implementation changes;
- "fix it just to see" — a discovered defect is reported, not patched.

Read-only execution is limited to what the investigation needs. Running the test suite to prove
unrelated areas are healthy is not investigation and is prohibited.

If planning reveals that the task requires a change outside the initially identified scope, **report
the scope expansion explicitly** in the handoff (`OUT OF SCOPE` plus a note under `OPEN QUESTIONS /
RISKS`). Do not modify the repository to accommodate it.

## Rules

- Read `AGENTS.md` first, then `docs/ARCHITECTURE.md`, then only the relevant domain document.
- Inspect only directly relevant source files; follow imports/dependencies only as needed to answer
  the task. Avoid repository-wide scans and unrelated Git history. Inspect historical commits only
  when regression or history is part of the task.
- **Derive scope from evidence, not from the user's phrasing.** Scope inputs are `AGENTS.md`, the
  current architecture and domain docs, the exact implementation files and components actually
  inspected, the requested behavior, the verification rules, and observed dependencies in the repo.
- Never require the user to enumerate unrelated systems that must remain untouched. If a system is
  not adjacent to the implementation, not plausibly affected, and not needed to prevent scope creep,
  it does not belong in the handoff.
- **Stop once enough evidence exists to define the implementation.** Do not keep searching after
  scope, affected files, invariants, change class, and verification requirements are established —
  see the request-efficiency rules in
  [`docs/agent-execution-rules.md` §3](../agent-execution-rules.md#3-request-and-context-efficiency).
- Batch independent reads and searches where the tool supports it, and reuse findings already
  established during the same planning phase instead of re-searching the same symbol or concept.
- Preserve architectural invariants and existing working behavior.
- Classify the change (`PRESENTATION_ONLY`, `LOCAL_UI`, `SUBSYSTEM_LOGIC`, `SHARED_CONTRACT`) with the
  canonical classes in `docs/agent-execution-rules.md` §4, then select the narrowest verification from
  `docs/verification-map.md` / `docs/testing.md`. State the class and the expected stop point in
  `VERIFICATION`. Reference the policy; do not restate it in the handoff.
- Decide `DOC IMPACT` from `AGENTS.md` §3: required only when architecture, ownership, subsystem
  boundaries, control flow, data flow, persistence, or integration behavior changes.
- Decide whether browser verification is warranted using `docs/agent-execution-rules.md` §6. It is
  conditional, never mandatory.
- Write the transfer artifact to `docs/tasks/YYYY-MM-DD-short-task-name.md`, or hand the fields
  below directly when the work continues in the same turn. Keep it to actionable facts and
  references; omit transcripts, reasoning logs, repeated terminal output, and large code dumps. The
  Planner transcript is disposable once the spec exists — a fresh Implementer must be able to start
  from this handoff alone.

## Handoff structure

The handoff is the implementation contract. It must be complete enough for a fresh Implementer and a
fresh Verifier, without carrying the Planner's transcript.

```text
TASK
<one-line implementation objective>

FINDINGS
- what the inspected source actually shows, with file/symbol references
- the evidence the rest of the handoff is derived from

SCOPE
- exact surface/subsystem
- allowed change types

RELEVANT FILES
- files the Implementer must inspect or change, with why each matters

PRESERVE / INVARIANTS
- existing handlers, state, data flow, and invariants that must remain unchanged

OUT OF SCOPE
- only the adjacent systems investigation shows should not be modified
- omit everything else; a long generic exclusion list is a defect, not thoroughness
- any scope expansion discovered during planning goes here, explicitly

IMPLEMENTATION DIRECTION
- smallest reasonable implementation approach
- whether JSX / CSS / state / data-flow changes are allowed
- whether a refactor is justified (normally: no)
- whether minimal in-subsystem compatibility fixes are permitted

CHANGE CLASS / RISK
PRESENTATION_ONLY | LOCAL_UI | SUBSYSTEM_LOGIC | SHARED_CONTRACT
- one line of why the class fits

VERIFICATION
- exact proportional verification expected, and the expected stop point
- browser target only if warranted
- escalation rule if targeted verification reveals wider impact
- reference the policy, do not copy it

ACCEPTANCE CRITERIA
- observable result
- regressions that must not occur

DOC IMPACT
- required / not required
- exact domain doc when required

OPEN QUESTIONS / RISKS   (omit when none)
```

### What the Planner owns

Implementation scope, execution scope, out-of-scope boundaries, invariants, change classification,
verification scope, acceptance criteria, and documentation impact. These are derived, not copied from
the user's phrasing, and the Implementer consumes them rather than re-deriving them.

The handoff stays compact. It names task-specific facts and references; it does **not** restate
repository-global policy (retry policy, Terminal Loop Guard, no watch mode, verification
proportionality, doc-update policy). Those live in `AGENTS.md`, `docs/agent-execution-rules.md`,
`docs/testing.md`, and are referenced. A handoff that reproduces global policy is a bad handoff; a
handoff that omits a real task-specific boundary is also a bad handoff.

## Compactness

Distinguish two kinds of content:

- **A. Repository-global rules** — retry policy, Terminal Loop Guard, no watch mode, verification
  proportionality, doc-update policy. These live in `AGENTS.md`, `docs/agent-execution-rules.md`,
  `docs/testing.md`, and the role files. The handoff **references** them ("follow repository
  Terminal Loop Guard"), never pastes them.
- **B. Task-specific boundaries** — this task's surface, preserved behaviors, and genuine
  exclusions. These belong in the handoff.

A handoff that reproduces global policy is a bad handoff. A handoff that omits a real
task-specific boundary is also a bad handoff.

## Scope derivation example

User request: *"Mobile Full card still wastes space around Translate and AI. Inspect and make a plan
to compact the controls."*

Investigation finds the layout in the Full-card component plus the reader-layout stylesheet, that the
existing handlers already work, and that no lookup-pipeline change is needed. Derived handoff:

```text
SCOPE
- mobile Full-card control composition and layout

PRESERVE / INVARIANTS
- existing Language / More / Translate / AI / Show-less handlers

OUT OF SCOPE
- lookup resolution and provider logic
- desktop and Quick surfaces, unless shared CSS forces a compatibility adjustment

CHANGE CLASS / RISK
LOCAL_UI

VERIFICATION
- targeted component check + typecheck
- one narrow mobile browser check
- no subsystem or full verification unless the scope widens
```

The user supplied none of the middle clauses. The Planner derived them.

## Over-scoping

Do not produce broad exclusion lists because many subsystems exist. Include an `OUT OF SCOPE` entry
only when the system is adjacent to the implementation, plausibly affected, or important to prevent
scope creep. For a Quick Card color change, listing PDF, OCR, storage, import, vocabulary, and
gateway adds nothing; "presentation-only Quick Card theme; no behavior or data-flow changes" is
sufficient.

## Open questions

If the requested behavior cannot be pinned down from the repository, resolve what the evidence
supports and record the remainder under `OPEN QUESTIONS / RISKS` rather than asking the user to
enumerate repository-wide scope. Ask the user only about a genuine product-behavior decision that
code and docs cannot answer.
