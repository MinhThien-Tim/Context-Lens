# Agent Execution Rules

Detailed workflow for agents changing this repository. Read [`AGENTS.md`](../AGENTS.md) first — it holds
the short, high-priority rules. This file covers *how* to execute a task.

Architecture lives in [`ARCHITECTURE.md`](ARCHITECTURE.md). Test structure, runners, and the full command
table live in [`testing.md`](testing.md) and are **not** duplicated here. This document decides *when and
how far* to verify, and *when to stop*.

## Precedence

```text
task-specific instructions  >  AGENTS.md  >  this document  >  domain architecture docs
```

Code and config (`vite.config.ts`, `package.json`, `playwright.config.ts`) are the final authority for
behavior and facts. When a doc and the code disagree, the code is right and the doc gets fixed in the
same task.

## 1. Scope discipline

Establish before the first edit:

```text
TASK
AFFECTED SUBSYSTEM   (one domain doc from the ARCHITECTURE.md routing table)
LIKELY FILES
ARCHITECTURAL INVARIANTS AT RISK   (docs/ARCHITECTURE.md; COST & QUOTA GUARDRAILS.md)
TESTS REQUIRED
```

- Change only the subsystem named in the task. Adjacent code is not an invitation.
- No opportunistic cleanup, drive-by refactors, formatting sweeps, or renaming.
- An unrelated defect discovered mid-task is **reported, not fixed**, unless the task explicitly
  includes it.
- Do not add dependencies, tooling, or configuration that the task did not ask for.

## 2. Architecture-first navigation

1. `docs/ARCHITECTURE.md` → subsystem map, entry points, invariants, routing table.
2. The single matching domain doc: `reader.md`, `translation-pipeline.md`, `ui-system.md`,
   `data-storage.md`, or `testing.md`.
3. Only the source files that domain doc names.

- **Never** start with a recursive repository scan or a broad search for a concept.
- Docs are a navigation aid, not truth. When a documented path or contract looks wrong against the
  source, verify the source and correct the doc.
- Do not re-verify the whole documentation set. Check only the subsystem being changed.
- Do not re-read a large unchanged file when only one unknown region is needed; read the range.
- Anything under `docs/archive/` is historical background, not current architecture, and is never
  part of the default reading path. Read a file there only when the task explicitly asks about that
  history, a past regression, or an old measurement. Code, config and the active docs override it.

### Architecture doc maintenance

Update the affected domain doc **in the same task** when the change alters architecture, ownership,
subsystem boundaries, control flow, data flow, persistence, or meaningful integration behavior.

Do **not** update architecture docs for: copy, naming, style values, test-only additions, or isolated
bug fixes. Architecture docs describe current structure, not task history.


## 3. Token and context efficiency

- Search exact filenames, symbols, and config keys first; read the matching range second.
- Do not load large data assets into context: the `release/dictionary` and `release/wordnet` packs,
  `tmp/` fixtures, lockfiles, build output, and captured JSON reports.
- `release/` assets and `tmp/pdf-baseline` are build inputs, not code to refactor.
- Reuse what an earlier read already established instead of re-reading it.
- When context is already large and the implementation is stable, stop expanding it and produce a
  handoff rather than carrying the session forward.
- Run targeted searches with a narrow question; avoid queries that return whole directories.

## 4. Verification proportionality

Effort tracks **blast radius**, not test availability. `docs/testing.md` has the commands; this table
decides how many of them are justified.

| Risk | Typical change | Justified verification |
| --- | --- | --- |
| **Low** | Copy, token rename, style value, isolated pure function | Documentation/link/diff checks for docs-only changes. For code, an optional colocated pre-check; use the subsystem command as authoritative verification when a bucket applies. |
| **Medium** | Pipeline stage, normalization, provider adapter, cache key, component logic, Dexie record shape | The subsystem `verify:*` command. Add a colocated test next to the change. |
| **High / shared contract** | Dexie schema version, `TRANSLATION_VERSION` / `CONTEXT_VERSION` / `OCR_CONFIG_VERSION`, cache keys, location shapes, backup schema, provider priority, cross-subsystem state | The subsystem `verify:*` command, escalating to `verify:full` as the gate. |
| **Browser-observable** | Selection/highlight, PDF canvas or OCR queue, layout/responsive, focus/scroll/panel, PWA install or offline | High-risk checks plus one narrow Playwright spec (§6). |

Documentation-only tasks require document/link/diff checks, not application tests.
Verification execution and reporting shape follow [§8](agent-execution-rules.md#8-verification-execution-and-reporting).

Two hard exclusions:

- **No watch mode.** `npm run test:watch` never exits and must not be started in an agent session.
- **No full-suite reflex.** `npm test` is justified only by the "High / shared contract" row or by a
  targeted test revealing an unexpected cross-module dependency. Full suite once, at final
  verification, when scope warrants it.

## 5. Test escalation order

1. **Targeted unit test** — optional iteration pre-check: the colocated file, for example `npx vitest run src/path/file.test.ts`. After implementation, the subsystem command is authoritative when a bucket applies.
2. **Narrower still** — optional iteration pre-check only: a single case, for example `npx vitest run src/path/file.test.ts -t "name"`.
3. **Typecheck** — already batched inside the subsystem `verify:*` command whenever a bucket applies; otherwise run `npm run typecheck` only when types, public signatures, or Dexie records changed.
4. **Integration** — optional pre-check for cross-pipeline behavior; if outside all nine buckets, `npx vitest run src/integration/languageFlow.test.ts` is a fallback.
5. **Full suite** — already batched in `verify:full`; use only per §4.
6. **Build** — already batched in `verify:full` for bundle or precache changes; for files outside all nine buckets use `npm run build`. Use `npm run check:bundle` when only budgets moved.
7. **Browser** — `npx playwright test e2e/<spec>.spec.ts`, only per §6.

Tests must not reach the network. Stub `fetch` (see `src/lookup/webDictionary.test.ts`) and rely on
`fake-indexeddb` via `src/test/setup.ts`. Never weaken a test to make it pass — fix the code or report
the failure.

## 6. Browser E2E (Playwright)

Playwright is **not banned** and **not mandatory**. `playwright.config.ts` defines two projects —
`laptop` (1366×900) and `mobile-chromium` (Pixel 7) — with single-worker execution, a 120 s timeout, and
`channel: 'chrome'`. It starts a Vite dev server automatically, so it is heavy relative to Vitest.

Warranted when the change is genuinely browser-level:

- reader interaction, selection, highlights, notes, or lookup sheet behavior;
- browser persistence (IndexedDB via Dexie, service-worker cache);
- PDF canvas, text layer, or OCR queue behavior;
- layout, responsive, or theme/mobile interaction;
- focus, scroll, or panel behavior.

Not warranted for: dictionary or translation logic, normalization, provider fallbacks, storage
schema, doc-only edits, refactors, or anything already covered by a colocated Vitest suite.

When warranted, run the **narrowest** target and never the whole directory:

```bash
npx playwright test e2e/ui-interactions.spec.ts --project=laptop
npx playwright test e2e/pdf-mode-layout.spec.ts -g "reader chrome"
```

`npm run test:browser` (the full `playwright test` run) is reserved for release-level checks.
`e2e/vocabulary-handoff.spec.ts` is excluded by the default config and needs
`playwright.vocabulary.config.ts` plus the sibling English101 checkout; without it, that spec is
`BLOCKED`, not a failure.

## 7. Execution / Test Retry Policy

This section is the canonical owner of retry, execution, environment, completion and token rules.
Status meanings live in [testing.md](testing.md#verification-status-semantics).
Use the **current session's actual capabilities**, never the model or agent name.

### Classify before retrying

- **Code failure:** the test ran and an assertion, compilation, runtime or product behavior failed.
  This evidence may justify targeted implementation debugging.
- **Launcher / shell failure:** the test did not run because a launcher or wrapper could not execute:
  for example `npm.ps1` or `npx.ps1` blocked by PowerShell Execution Policy, or known wrapper
  incompatibility. This is not evidence of a code defect.
- **Environment / permission failure:** access denied, sandbox, security policy, permissions or an
  unavailable runtime/browser/capability prevents execution. This is not evidence of a code defect.
- **Completion unknown:** execution occurred or may have occurred, but the final result cannot be
  reliably observed. This is neither `PASS` nor `FAIL`.

### Capability and security boundary

A session permitted to execute the equivalent command may use **one safe equivalent launcher** for a known launcher issue:
`npm.ps1` to `npm.cmd`, `npx.ps1` to `npx.cmd`, or a known broken wrapper to an equivalent direct
executable already available on the machine. Preserve the test target, arguments and scope.
This is launcher substitution, not a security bypass: it is allowed only when security is unchanged
and the session actually has permission to execute it. A restricted/sandboxed session must stop the
denied execution path unless the official approval mechanism below authorizes a scoped retry;
never escape or circumvent a restriction.

"Capable session" does not mean the Codex **Full access** permission mode. A sandboxed session may
execute permitted local commands. A `.ps1` Execution Policy error alone is a launcher failure, not
proof that the sandbox denies `.cmd`. On Windows PowerShell, prefer `npm.cmd` / `npx.cmd` from the
first attempt; do not deliberately repeat a known `.ps1` failure. This counts as the normal attempt.
If `.ps1` was already attempted, use the single `.cmd` fallback before declaring that launcher path
blocked, unless a higher-priority instruction explicitly prohibits it or execution is already denied.

If `.cmd` starts Vitest but Vite/esbuild then reports `spawn EPERM`, classify it as a startup
permission failure; no test result was produced. Apply the official approval path below if available,
otherwise report `BLOCKED`. Do not keep reporting `npx.ps1` as the cause or try further launchers.
A launcher failure for one check does not automatically block
independent required checks such as `npm.cmd run typecheck` within the existing task scope.

Never change PowerShell Execution Policy, use `ExecutionPolicy Bypass`, disable security controls,
request Windows administrator/UAC elevation, change machine-wide security settings, install global tooling to bypass a
restriction, create bypass/helper scripts, or repeatedly switch shells.

### Official approval for a sandbox execution denial

When a required local check is denied inside the sandbox (for example esbuild child-process
`spawn EPERM`), and the current tool permits approval requests, request **one narrowly scoped retry**
through that tool's official mechanism. For Codex `exec_command`, use
`sandbox_permissions: "require_escalated"` with the exact test command and a justification identifying
the failed operation. Preserve the runner, configuration, arguments and test scope. Prefer `.cmd`
from the first Windows attempt so this authorized retry fits the two-attempt budget.

This requests an approved execution boundary for that command; it does not authorize changing
Windows security policy, running as administrator, or editing Codex permission configuration.
Let the configured reviewer approve or deny the request. Repository instructions cannot grant tool
permissions. Do not invent a blanket approval or require the user to enable Full access first.

The approved execution counts as the second attempt, not an extra attempt. If approval is denied,
unavailable, prohibited by higher-priority instructions, or the authorized execution is still blocked,
stop and report `BLOCKED` with the actual reason. Do not resubmit or switch tools to evade a denial.
If the budget is already exhausted, report the gap; resume only after an explicit user instruction
authorizes a new scoped attempt. Do not reset the budget merely because a new turn begins.
Once execution succeeds, classify its actual test results as `PASS` or `FAIL`.

### Strict execution budget

For **each launcher/environment problem**, maximum **2 execution attempts total**:

1. Normal documented command.
2. Use **one** of: a safe equivalent launcher for a known launcher issue; an officially approved
   retry for a sandbox denial; or one direct confirmation of an ambiguous environment cause.
   These alternatives share the same two-attempt budget; they are not cumulative. A confirmed
   restriction permits no unapproved retry.

After the budget is exhausted, stop and report `BLOCKED`. Do not chain `npm`, `npm.cmd`, `cmd /c npm`,
PowerShell bypass, helper scripts, another terminal, background processes, process inspection,
temporary-log inspection and further retries. Do not reset the budget by switching tools.
Do not broadly diagnose the OS, inspect unrelated environment configuration, install tools, search
temporary directories repeatedly, or escalate to heavier tests because execution was blocked.

### Genuine code failures

The launcher budget does not limit normal debugging of a confirmed `FAIL`: inspect the exact failure,
make a targeted implementation/config fix, then rerun the affected test. Every rerun must follow a
meaningful code/config change or a clearly identified reason why another execution is necessary.
Never repeatedly rerun an unchanged failing test. Do not automatically escalate to the full suite.
A `BLOCKED`, `UNRESOLVED` or `NOT RUN` result never justifies a product fix.

### Completion unknown and long-running commands

Allow at most **one direct result-status check per problem**. Use existing evidence before launching
anything new, in this order: existing final test report, existing exit/result file, then final output
already produced by that command. If one check cannot establish the final result, report `UNRESOLVED`
and stop the verification path.

A legitimately long-running test is not automatically a failure. Do not start another copy, restart
it because shell integration is uncertain, or repeatedly poll it through model calls. Use its existing
result once available; if the environment cannot reliably wait for or observe it, report `UNRESOLVED`.
Do not repeatedly inspect process lists, terminal status, temporary directories, timestamps, logs or
server state, or create a sequence of model calls just to determine whether a command finished.

### Decision rule

```text
Test ran + confirmed passing result -> PASS -> stop.
Test ran + confirmed code/test failure -> FAIL -> targeted diagnosis/fix -> justified affected-test rerun.
Test did not run:
  Known launcher issue + capable session -> one safe fallback -> evaluate normally if it runs;
    still prevented -> BLOCKED -> stop.
  Sandbox execution denial + approval available + budget remaining -> one scoped approval request:
    approved -> execute the same check -> classify actual result;
    denied / still blocked -> BLOCKED -> stop.
  Other confirmed restriction / unavailable capability / exhausted budget -> BLOCKED -> stop.
  Ambiguous environment cause -> at most one direct confirmation within execution budget -> stop if blocked.
Completion unknown -> one direct result check -> confirmed PASS/FAIL, or UNRESOLVED -> stop.
```

### Reporting and context guardrail

For blocked verification, report:

```text
STATUS: BLOCKED
REASON: <confirmed restriction>
ATTEMPTS: <commands/confirmation and count>
LAST CONFIRMED SUCCESS: <last successful check, or none>
UNVERIFIED SCOPE: <remaining verification gap>
```

Use the same fields for `UNRESOLVED`, naming the missing final-result evidence. Environment
troubleshooting must remain cheaper than verification: maximum two execution attempts, maximum one
direct result check, no repeated polling, broad environment diagnosis, repository rescan or repeated
large-log reading. This applies especially when context is already large. If verification cannot be
established within these limits, stop and report; do not consume a large context for a minor result.
A blocked targeted E2E check does not justify full E2E, full unit tests, another server, process
inspection or log-inspection loops. Record the gap and stop that path.

## 8. Verification execution and reporting

- **Batching:** Verification is command-batched: run one subsystem command per check. Each `verify:*`
  command chains `typecheck` and its Vitest scope; `verify:full` also adds `build`. When a subsystem
  command exists, do not split it into separate model-controlled `typecheck` → single-test → `build`
  turns.
- **Command selection:** Pick the bucket from the per-subsystem table in [testing.md](testing.md#per-subsystem-verify-commands):
  `verify:reader`, `verify:pdf`, `verify:import`, `verify:lookup`, `verify:language`,
  `verify:translation`, `verify:storage`, `verify:ui`, `verify:offline`, or `verify:full`.
  That table remains the single source of the command list. Use `verify:full` only for the §4
  “High / shared contract” row.
- **Authoritative check:** A single colocated `vitest run <file>` is an optional fast pre-check while
  iterating. The authoritative result is one subsystem command; never report a lone file run as
  subsystem verification.
- **No polling:** Never poll a running command across repeated model turns; follow §7 “Completion
  unknown and long-running commands.”
- **Reporting contract:**
  - `PASS`: command · test count from the runner's own summary line · typecheck/build status. Do not
    include passing test logs or run a separate listing command for the count.
  - `FAIL`: failing command · failing test/file · relevant error or assertion · at most ~100 lines of
    surrounding output. Strip successful logs. Identify whether each failure is pre-existing or
    newly introduced when evidence establishes that distinction.
  - `BLOCKED` / `UNRESOLVED`: use the §7 field block unchanged.
- **No rerun of green:** A passing verification is not rerun unless relevant source changed; see
  §11 “re-running already-passing checks.”
- **Retry budget:** §7 remains the sole owner of retry semantics. Use at most one normal execution and
  one known launcher fallback (`npm.ps1` → `npm.cmd`); stop on environment, permission, or
  completion-observation failure. This section creates no parallel retry budget.

## 10. Code changes based on evidence

- A `BLOCKED`, `UNRESOLVED`, or `NOT RUN` check is **not** a defect. Do not edit implementation to
  compensate for a test that never ran.
- Change code only on evidence of a real defect or a clearly justified requirement.
- If verification is blocked, finish the implementation if it can be done safely, then report.

## 11. Stop condition

When the implementation is complete and reasonable verification is done or appropriately blocked,
**stop**. Do not continue with:

- unrelated cleanup or drive-by refactors;
- speculative future-proofing;
- re-running already-passing checks without a concrete reason;
- heavier tests merely because they exist.

## 12. Final handoff

Keep it short and factual:

```text
Files changed:         <paths>
Implementation:        <what changed and why, 1–3 lines>
Architecture docs:     <updated, or "not required — no structural change">
Tests run:             <command — PASS|FAIL|BLOCKED|UNRESOLVED|NOT RUN>
Not verified:          <check + reason, if any>
External behavior:     <network/provider/Worker impact, or "none">
Out-of-scope findings: <unrelated issues noticed but not fixed>
```

Do not ask a follow-up agent to rescan the repository; point at the specific files listed above.
