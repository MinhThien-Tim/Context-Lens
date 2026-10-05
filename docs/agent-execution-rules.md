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

## A. Honesty of reports

1. Report only what was observed. Separate **FACT** (command output, file:line, measured value) from
   **INTERPRETATION** (inference) and **UNKNOWN**.
2. Never write "PASS", "fixed", "verified" without the command and its real output. A result from
   before later changes is stale; say so.
3. Never invent line numbers, test names, file names or causes. If not read this session, mark it
   unverified.
4. Do not trust your own earlier reports. Re-check any prior claim that the current step depends on
   (the lost `App.tsx` wiring and the "PASS 24/24" result came from trusting an old report).
5. Failures are reported first and plainly: what failed, where, how it was found. No softening
   ("minor", "calibration", "unrelated") without evidence.
6. If a report contradicts itself or the numbers do not add up, resolve the contradiction before
   concluding.

## B. Root cause before fix

1. Reproduce or measure first. State one hypothesis, one test that could refute it, then run it.
2. Before declaring a cause, rule out at least the main alternatives with evidence (e.g. a stuck
   `disabled` for 429 retries is a stable state, not a race).
3. Fix the cause, not the symptom. No patching to make a measurement pass (extra timeouts, retries,
   aliases, compat shims for old tests).
4. After a fix, show the before/after measurement that proves it, and add a test that would have
   failed before.
5. If three attempts at the same approach fail, stop, report what was learned, and change approach
   or ask.

## C. Scope and change control

1. Do exactly the task. Findings outside scope are **reported, not fixed**, unless the fix is a
   trivial, local part of the task. Record them in the report.
2. Smallest diff that solves the problem. No drive-by refactors, renames, formatting sweeps, or
   dependency changes.
3. No new behavior, label, state or product rule without an approved spec line. Product decisions are
   escalated with options and a recommendation.
4. Do not delete or rename files, components, exports, tests or docs unless the task says so. Before
   removal show `rg` proof of no remaining users.
5. Do not change a frozen contract (docs marked frozen) to match code. Code follows the contract;
   contract changes need owner approval first.
6. A bug fixable locally is fixed in this task; it is not "filed, not fixed" or deferred as
   "pre-existing" without `git log -S`/`git show` evidence.

## D. Safety of the working tree

1. Run `git status --short` before starting and after finishing every step; paste it.
2. Back up uncommitted work (`git diff > backup-wip.patch`, gitignored) before any step that edits
   many files.
3. Forbidden without explicit permission: `git reset --hard`, `git clean`, `git checkout -- <file>`,
   `git restore` on files you did not edit, force push, history rewrite of pushed commits,
   `taskkill /IM node.exe`.
4. Never overwrite a file wholesale when a targeted edit works. Read the current file before editing;
   do not edit from memory.
5. Probe/debug files go under `.tmp/` or `test-results/`, are never committed, and are deleted when
   the step ends.
6. Never leave a half-applied change: finish the step, or revert exactly your own edits and say so.

## E. Loops and stuck states

1. Never repeat an identical command or search. Zero results = state it, change strategy.
2. Maximum 5 search/inspection commands per question; then report findings and ask.
3. A test or process running longer than expected is stopped (`Ctrl+C`), not waited on. Use `--grep`,
   short `actionTimeout`, and one test at a time.
4. Do not retry a failing command unchanged. Read the error, change one variable.
5. If blocked by missing information (file, output, decision), ask for exactly that item and say
   what each answer would change.
6. Never re-issue an identical completed tool call. If a call returned (results or zero matches) and
   you have not changed its inputs, sending it again produces no new information and is a loop,
   not an attempt.

## F. Evidence gathering (Windows / PowerShell)

1. Use `git --no-pager` and `rg` (UTF-8 safe). Search by ASCII identifiers rather than Vietnamese
   strings.
2. Quote paths and use `-LiteralPath` where needed; do not rely on `**` globbing in PowerShell, use
   `rg --glob`.
3. Read files with the file viewer, not `cat` piped through the shell, when content has non-ASCII
   text.
4. Large outputs: cap with `Select-Object -First N` or `rg -m`, and state the cap.
5. Use native PowerShell commands not DOS commands (e.g., use Get-ChildItem rather than dir). DOS
   commands may not work.
6. On a PowerShell version without PowerShell 7 syntax support. Avoid PowerShell 7-only syntax such
   as `&&`, `||`, `??`, `??=`, `?.,` and `?[`.

## G. Code and contract sync

1. A behavior change updates, in order: spec -> code -> tests -> docs/comments, in separate commits
   that each typecheck.
2. Every UI label, role, aria-name and selector that tests depend on is part of the contract; changing
   one means updating its tests in the same phase.
3. Comments and docs naming components/files must match the code (no stale names such as a
   non-existent `PdfDocumentTools.tsx`).
4. State lifecycles (idle/running/paused/done/error) are explicit: define who sets and who clears
   each state. A terminal state that is never cleared is a bug.
5. CSS that targets portaled/body-level nodes must not be scoped to an ancestor the node no longer
   has. After moving a node in the DOM, re-check every rule and token it depends on.
6. One owner per control per band (e.g. one More trigger per breakpoint). Duplicates are defects.

## H. Testing behavior

1. Test behavior and contract, not implementation details. Prefer role/name/state queries.
2. A test that fails after your change gets classified (bug / stale / fragile / missing coverage /
   unrelated) before any edit, with a spec citation for "stale".
3. New behavior ships with a test in the same phase. A bug fix ships with a regression test.
4. Never use a viewport, fixture size or timing as an implicit guarantee; construct the condition
   explicitly and assert it.
5. Do not run the full suite repeatedly while debugging; run the smallest spec, then domain, then
   full once at phase end.

## I. Report format (end of every task)

1. **Changed:** commits (hash, message), files, one line each.
2. **Tests:** added / updated / replaced / removed (each removal justified), with spec citation.
3. **Verification:** exact commands and pasted output; what was NOT run and why.
4. **Classification:** each failure as bug / stale / fragile / missing coverage / unrelated.
5. **Out of scope findings:** list with file:line and proposed owner.
6. **Open decisions:** questions for the owner, each with options and a recommendation.
7. `git status --short` at the end.

## J. Communication

1. Answer the question asked, first. Be concise; no filler, no celebration.
2. When a prior instruction from the owner conflicts with a new one, say so and ask which wins; do
   not silently pick.
3. When the owner corrects you, acknowledge in one line, fix, and re-verify. No defensiveness, no
   over-apology.
4. If a request would violate these rules (e.g. "just make the test pass"), say which rule and
   propose the compliant alternative.

## 1. Scope discipline

Establish before the first edit. When a Planner handoff exists, its `SCOPE` / `RELEVANT FILES` /
`PRESERVE / INVARIANTS` / `OUT OF SCOPE` / `IMPLEMENTATION DIRECTION` fields are this section, already
derived — the Implementer consumes them and expands them only by the scope-expansion rule in
[`docs/agent-roles/implementer.md`](agent-roles/implementer.md). When no handoff exists, establish
the same facts directly:

```text
TASK
AFFECTED SUBSYSTEM   (one domain doc from the ARCHITECTURE.md routing table)
RELEVANT FILES
ARCHITECTURAL INVARIANTS AT RISK   (docs/ARCHITECTURE.md; COST & QUOTA GUARDRAILS.md)
CHANGE CLASS
VERIFICATION REQUIRED
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
- Do not re-read a large unchanged file when only one unknown region is needed; read the range. The
  pre-edit obligation form of this rule is Rule 3 in §3.
- Anything under `docs/archive/` is historical background, not current architecture, and is never
  part of the default reading path. Read a file there only when the task explicitly asks about that
  history, a past regression, or an old measurement. Code, config and the active docs override it.

### Architecture doc maintenance

Update the affected domain doc **in the same task** when the change alters architecture, ownership,
subsystem boundaries, control flow, data flow, persistence, or meaningful integration behavior.

Do **not** update architecture docs for: copy, naming, style values, test-only additions, or isolated
bug fixes. Architecture docs describe current structure, not task history.


## 3. Request and context efficiency

This section is the **canonical owner of request-efficiency rules** for every role. Role files keep
only their role-specific application of it.

### Core principle

> **Spend requests on new information, not on re-reading, re-searching, or re-verifying information
> that has not changed.**

Efficiency never weakens correctness. The source is still the authority, and a handoff claim is still
verified against the file it names — verifying a cited file once is a necessary check, repeating that
check without a change is waste.

### Rules for all roles

- Batch independent reads and searches into a single call when the available tool supports batching.
  Parallel or multi-file requests cost the same round trip as one.
- Do not repeat an equivalent search. If a symbol, file, or concept is already established, reuse the
  finding. A successful call that is re-issued unchanged is a loop, not a verification — see
  §7 [Identical-query loop](agent-execution-rules.md#identical-query-loop) for the blocking rule and
  the two legitimate re-issues (batched reads, or a preceding fact actually changed).
- Do not re-read an unchanged file when the required evidence is already in hand. Read a range, not
  the whole file, when only one region is unknown.
- Do not poll. Repeated status checks on a running command, process, or server are prohibited; §7 owns
  that rule.
- Never repeatedly retry a failed command. §7 owns retry semantics and the two-attempt budget.
- Do not rerun a command that already passed unless relevant code/config changed, or a later stage
  (e.g. a Verifier confirming the same objective) needs the result.
- Do not scan unrelated subsystems for completeness. Scope is a boundary, not a suggestion.
- Do not broaden verification without evidence of a wider dependency; §4 owns that decision.
- Prefer the smallest set of calls that establishes source truth and completion.
- Do not load large data assets into context: the `release/dictionary` and `release/wordnet` packs,
  `tmp/` fixtures, lockfiles, build output, and captured JSON reports.
- `release/` assets and `tmp/pdf-baseline` are build inputs, not code to refactor.
- Search exact filenames, symbols, and config keys first; read the matching range second.
- When context is already large and the implementation is stable, stop expanding it and produce a
  handoff rather than carrying the session forward.

**No numeric request budget.** There is deliberately no global cap on the number of tool or API
requests. A complex investigation, a regression hunt, or a cross-subsystem change can legitimately
need many requests; the rule above targets *redundant* requests, not total volume. Never introduce a
hard per-task or per-role request limit.

### Execution-control rules

Rule 1 — **Request efficiency is not "batch everything."** Batch only reads that are genuinely
independent and equally needed now; batching unrelated or not-yet-needed reads trades one round trip
for an extra mapping step and a higher token cost. This qualifies the batching bullet above; it does
not weaken batching of independent reads.

Rule 2 — **Read control-flow files sequentially.** `AGENTS.md`, this document, and
`docs/agent-roles/*.md` define role and policy, so the agent must resolve them before acting on them.
Read in order: role file → `AGENTS.md` → the canonical policy sections → the target files. This is the
one exception to Rule 1's batching, and it applies to control-flow files only.

Rule 3 — **Narrow read before edit.** Before editing a file, read the exact range being changed;
section-level context is sufficient, a whole-file read is not required. This generalizes the
narrow-read bullet in §2.

Rule 4 — **Associate each tool result with its call.** Results belong to calls in submission order;
never infer reordering from content. On doubt, re-read the one file whose result looks wrong, once —
never alternate between read and re-read.

Rule 5 — **Recover from a no-match by re-reading.** A failed exact match means re-read the exact
target text; never reconstruct the search string from memory or retry whitespace or variant guesses.
This is the one legitimate re-issue of an unchanged query: the search was *wrong*, not merely
repetitive. It is bounded to a single re-read that resolves the query's text.

Rule 6 — **Never re-send an unchanged successful call.** Rule 5 permits re-deriving a failed query
once. It never permits re-sending a call that already returned its answer. Before any repeat, name the
new fact it would return; if there is none, change the query shape or stop. §7
[Identical-query loop](agent-execution-rules.md#identical-query-loop) is normative.

### Per-role application

| Role | Request behavior |
| --- | --- |
| **Planner** | Start from a compact batched repository inspection; inspect only files relevant to the reported problem; batch independent source/test/doc reads; reuse findings established earlier in the same planning phase; stop once scope, invariants, change class, and verification are established; do not keep searching for a concept already answered. |
| **Implementer** | Use the Planner handoff as the initial scope; verify only the files the handoff cites, plus files new evidence requires; do not repeat the Planner's discovery; do not re-inspect unchanged source; do not rerun checks that already passed. |
| **Verifier** | Inspect the final diff first; select checks from the handoff's change class and acceptance criteria; run only what establishes correctness; do not repeat passing checks without a reason; do not scan unrelated subsystems; stop when acceptance criteria and required verification are satisfied. |

The detailed role rules live in [`docs/agent-roles/planner.md`](agent-roles/planner.md),
[`docs/agent-roles/implementer.md`](agent-roles/implementer.md) and
[`docs/agent-roles/verifier.md`](agent-roles/verifier.md).

## 4. Verification proportionality

This section is the **canonical owner** of change classification and proportional verification.
Other documents link here and keep only short pointers.

Effort tracks **blast radius**, not test availability, and verification follows the **changed
behavior, not merely the directory containing the changed file**: a CSS-only change inside a
Lookup-owned stylesheet is not a subsystem task, and a TSX change that only reorders existing controls
stays `LOCAL_UI` while its handlers, state and data flow are unchanged. The subsystem commands in
[`verification-map.md`](verification-map.md) and [`testing.md`](testing.md) are unchanged and remain
the architectural boundary; this section adds a selection layer above them and justifies no new
per-area scripts.

### Change classes

| Change class | Typical diff | Default verification | Not required by default |
| --- | --- | --- | --- |
| **`PRESENTATION_ONLY`** | CSS color/token values, background, border, border-radius, shadow, typography, spacing, dimensions, layout-only CSS, responsive rules, icon sizing, visual state styling. No JS/TS/TSX behavior change. | CSS: `npm run check:css`; other presentation artifacts: the relevant syntax/static check. One narrow browser check only when the change is genuinely browser-observable. | `typecheck` for CSS-only diffs, any subsystem `verify:*`, repository-wide Vitest, `verify:full` |
| **`LOCAL_UI`** | JSX reordering, local component composition, moving existing controls, local rendering conditions, component-local presentation state. Handlers, state transitions and data flow unchanged. | Targeted colocated Vitest when one exists; `typecheck` when TS/TSX changed; one narrow Playwright spec only when browser-level layout/responsive/focus/scroll behavior needs proof. | a whole-subsystem `verify:ui` / `verify:lookup` run |
| **`SUBSYSTEM_LOGIC`** | Component behavior, state transitions, lookup behavior, parser/resolver logic, provider behavior, reader interaction logic, storage behavior — contained inside one existing subsystem. | The mapped subsystem `verify:*` command. Add a colocated test next to the change. | `verify:full` |
| **`SHARED_CONTRACT`** | Dexie schema/version, shared cache/version keys, provider priority, persisted public state shape, backup schema, cross-subsystem contracts, build/PWA/Worker contracts. | The mapped subsystem `verify:*` command, escalating to `verify:full` when the shared-contract rule requires it. | — |

Browser-observable work adds one narrow Playwright spec (§6) on top of whatever the class requires.

### Presentation-only stop rule

A presentation-only diff stops after its targeted check. All of these must hold:

- every changed production file is presentation-only CSS (no JS/TS/TSX behavior change);
- no config, build, PWA/Worker, Dexie, or other shared-contract file changed;
- no behavior change moved the diff into a subsystem `verify:*` scope.

Then:

- run `npm run check:css`;
- run **one** narrow browser check only if the task itself requires visual or browser proof;
- do **not** run `typecheck` for a CSS-only diff;
- do **not** run subsystem Vitest;
- do **not** run `verify:full`;
- stop once the targeted verification passes.

Escalate only when evidence shows a wider dependency.

### LOCAL_UI escalation

A `LOCAL_UI` change escalates to the whole-subsystem command only when shared behavior or state
changed, targeted verification exposes a wider dependency, or the touched component is itself an
integration boundary. When event handling, a state transition or data flow changes, the diff is
`SUBSYSTEM_LOGIC`: use the mapped subsystem command. A blocked targeted check never justifies broader
testing — report it and stop.

### Worked cases

| Change | Class | Verification |
| --- | --- | --- |
| Only CSS colors in a Quick Card theme | `PRESENTATION_ONLY` | `check:css`, optional narrow visual check, stop. No `verify:lookup`. |
| Mobile CSS grid/flex layout only | `PRESENTATION_ONLY` | `check:css`, narrow mobile Playwright only if needed, stop. |
| Existing JSX buttons moved, handlers/state unchanged | `LOCAL_UI` | Targeted component test, `typecheck`, narrow browser check if layout-sensitive. Whole `verify:lookup` / `verify:ui` not mandatory. |
| Button now changes lookup state differently | `SUBSYSTEM_LOGIC` | The mapped subsystem command (`verify:lookup`). |
| Dexie schema or cross-subsystem persisted contract | `SHARED_CONTRACT` | Subsystem verification, plus `verify:full` when required. |

Documentation-only tasks require document/link/diff checks, not application tests.
Verification execution and reporting shape follow [§8](agent-execution-rules.md#8-verification-execution-and-reporting).

Two hard exclusions:

- **No watch mode.** `npm run test:watch` never exits and must not be started in an agent session.
- **No full-suite reflex.** `npm test` is justified only by the SHARED_CONTRACT row or by a
  targeted test revealing an unexpected cross-module dependency. Full suite once, at final
  verification, when scope warrants it.

## 5. Test escalation order

Stop at the step the change class requires; a PRESENTATION_ONLY CSS diff stops before step 3.

1. **Targeted unit test** — optional iteration pre-check: the colocated file, for example `npx vitest run src/path/file.test.ts`. After implementation, the subsystem command is authoritative when a bucket applies; for LOCAL_UI, the targeted run is the class's final check.
2. **Narrower still** — optional iteration pre-check only: a single case, for example `npx vitest run src/path/file.test.ts -t "name"`.
3. **Typecheck** — already batched inside the subsystem `verify:*` command whenever a bucket applies; otherwise run `npm run typecheck` only when types, public signatures, or Dexie records changed. A CSS-only `PRESENTATION_ONLY` diff skips it; use `npm run check:css` instead.
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

For `PRESENTATION_ONLY` and `LOCAL_UI` changes, browser verification stays deliberately small: one
narrow spec, one relevant project/device where that is sufficient, and an additional viewport only
when the task itself concerns responsive behavior. Do not run full Playwright, and do not
automatically run both `laptop` and `mobile-chromium` for every theme or layout task. A blocked
browser check is reported, never worked around by widening the scope.

## 7. Execution / Test Retry Policy

This section is the canonical owner of retry, execution, environment, completion and token rules.
Status meanings live in [testing.md](testing.md#verification-status-semantics).
Use the **current session's actual capabilities**, never the model or agent name.

### Terminal Loop Guard

The mandatory stop rule for terminal execution. It is binding and normative: when in doubt, stop and
report rather than retry. It owns the guard; the subsections below own the detail.

**Never repeatedly retry shell commands.** On any failure:

1. **Classify** it as `CODE`, `LAUNCHER`, `ENVIRONMENT`, or `COMPLETION UNKNOWN` (definitions under
   “Classify before retrying” below) before doing anything else.
2. **`LAUNCHER` failure** → try at most **one** known-safe fallback (the single equivalent launcher
   under “Capability and security boundary”), within the same attempt budget.
3. **`ENVIRONMENT` or `COMPLETION UNKNOWN`** → **stop execution and report**. Do not investigate
   further.
4. **Never switch shells or launchers repeatedly.** One documented launcher, at most one safe
   equivalent, then stop.
5. **Never use watch mode.** Any non-terminating command is prohibited in an agent session.
6. **Never rerun an unchanged failing command.** A rerun requires a preceding code/config change or a
   stated reason.
7. **Never re-run a search or read that was truncated, preview-only or auto-offloaded.** Reordering
   parameters is not a new attempt. Change the query *shape* (see “Search and output overflow”
   above) or consume the offloaded artifact — do not repeat the query.
8. **Maximum two execution attempts per verification objective.** On reaching the cap, stop the task
   and report the exact blocker — do not retry.
9. **Never re-issue an identical completed tool call.** If a call returned (results *or* zero matches)
   and you have not changed its inputs, sending it again produces no new information and is a loop, not
   an attempt. Before sending anything you already sent, change its *shape* or do not send it — see
   “Identical-query loop” below.

### Identical-query loop

A query that **returned an answer** — results, a rendered page, or a deliberate zero-match — and is
then re-issued unchanged is a Terminal Loop Guard breach even when the answer was correct and even when
it is not a *command*. The retry rules above budget *executions*; this rule budgets *information*.
Return is the reason it applies most strongly: a completed call has already answered its question.

**The test before every tool call: what new fact will this return that the previous call did not?**

- If the answer is **nothing**, do not send it. Change the query *shape* — different tool, different
  path scoping, different construct — or move on.
- Zero matches is an **answer**, not a failure. Repeating it does not make it more likely to match.
- Re-typing the same pattern, reordering parameters, or re-sending with different narration is the
  **same call**. Narration is not a new attempt; a fresh paragraph of prose in front of an identical
  payload is the clearest signature of this loop.
- Correct *silently*: when you notice you have repeated a call, stop, do not re-send it, and continue
  from the results you already have. Do not narrate the correction at length — fix the query and move on.

**Two legitimate re-issues**, both of which change the inputs:

1. **Batch instead of repeat.** Several independent reads belong in **one** response, not in one call
   per turn. Sequential single calls are how this loop starts.
2. **A preceding fact changed.** Code was edited, a file was regenerated, or a decision invalidated the
   earlier result. State the reason; the rerun is then a new attempt.

**Worked example (2026-10-04, T0d OCR/More audit).** A `grep` for
`Không có|Không còn|trang cần OCR|message` was issued roughly **fifteen** times with an identical
pattern, each preceded by an identical sentence of narration. The search had long since returned what
was needed; the repetition produced zero new facts and burned the budget of a read-only audit. The user
interrupted with *"resume. fix loop"*. The correct response was to stop re-sending, acknowledge once, and
switch to **batched independent reads** — several files in a single response — which is the pattern that
should have been used from the first result onward.

### Search and output overflow

A search or read that returns a truncated, preview-only or auto-offloaded result is **not** a command
failure, so it is not covered by the retry budget above — but re-running it is still a Terminal Loop
Guard breach. Reordering parameters, widening the path list, changing `head_limit`, or re-typing the
pattern produces **no new information**; it is a retry and counts as one.

This subsection is the overflow-specific case. [Identical-query loop](#identical-query-loop) above is
the general rule and applies whether the returned answer was a result set, a rendered page, or a
zero-match.

**Classify once, then change the query shape — never the query repetition.**

1. **Diagnose the pattern, not the output.** A result set too large to return means the pattern is too
   broad. Over-broad patterns for this repository include `\[[^\]]*\]\s*=`, `\[.*\].*=`, `\w+\[`,
   bare `=` , and any unanchored two-token alternation. They match destructuring, array literals, CSS,
   JSX attributes and type annotations, not the construct being sought.
2. **Re-anchor on structure, not on syntax sugar.** Search for the *construct* — `Object.hasOwn(`,
   `new Map(`, `Object.create(null)`, `Record<string`, `= {}` , computed-key literals, an
   identifier-anchored `name[key] =` — which has a far smaller result set than a bracket-and-equals
   shape.
3. **Prefer the targeted path over the repo-wide sweep.** Narrow `paths` to the files the domain doc
   already named. A repo-wide scan is a fallback, never the first move.
4. **If a broad result is genuinely required, do not retry — consume the offloaded artifact.** Read
   the saved temp file with a bounded `grep` and a `view_range`, and delete it at task end.
5. **Budget: one broadening attempt, then stop.** A second identical-shape search is a breach even
   when the first returned zero matches — a zero-match result is an *answer*, not a failure.

**Worked example (2026-10-02, prototype-key audit).** Searching `\[.*\].*=` across `src/` to find
user-derived dynamic keys returned ~280 KB, exceeded the return limit, and was auto-saved to a temp
file. It was then re-issued **eight times** with reordered parameters, each time returning the same
truncated preview — eight calls, zero new information. The correct first fallback was a set of bounded
structural searches (`Record<string`, `= {}`, computed-key literals, `Map<`, `for..in`) over the files
named by the architecture doc, which resolved the question outright. See
[testing-troubleshooting.md](testing-troubleshooting.md#search-result-overflow-or-truncated-tool-output)
for the symptom-to-fix path.

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

Never raise an approval request after the user has stopped, cancelled, or interrupted the task; the
interruption rule in §11 outranks this subsection.

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
- **Command selection:** Classify the diff first with §4, then pick the
  bucket from the per-subsystem table in [testing.md](testing.md#per-subsystem-verify-commands):
  `verify:reader`, `verify:pdf`, `verify:import`, `verify:lookup`, `verify:language`,
  `verify:translation`, `verify:storage`, `verify:ui`, `verify:offline`, or `verify:full`.
  That table remains the single source of the command list. A `PRESENTATION_ONLY` diff stops at
  `check:css`; a `LOCAL_UI` diff may stop at its targeted check. Use `verify:full` only for the §4
  SHARED_CONTRACT row.
- **Authoritative check:** A single colocated `vitest run <file>` is an optional fast pre-check while
  iterating, and the intended final check for a `LOCAL_UI` diff. Otherwise the authoritative result is
  one subsystem command; never report a lone file run as subsystem verification.
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

### Interruption is terminal

Rule 6 — **When the user stops, cancels, interrupts, or requests a handoff, terminate the current
execution loop.** The interruption signal ends the task's execution loop: no retry, no fresh approach,
no resumption, no further tool call, and no new terminal request. Resume only on a new explicit user
instruction.

Pending confirmation at interruption: leave the pending tool confirmation untouched, or cancel it.
Never resolve it by issuing another command. §7's approval path must not be used to continue after an
interruption.

## 12. Final handoff

Keep it short and factual. The scope fields let a Verifier check the boundary without the Planner
transcript; see [`docs/agent-roles/implementer.md`](agent-roles/implementer.md) for the
Implementer-facing form of this block.

```text
Files changed:         <paths>
Scope:                 <stayed inside the handoff, or the expansion taken and its evidence>
Implementation:        <what changed and why, 1–3 lines>
Architecture docs:     <updated, or "not required — no structural change">
Tests run:             <command — PASS|FAIL|BLOCKED|UNRESOLVED|NOT RUN>
Not verified:          <check + reason, if any>
External behavior:     <network/provider/Worker impact, or "none">
Out-of-scope findings: <unrelated issues noticed but not fixed>
```

Do not ask a follow-up agent to rescan the repository; point at the specific files listed above.

## 13. Standing rules — commit discipline and evidence (cleanup phase, 2026-10-05)

Adopted during the 2026-10-05 cleanup phase. These are additive to §A–§L. Where §H or §7 already
governs a case, §13 does not restate it.

### 13.1 Commit discipline

1. One logical change = one commit. Never mix product code, CSS, tests, docs/spec, or `.gitignore`.
2. Commit as soon as a task is accepted and its relevant verification is green. Do not leave
   accepted work uncommitted.
3. Order inside a behavior change: **spec → code → tests**, each its own commit, each typechecking
   independently.
4. After every commit report `git status --short` and `git --no-pager log --oneline -3`. Name and
   explain anything left uncommitted.
5. Before handing work to another step, write `git diff > backup-wip.patch` (gitignored, uncommitted).
6. Never `git stash drop`, `reset --hard`, `checkout --`, or `restore` a file this task did not
   change. Do not amend or rewrite pushed commits.
7. Never commit failing work as if it were finished. Park unapproved work on `wip/<name>`.

### 13.2 Evidence rule — failure classification

Every failing test is classified as exactly one of **implementation bug**, **stale test**,
**fragile test**, **missing coverage**, or **unrelated regression** (see §H.2).

- "Stale test" is invalid without a `file + section` spec citation. Without one it is a suspected
  implementation bug, and work stops until the contract is settled.
- A behavior/state/flow change — enabled/disabled conditions, status lifecycle, dialog closing —
  requires an approved spec line. A label or selector rename requires only the updated spec line. An
  item marked `OPEN` is **not** approved.
- Never argue "the test expects X so production must do X", nor "code changed so the test is wrong".
  Both are circular; resolve against the approved spec.
- Never report a failure as "calibration" or "pre-existing" without evidence (`git log -S`,
  `git show <commit>`, measured values). **"Unmodified in the working tree" does not mean
  "pre-existing"** — check HEAD history before claiming either.
- When claiming a regression is caused by a specific commit, paste the offending diff hunk.

### 13.3 Test hygiene (adds to §H)

- Forbidden to make a suite pass by: `skip`, `.only`, deleting a test, weakening/removing/commenting
  out an assertion, or a blind snapshot update.
- A test may be deleted only when the behavior is intentionally retired (cite spec) **or** a
  replacement test lands in the same commit.
- Selectors are role/aria-label/state. No CSS classes or pixel constants, except in dedicated
  geometry tests.
- Measure in the state being claimed: measure 100% before selecting 150%. No fixed `waitForTimeout` —
  poll a real condition (`expect.poll`).
- A test must not depend on viewport size to "guarantee" a condition; build it (e.g. a wide-page PDF
  fixture).
- One test per viewport — never a `for` loop over viewports inside one test, so reports stay
  attributable.
- Name tests with their contract section (`§9.2: ...`) so `rg "§9"` finds them.
- Tests are included in `tsconfig`, so prop and type changes break `tsc`.

### 13.4 Verification discipline (adds to §5 and §8)

- Run the smallest relevant spec, then the domain, then the full suite **once at phase end**, not
  repeatedly while debugging.
- Single tests run with `--grep` and a short `actionTimeout` (10s) so a stuck test fails in seconds
  rather than minutes.
- Paste real command output. A summary without output is not evidence.
- Any green result predating a later contract-changing commit is **untrusted** until re-run.

### 13.5 Search and tooling discipline (adds to §F and §7)

- Each search runs **once**. Zero results means report "0 results" and change strategy — never
  re-issue the same query or a reworded variant of it (§7 “Identical-query loop” is the canonical
  rule).
- Search ASCII fragments or identifiers; Windows encoding corrupts Vietnamese strings. Prefer `rg`.
- Max 5 search commands per investigation step, then stop and report.
- Use `git --no-pager`, or `git config core.pager cat`, so output is never trapped in a pager.
- Never create probe or output files in the repo root. Use `test-results/` or `.tmp/` (both
  gitignored) and delete them when the task ends.

### 13.6 Escalation

- A bug fixable locally is **fixed**, not filed. Only product or contract decisions are escalated.
- Never guess a product decision — ask, and record the answer in the spec before writing code.
- When a required fix is blocked on an unanswered decision, finish everything else, then report the
  decision with its options and a recommendation.
