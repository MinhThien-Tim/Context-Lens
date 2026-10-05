# Testing Troubleshooting

Quick reference for recurring test and verification failures in Context Lens.

This file does not replace:
- `docs/testing.md` — test commands and verification scope.
- `docs/agent-execution-rules.md` — retry, classification, and stop policy.
- `docs/verification-map.md` — subsystem verification mapping.
Use this file when a known symptom appears and a fast diagnosis path is needed.

## Failure classification

Before fixing anything, classify the result:

- `FAIL` — test actually ran and code/test behavior failed.
- `BLOCKED` — environment, launcher, permission, browser, or capability prevented execution.
- `UNRESOLVED` — execution happened but final result cannot be confirmed.
- `NOT RUN` — intentionally not executed.
- `PASS` — confirmed successful result.

Never change product code because of `BLOCKED`, `UNRESOLVED`, or `NOT RUN`.

---

## Common issues

### Search result overflow or truncated tool output

**Symptom.** A `grep`/`glob` returns a short preview ending in something like *"result was too large"*
or *"...copilot-tool-output-<hash>.txt"*, or returns only a truncated head of the matches. The search
itself did not fail — it succeeded and produced more output than could be returned.

**Do not re-run it.** Re-issuing the same pattern with reordered parameters, a wider `paths` list, or a
raised `head_limit` is a *retry*, not a new attempt: the result set is unchanged, so no new
information is possible. That is a Terminal Loop Guard breach regardless of how few attempts it took.
See [`agent-execution-rules.md` §7](agent-execution-rules.md#search-and-output-overflow) for the
normative rule.

**Fix: change the query shape, once.**

| Instead of | Search for | Why |
| --- | --- | --- |
| `\[.*\].*=`, `\[[^\]]*\]\s*=` | `Object.hasOwn(`, `new Map(`, `Object.create(null)`, `Record<string`, `= {}` | bracket-and-equals matches destructuring, array literals, CSS, JSX attributes and type annotations |
| bare `=` or `\w+\[` | the specific construct: `= {}`, `name[key] =`, computed-key literals | unanchored alternation returns the whole repository |
| repo-wide `paths: ['.']` | the files the architecture doc already named | bounded paths shrink the result set by orders of magnitude |

A **zero-match** result is an answer, not a failure — do not broaden and retry it.

**If the broad result is genuinely required**, do not re-run the search. Consume the artifact: the
tool prints the saved path under `%TEMP%`; run a *bounded* `grep` (with a `^`/`$` anchor or
`head_limit`) against that file, read the relevant range with `view_range`, and delete the temp file
before the task ends. Note that JSON tool-output files are often a single enormous line, so piping
them to another grep may fail — read them with `view_range` or use
`Get-Content -Raw -LiteralPath <path> | ConvertFrom-Json` in PowerShell.

### The same search keeps getting re-sent

**Symptom.** The identical `grep`/`view`/shell call is sent again with the same pattern, same `paths`
and same options, usually preceded by a fresh sentence of narration. Nothing about the payload
changed. The tool returns the same answer it returned last time — or a zero match it already gave you.

This is the **information** half of the Terminal Loop Guard. The execution rules budget retries; this
budgets repeated queries. A call that returned an answer has spent its purpose. Re-typing the same
pattern, reordering parameters, or wrapping the same payload in new narration is *the same call* —
narration is not a new attempt.

**Fix: change the query shape, or stop.**

| Instead of | Do | Why |
| --- | --- | --- |
| re-sending the identical `grep` | re-anchor on a construct: symbol name, line range, file-scoped `paths` | a narrower anchor is a genuinely new question |
| one read per turn, in sequence | batch the independent reads into **one** response | parallel reads cost one round trip |
| re-sending after reading the answer | continue from the results already in hand | the fact is established |

Before every repeat, ask: **what new fact would this return?** If nothing — do not send it.

**Correct silently.** When you notice the loop, stop re-sending, fix the query shape, and move on. Do
not add a paragraph explaining the correction; the next correct action is the whole remedy.

**Reported example (2026-10-04, T0d OCR/More audit).** A `grep` for
`Không có|Không còn|trang cần OCR|message` ran roughly **fifteen** times unchanged, each preceded by
an identical sentence. The user interrupted with *"resume. fix loop"*. Switching to batched independent
reads resolved it immediately. See
[`agent-execution-rules.md` §7](agent-execution-rules.md#identical-query-loop) for the normative rule.

### PowerShell blocks npm.ps1

**Symptom**

```text
npm.ps1 cannot be loaded because running scripts is disabled
```

**Classification**

Launcher failure.

**Fast action**

Use:

```text
npm.cmd run verify:pdf
```

or:

```text
npx.cmd vitest run <test-file>
```

Do not modify Windows execution policy and do not retry through multiple shell wrappers.

### Vitest watch mode does not exit

**Symptom**

The command stays running after tests finish or waits for file changes.

**Cause**

`vitest` or `npm run test:watch` was used instead of run mode.

**Fast action**

Use `npx.cmd vitest run <test-file>`, or the appropriate subsystem command: `npm.cmd run verify:<subsystem>`.

Agents must not use watch mode.
### Single test passes but subsystem verification fails

**Symptom**

```text
npx vitest run some-test.ts
PASS
```

but:

```text
npm run verify:<subsystem>
FAIL
```

**Meaning**

The isolated test is not authoritative. A shared-state, integration, typecheck, or another test in the subsystem may be failing.

**Fast action**

Use the first real failure reported by the subsystem command.
Do not report the subsystem as PASS based only on the single-file run.

### Full suite fails outside the task scope

**Symptom**

Targeted subsystem verification passes, but `verify:full` reports unrelated failures.

**Fast action**

Determine whether the failure is:
- caused by the current diff;
- pre-existing;
- environment-related.

If clearly unrelated, report it as an out-of-scope finding.
Do not fix unrelated code in the current task.

### Playwright cannot find Chrome

**Symptom**

Browser launch fails because the configured Chrome channel is unavailable.

**Classification**

`BLOCKED`.

**Fast action**

Stop browser verification and report the missing browser.
Do not modify product code or switch browsers merely to make the test run.
### Offline test fails when using dev server

**Symptom**

Service worker or offline reload behavior does not work under:

```text
npm run dev
```

**Cause**

Context Lens service worker is production-build only.

**Correct flow**

```text
npm.cmd run build
$env:QA_PRODUCTION='true'
npx.cmd playwright test e2e/offline.spec.ts
```

Do not treat missing service-worker behavior under the Vite dev server as a product regression.

### Offline test starts before precache completes

**Symptom**

App shell loads but dictionary, WordNet, or other offline assets are unavailable.

**Cause**

The first online installation/cache population was incomplete.

**Fast action**

Allow one complete online load before switching the browser context offline.

### Vocabulary handoff test cannot start

**Symptom**

`e2e/vocabulary-handoff.spec.ts` cannot reach English101.

**Cause**

The sibling English101 checkout/server is missing.

**Classification**

`BLOCKED`.

Do not rewrite the test or Context Lens integration because the second repository is absent.

### Test unexpectedly performs a network request

**Symptom**

Vitest reaches an external provider or fails because network access is unavailable.

**Cause**

A provider/fetch call was not stubbed.

**Fast action**

Stub fetch or the provider using the patterns already present in:

```text
src/lookup/webDictionary.test.ts
src/core/translation/providers/providers.test.ts
```

Unit/integration tests must not depend on live network services.

### IndexedDB state leaks between tests

**Symptom**

Tests pass alone but fail when run together, often with stale records or unexpected database state.

**Fast checks**

- Confirm `fake-indexeddb` is being used through `src/test/setup.ts`.
- Check database cleanup/reset between tests.
- Check mocks are restored.
- Check the test does not depend on execution order.

Do not solve this by weakening assertions or forcing serial execution unless the architecture requires it.
### TypeScript reports document or another browser global incorrectly

**Known Context Lens example**

A module-scope helper named `document` shadowed the global browser `document`.

**Fast action**

Check for local identifiers shadowing browser globals such as:

```text
document
window
location
history
navigator
```

Rename the helper rather than changing TypeScript configuration.

### Build succeeds in Vite but final build command fails

**Symptom**

Vite emits files successfully, but:

```text
npm run build
```

still returns failure.

**Cause**

Context Lens also runs bundle/precache validation.

**Fast action**

Inspect the failure from:

```text
scripts/check_bundle_budget.mjs
```

Possible causes include:
- JS bundle budget exceeded;
- CSS budget exceeded;
- required offline assets missing;
- heavy reader assets incorrectly entering precache.

Do not report build PASS just because Vite itself completed.

### PDF/OCR browser tests are slow

**Meaning**

PDF rendering, OCR, real fixtures, and Playwright are intentionally heavier than normal Vitest tests.
Since the tiered configs landed, concurrency is also tier-owned: `fast` runs 4 workers while
`pdf-normal` and `heavy` run 2, because PDF rasterisation and OCR are CPU-bound.

**Fast action**

Run only the narrow spec/project required by the task. Pick the tier that matches the test's tags
(`fast` untagged, `pdf-normal` `@pdf`, `heavy` `@heavy`) rather than raising a timeout.
Do not repeatedly restart a legitimate long-running test.

**A timeout that only appears in a parallel run is not a flaky test.** OCR and rasterisation
contend for the same cores, so a `@pdf`/`@heavy` test that passes at `--workers=1` and fails under
the tier's own worker count has starved, not regressed. Diagnose it by running that one file both
ways and comparing wall-clock:

```powershell
npx playwright test --config playwright.tiers.config.ts e2e/<file>.spec.ts   # as configured
npx playwright test --workers=1 e2e/<file>.spec.ts                            # diagnostic only
```

If it passes serially and fails in parallel, report the pair of results as evidence — the fix is a
scheduling or tier decision, not a test change, and neither `workers` nor `retries` may be edited to
make a run green. Raising `@heavy` is legitimate only when a test is genuinely heavy on its own
terms, never as a way to absorb contention.
### Test completion is unknown

**Symptom**

A command may have finished, but no reliable final PASS/FAIL result is available.

**Classification**

`UNRESOLVED`.

**Fast action**

Perform at most one direct result-status check.
If the final result still cannot be established, stop and report `UNRESOLVED`.
Do not repeatedly poll processes, logs, timestamps, or terminals.

### Quick decision path

```text
Did the test actually run?
│
├─ No
│  ├─ PowerShell launcher problem → npm.cmd / npx.cmd once
│  ├─ Missing browser / permission / sandbox → BLOCKED
│  └─ Final state cannot be observed → UNRESOLVED
│
└─ Yes
   ├─ Assertion / compile / runtime failure → FAIL
   │   └─ diagnose exact failure → targeted fix → rerun affected check
   │
   └─ Confirmed successful → PASS
```

### Maintenance rule

Only add a troubleshooting entry when:
1. the issue has actually occurred;
2. the cause or classification is understood well enough to reuse;
3. there is a stable fast-action path.

Do not turn this document into a chronological error log.