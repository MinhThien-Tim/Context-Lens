# Agent Execution Rules

Read [`AGENTS.md`](../AGENTS.md) first. This file defines *how far to go, when to verify, and when to stop*.
Architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md). Test commands: [`testing.md`](testing.md) (not duplicated here).

```text
Precedence: task instructions > AGENTS.md > this document > domain docs
```

Code and config (`vite.config.ts`, `package.json`, `playwright.config.ts`) are the final authority. When a doc
and the code disagree, the code is right and the doc is fixed in the same task.

See [Change propagation](change-dependencies.md) for the rule that governs how edits affect dependent layers.

## 0. Hard rules

The 12 hard rules live in [`AGENTS.md`](../AGENTS.md#hard-rules) and are the only copy. This document holds the
detail behind them. Check them before every tool call, edit, commit and report.

## 1. Scope

Establish before the first edit (a Planner handoff already supplies these; otherwise derive them):

```text
TASK · AFFECTED SUBSYSTEM (one domain doc) · RELEVANT FILES
INVARIANTS AT RISK (ARCHITECTURE.md; COST & QUOTA GUARDRAILS.md) · CHANGE CLASS (§4) · VERIFICATION REQUIRED
```

- Change only the named subsystem. Smallest diff. No drive-by refactor, rename, formatting sweep, dependency or
  config change.
- Do not delete or rename files, components, exports, tests or docs unless the task says so; show `rg` proof of
  no remaining users first.
- A doc describes only what **main actually contains**. Every file, script, config key and command a doc names
  must exist on `main`, and a missing one is either created or removed from the doc — in the same task. A doc
  pointing at a file that was never committed, or renamed away, is worse than no doc.
- Frozen contracts are never edited to match code. Contract changes need owner approval first.
- Do not call a defect "pre-existing" or "deferred" without `git log -S` / `git show` evidence.
- Update the domain doc in the same task only when architecture, ownership, boundaries, control/data flow,
  persistence or integration behavior changed. Not for copy, naming, style values, test-only additions or
  isolated bug fixes.

## 2. Honesty and root cause

**Reports**
- Separate **FACT** (command output, file:line, measured value), **INTERPRETATION**, **UNKNOWN**.
- Never invent line numbers, test names, file names or causes. Not read this session = unverified.
- Re-check any earlier claim the current step depends on; do not trust your own prior report.
- Report failures first, plainly. No "minor" / "calibration" / "unrelated" without evidence.
- If numbers do not add up or a report contradicts itself, resolve that before concluding.

**Fixing**
- Rule out the main alternatives with evidence before declaring a cause.
- Fix the cause, not the symptom: no extra timeouts, retries, aliases or compat shims to make a measurement pass.
- After a fix, show before/after measurement and add a test that would have failed before.

## 3. Request and context efficiency

**Navigation.** `AGENTS.md` → `ARCHITECTURE.md` → **one** matching domain doc → the source files it names.
Never start with a recursive scan or a broad concept search. `docs/archive/` is history, read only when the
task asks for it. Docs are a navigation aid; verify against source for the subsystem you change.

**Control-flow files are read sequentially**: role file → `AGENTS.md` → policy sections → target files.

**Reads**
- Batch only reads that are independent **and** needed now. Several in one response, not one per turn.
- Read the exact range, not the whole file. Do not re-read an unchanged file.
- Search exact filenames, symbols and config keys first, then read the matching range. Search ASCII
  identifiers (Windows corrupts Vietnamese strings).
- Never load `release/dictionary`, `release/wordnet`, `tmp/` fixtures, lockfiles, build output or captured JSON
  reports. `release/` and `tmp/pdf-baseline` are build inputs.
- Tool results belong to calls in submission order. If one looks wrong, re-read that one file once.
- Context large and implementation stable → stop expanding, write the handoff.

### Identical-query loop

Normative. A call that returned an answer, including zero matches or a rendered
page, is never re-sent unchanged. Reordering parameters, widening paths, changing `head_limit` or adding new
narration in front of the same payload is the same call.

Only two re-issues are legitimate:
1. **Batch instead of repeat**: independent reads go in one response.
2. **A preceding fact changed**: code edited, file regenerated, decision invalidated the result. State the reason.

One more is bounded: a *failed exact match* before an edit → re-read the exact target text once, never rebuild
the string from memory.

When you notice you repeated a call: stop, do not re-send, continue from existing results. Do not narrate the
correction at length.

### Zero-result evidence

A zero-result search (`rg`, `git log -S`, `git log --diff-filter=A`) is **not** the claim "does not exist". A
pattern, a path filter and a revision range each hide matches silently. Before a zero result is used as
evidence, confirm it with a **second, independent method**:

| Question | Method A | Method B |
| --- | --- | --- |
| Does this symbol/file exist? | `rg` over the repo | `git ls-files`, or `git log --all --diff-filter=A -- <path>` |
| Which commit changed this? | `git log -S'<token>'` | `git log --all -G'<regex>' -- <path>` |

Then state only what the two results together prove: *"no match under `rg` (repo) or `git log --all -G`"*, not
*"the file does not exist"*. A second method that agrees on a zero result still proves only that the union of
both searches found nothing. Incidents: `git add --renormalize --dry-run` (stages, does not dry-run),
`git show … | Out-String` (inserts CRLF on Windows, reporting bare-LF blobs as CRLF).

### Search and output overflow

Truncated, preview-only or auto-offloaded output. Re-running is a loop. Instead, once:
1. Diagnose the pattern, not the output. Over-broad here: `\[[^\]]*\]\s*=`, `\[.*\].*=`, `\w+\[`, bare `=`,
   unanchored two-token alternations.
2. Re-anchor on the construct (`Object.hasOwn(`, `new Map(`, `Record<string`, `= {}`, identifier-anchored
   `name[key] =`) and narrow `paths` to files the domain doc names.
3. If a broad result is truly required, read the offloaded file with bounded `grep` / `view_range`; delete it at
   task end.
4. One broadening attempt, then stop and report.

Incidents behind these rules: 2026-10-04 the same `grep` was sent ~15 times; 2026-10-02 a truncated search was
re-sent 8 times. Both returned zero new information.

**No polling** of a running command, process or server. **No numeric cap on total requests**: the rule targets
redundant calls, never total volume. Do not scan unrelated subsystems.

**Roles.** Planner: compact batched inspection, stop once scope, invariants, class and verification are set.
Implementer: use the handoff scope, verify only files it cites, do not repeat discovery. Verifier: inspect the
final diff first, run only checks the class requires, do not repeat passing checks.

## 4. Verification proportionality

Effort tracks **blast radius**. Classify the changed *behavior*, not the directory. Commands come from
[`verification-map.md`](verification-map.md) and [`testing.md`](testing.md).

| Class | Typical diff | Default verification | Not by default |
| --- | --- | --- | --- |
| `PRESENTATION_ONLY` | CSS values, layout, spacing, responsive rules. No JS/TS/TSX behavior change | `npm run check:css`; one narrow browser check only if browser-observable | `typecheck`, `verify:*`, Vitest, `verify:full` |
| `LOCAL_UI` | Reordered/moved controls, local render conditions. Handlers, state, data flow unchanged | Targeted colocated Vitest; `typecheck` if TS/TSX changed; one narrow Playwright spec if layout/focus/scroll needs proof | whole-subsystem `verify:ui` / `verify:lookup` |
| `SUBSYSTEM_LOGIC` | Behavior, state transitions, lookup/parser/provider/storage logic inside one subsystem | Mapped `verify:*` command; colocated test next to the change | `verify:full` |
| `SHARED_CONTRACT` | Dexie schema/version, shared cache keys, provider priority, persisted shape, backup schema, build/PWA/Worker | Mapped `verify:*`, escalating to `verify:full` | none |

**Stop rule (presentation-only).** All must hold: every changed production file is presentation CSS; no config,
build, PWA/Worker or Dexie file changed; nothing moved into `verify:*` scope. Then run `check:css`, optionally
one narrow browser check, and stop.

**Escalation.** `LOCAL_UI` → subsystem command only if shared behavior or state changed, targeted verification
exposed a wider dependency, or the component is an integration boundary. A handler or state change makes it
`SUBSYSTEM_LOGIC`. A blocked targeted check never justifies broader testing.

**Hard exclusions.** `npm run test:watch` never runs in an agent session. `npm test` only for `SHARED_CONTRACT`
or an unexpected cross-module dependency, once, at final verification.

Doc-only tasks: document, link and diff checks only.

## 5. Tests

**Escalation order** (stop at the step the class requires): targeted Vitest → single case (`-t`) → `typecheck`
(already inside `verify:*`) → integration → `verify:full` → build → browser. Run the smallest spec first, the
domain next, the full suite **once** at phase end.

**Browser E2E.** Playwright has projects `laptop` (1366×900) and `mobile-chromium` (Pixel 7), single worker.
Warranted for: reader interaction/selection/highlights/lookup sheet, IndexedDB or service-worker persistence,
PDF canvas/text layer/OCR queue, layout/responsive/theme, focus/scroll/panels. Not warranted for dictionary or
translation logic, normalization, provider fallback, storage schema, doc-only edits, refactors, or anything
already covered by Vitest.

- Run the narrowest target, never the directory: `npx playwright test e2e/<spec>.spec.ts --project=laptop`
  (add `-g "<name>"`). Use `--grep` and a 10 s `actionTimeout` so a stuck test fails in seconds.
- One spec, one project is enough for `PRESENTATION_ONLY` / `LOCAL_UI`. Do not run both projects by reflex.
- `npm run test:browser` is release-level only. `e2e/vocabulary-handoff.spec.ts` needs its own config and the
  sibling English101 checkout; without it the spec is `BLOCKED`, not failed.

**Hygiene**
- Test behavior and contract; use role/aria-name/state selectors. No CSS classes or pixel constants outside
  dedicated geometry tests.
- A test that fails after your change is classified (§9) **before** any edit.
- New behavior ships with a test in the same phase; a bug fix ships with a regression test.
- A test may be deleted only if the behavior is intentionally retired (cite spec) or a replacement lands in the
  same commit.
- Build the condition explicitly (e.g. a wide-page PDF fixture); never rely on viewport, fixture size or timing.
- An e2e helper **throws** when an element is absent; it never returns `null` or an empty locator. A helper that
  swallows the miss converts a clear `element(s) not found` into a later assertion on a different surface.
- Classify a missing element by **band before anything else**: measure `closest('header')` / `closest('footer')` of
  the target (or the container the band owns) first. The same control is Header-owned at `>=1024px` and
  Footer-owned in the mobile band, so an unlocated element is a band-routing fact, not a missing control.
- Measure in the state claimed (100% before 150%). No `waitForTimeout`; poll a real condition (`expect.poll`).
- One test per viewport, no `for` loop over viewports. Name tests with the contract section (`§9.2: ...`).
- Tests are in `tsconfig`; prop and type changes break `tsc`.
- Tests never reach the network: stub `fetch`, use `fake-indexeddb` via `src/test/setup.ts`.
- A fix is verified **at the tier that detected the bug**: a browser bug in a `@pdf`/`@heavy` spec is re-run as
  that spec, not as the Vitest suite that cannot exercise it. Verifying a browser fix with a pass that never
  loads the surface proves nothing.

**Contract sync.** Behavior change order: spec → code → tests → docs, as separate commits that each typecheck.
UI labels, roles, aria-names and selectors that tests use are contract; change them with their tests in the same
phase. Component/file names in docs and comments must match the code. State lifecycles (idle/running/paused/done/
error) must name who sets and who clears each state; a terminal state never cleared is a bug. After moving a
node in the DOM, re-check CSS scoped to its old ancestor. One owner per control per breakpoint band.

## 6. Working tree and commits

- `git status --short` before and after every step; paste it. Use `git --no-pager`.
- Before a step that edits many files: `git diff > backup-wip.patch` (gitignored, uncommitted).
- **Forbidden without explicit permission:** `git reset --hard`, `git clean`, `git checkout -- <file>`,
  `git restore` on files you did not edit, `git stash drop`, force push, rewriting pushed history, amending
  pushed commits, `taskkill /IM node.exe`.
- Probe/debug files go in `.tmp/` or `test-results/` (gitignored), never the repo root; delete them at task end.
- **Compare against another revision with a worktree**, never `git stash`: stash mutates the one working tree
  the task depends on and loses untracked or ignored files. `git worktree add --detach <dir> <rev>` reads a past
  revision without touching the current tree; junction `node_modules` from the main checkout to avoid a reinstall.
  Prune with `git worktree list` + `git worktree prune`; a registered entry whose directory is gone still lists
  and `git worktree remove` reports "is not a working tree" until `.git/worktrees/<name>` is deleted.
- Never leave a half-applied change: finish the step, or revert exactly your own edits and say so.
- **Commits:** one logical change per commit; never mix product code, CSS, tests, docs/spec, `.gitignore`.
  Commit as soon as the task is accepted and its verification is green. Order: spec → code → tests.
  After each commit report `git status --short` and `git --no-pager log --oneline -3`. Never commit failing
  work as finished; park unapproved work on `wip/<name>`.

## 7. Execution / Test Retry Policy

Owner of retry, environment and completion rules. When in doubt, stop and report.

### Terminal Loop Guard

**On any failure, classify first:**

| Class | Meaning | Action |
| --- | --- | --- |
| `CODE` | Test ran; assertion, compile or runtime failed | Targeted debug, fix, rerun the affected test (needs a real change) |
| `LAUNCHER` | Wrapper could not execute (e.g. `npm.ps1` blocked by Execution Policy) | One safe equivalent launcher, then stop |
| `ENVIRONMENT` | Access denied, sandbox, missing browser/runtime | Stop, report `BLOCKED` |
| `UNKNOWN` | Result cannot be reliably observed | One direct result check, then `UNRESOLVED` |

**Budget:** max **2 execution attempts per launcher/environment problem**; max 1 direct result check. The
fallback, approval retry and confirmation share that budget; they are not cumulative. Do not reset it by
switching tools or starting a new turn.

**Launcher fallback.** `npm.ps1`→`npm.cmd`, `npx.ps1`→`npx.cmd`, preserving target and arguments. On Windows
PowerShell use `.cmd` from the first attempt; do not deliberately repeat a known `.ps1` failure. If `.cmd`
starts Vitest but Vite/esbuild reports `spawn EPERM`, that is a startup permission failure with no test result.
A blocked launcher for one check does not block independent checks such as `typecheck`.

**Sandbox denial.** If the tool offers approval, request **one** scoped retry through its official mechanism
(Codex: `sandbox_permissions: "require_escalated"`, exact command, justification naming the failed operation).
It counts as the second attempt. Denied, unavailable or still blocked → `BLOCKED`. Never raise an approval after
the user interrupted (§11).

**Never:** change Execution Policy, use `ExecutionPolicy Bypass`, request administrator/UAC elevation, disable
security controls, install global tooling to bypass a restriction, create bypass/helper scripts, switch shells
repeatedly, or chain `npm` / `npm.cmd` / `cmd /c npm`. Do not diagnose the OS broadly, search temp directories,
or inspect process lists, logs or timestamps in a loop. A blocked E2E check never justifies full E2E, full unit
tests, another server or log-inspection loops.

**Genuine code failures** are not limited by this budget: inspect the exact failure, make a targeted fix, rerun
the affected test. Every rerun follows a real change. Do not escalate to the full suite automatically.
`BLOCKED`, `UNRESOLVED` and `NOT RUN` are not defects and never justify a product edit (§10).

**Long-running commands.** Do not start a second copy, restart because shell integration is unclear, or poll
across model turns. Check once, in order: existing final report → existing exit/result file → final output
already produced. Cannot establish → `UNRESOLVED`, stop that path.

```text
Ran + confirmed pass                  -> PASS -> stop
Ran + confirmed failure               -> FAIL -> targeted fix -> justified rerun
Did not run:
  launcher issue                      -> one safe fallback -> evaluate; still blocked -> BLOCKED
  sandbox denial + approval available -> one scoped request -> approved: classify result; denied: BLOCKED
  other restriction / budget spent    -> BLOCKED
  ambiguous cause                     -> one direct confirmation -> stop if blocked
Completion unknown                    -> one result check -> PASS/FAIL or UNRESOLVED
```

**Blocked / unresolved report:**

```text
STATUS: BLOCKED | UNRESOLVED
REASON: <confirmed restriction, or missing final-result evidence>
ATTEMPTS: <commands and count>
LAST CONFIRMED SUCCESS: <check, or none>
UNVERIFIED SCOPE: <remaining gap>
```

Troubleshooting must stay cheaper than verification. If verification cannot be established within these limits,
report and stop rather than consume a large context.

## 8. Verification execution and reporting

- Run **one subsystem command per check** (`verify:reader|pdf|import|lookup|language|translation|storage|ui|offline|full`).
  Each chains `typecheck` and its Vitest scope; `verify:full` adds `build`. Do not split it into separate
  model-controlled turns. Command table: [`testing.md`](testing.md#per-subsystem-verify-commands).
- A lone `vitest run <file>` is a fast pre-check, and the final check only for `LOCAL_UI`. Never report a lone
  file run as subsystem verification.
- A passing check is not rerun unless relevant source changed. Any green result older than a contract-changing
  commit is **untrusted** until rerun.
- **PASS:** command · test count from the runner's summary line · typecheck/build status. No passing logs.
- **FAIL:** command · failing test/file · relevant error · at most ~100 lines of context. State whether each
  failure is pre-existing or new when evidence shows it.
- **BLOCKED / UNRESOLVED:** the §7 block, unchanged.
- Paste real output. A summary without output is not evidence.

## 9. Failure classification and spec

Every failing test is exactly one of: **implementation bug**, **stale test**, **fragile test**, **missing
coverage**, **unrelated regression**.

- "Stale test" requires a `file + section` spec citation. Without one it is a suspected implementation bug and
  work stops until the contract is settled.
- A behavior, state or flow change (enabled/disabled conditions, status lifecycle, dialog closing) needs an
  approved spec line. A label or selector rename needs only the updated spec line. An item marked `OPEN` is
  **not** approved.
- Never argue "the test expects X so production must do X" or "the code changed so the test is wrong". Resolve
  against the approved spec.
- "Pre-existing" and "calibration" need evidence (`git log -S`, `git show <commit>`, measured values).
  "Unmodified in the working tree" is **not** evidence; check HEAD history.
- Claiming a commit caused a regression → paste the offending diff hunk.
- Product or contract decisions are escalated with options and a recommendation; never guessed. Record the
  answer in the spec before coding. If a fix is blocked on a decision, finish everything else, then report it.
- **Register IDs are immutable.** Once an ID (`C7`, `§9.2`, `ADR-3`) is issued it is never reused, renumbered or
  recycled for a different item, even in a later task document. IDs are also not unique across documents:
  `C19` exists only in `docs/tasks/cleanup-fast-finish-task.md`, while a different document reuses `C1x`–`C3x`
  for an unrelated taxonomy. Always resolve an ID against its source document before acting on it.
- An item left **OPEN** in a register must appear in the handoff's next-steps list with its ID, or it is lost.

## 10. Code changes on evidence

Change code only for a real defect or a justified requirement. If verification is blocked, finish the
implementation if it is safe, then report.

## 11. Stop condition

When implementation is complete and verification is done or appropriately blocked, **stop**. No unrelated
cleanup, speculative future-proofing, rerun of passing checks, or heavier tests merely because they exist.

**Interruption is terminal.** If the user stops, cancels, interrupts or requests a handoff: no retry, no new
approach, no further tool call, no new terminal request, no resolving a pending confirmation by issuing another
command. Resume only on a new explicit instruction.

**Communication.** Answer the question asked, first; concise, no filler. If a new instruction conflicts with a
prior one, say so and ask which wins. If the owner corrects you: one line, fix, re-verify. If a request would
break these rules ("just make the test pass"), name the rule and offer the compliant alternative. If blocked on
missing information, ask for exactly that item and say what each answer changes.

## 12. Final report

```text
Changed:               commits (hash, message), files, one line each
Scope:                 inside the handoff, or the expansion taken and its evidence
Implementation:        what and why, 1–3 lines
Architecture docs:     updated, or "not required — no structural change"
Tests:                 added / updated / replaced / removed (removals justified, with spec citation)
Verification:          command — PASS|FAIL|BLOCKED|UNRESOLVED|NOT RUN, with pasted output
Not verified:          check + reason
Classification:        each failure per §9
External behavior:     network/provider/Worker impact, or "none"
Out-of-scope findings: file:line, proposed owner
Open decisions:        question, options, recommendation
git status --short:    final output
```

Do not ask a follow-up agent to rescan the repository; point at the files listed above.

## 13. Windows / PowerShell

- Use `rg` and `git --no-pager`. Search ASCII identifiers, not Vietnamese strings.
- Never write a repo file with `Get-Content | Set-Content` (or `>`/`Out-File`): it rewrites line endings, drops
  the final newline and can inject a BOM. Edit through the editor, or read raw bytes to measure.
- Never wrap `git commit` in `if ($?)`. `$?` reflects the *previous* command, so a preceding `Write-Host` or
  pipeline sets it false and silently skips the commit. Gate on the command that matters, or just run it.
- `Tee-Object` writes UTF-16 and `Out-File -Encoding utf8` injects a BOM. For anything a tool parses
  (`git commit -F`, a patch, a diff), use `-Encoding ascii` or `| Out-Null`.
- Read non-ASCII files with the file viewer, not `cat` through the shell.
- Quote paths, use `-LiteralPath`; do not rely on `**` globbing, use `rg --glob`.
- Use native PowerShell (`Get-ChildItem`, not `dir`).
- Avoid PowerShell 7-only syntax: `&&`, `||`, `??`, `??=`, `?.`, `?[`.
- Cap large output (`Select-Object -First N`, `rg -m`) and state the cap.