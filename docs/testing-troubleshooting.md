# Testing troubleshooting

Use this reference for recurring verification problems. [Testing](testing.md) owns commands and
scope; [agent execution rules](agent-execution-rules.md#7-execution--test-retry-policy) own
classification, retry limits, approval, and stop conditions. Follow those rules if an example here
appears to conflict with them.

## Classify the result first

| Status | Evidence |
| --- | --- |
| `PASS` | The command finished and its passing result is confirmed. |
| `FAIL` | The test or build ran and reported an assertion, compilation, runtime, or product failure. |
| `BLOCKED` | A launcher, environment, permission, browser, or other required capability prevented execution. |
| `UNRESOLVED` | Execution may have occurred, but its final result cannot be confirmed. |
| `NOT RUN` | The check was intentionally unnecessary or disproportionate. |

Do not change product code because a check is `BLOCKED`, `UNRESOLVED`, or `NOT RUN`.

## Launcher and environment

### PowerShell blocks `npm.ps1` or `npx.ps1`

Use `npm.cmd` or `npx.cmd` with the **same target and arguments**, once, if the session permits
the equivalent command. Prefer the `.cmd` launcher on the first Windows attempt. Do not change
Execution Policy or switch through multiple shells. A launcher error is not a product failure.

### Vite or esbuild reports `spawn EPERM`

The test did not start. If the current tool supports approval, request one narrowly scoped retry
through its official approval mechanism, within the two-attempt limit. If approval is unavailable,
denied, or execution is still blocked, report `BLOCKED`. Do not alter security settings or product
code to compensate.

### Playwright cannot find Chrome

The configured Chrome channel is unavailable. Report the browser check `BLOCKED`; do not silently
switch browsers or change application code.

### A command's final result is unknown

Check existing result evidence at most once, as specified in the
[completion policy](agent-execution-rules.md#completion-unknown-and-long-running-commands).
If that does not establish the result, report `UNRESOLVED`. Do not restart the command or poll
processes and logs repeatedly.

## Test selection and results

### Vitest stays running after tests

`vitest` and `npm run test:watch` start watch mode. Agent sessions must use the mapped
`verify:<subsystem>` command or `vitest run` for an optional, targeted pre-check. Do not start
watch mode in an agent session.

### A single test passes but subsystem verification fails

The single-file run is an iteration pre-check. The subsystem command also runs typecheck and other
tests in its scope. Diagnose the first confirmed failure from that command and report the subsystem
result accurately. A passing single file does not establish a subsystem `PASS`.

### Full verification fails outside the changed subsystem

Classify the specific failure. Compare it with the current diff before calling it pre-existing or
unrelated. Report an established out-of-scope finding without changing unrelated code. Do not run
`verify:full` merely because a targeted check was blocked.

### A unit test unexpectedly reaches the network

Unit and integration tests must stub external requests. Use the existing patterns in
`src/lookup/webDictionary.test.ts` or `src/core/translation/providers/providers.test.ts`.
Do not make test success depend on a live provider.

### IndexedDB state leaks between tests

Check that `fake-indexeddb` is active through `src/test/setup.ts`, then inspect database cleanup,
mock restoration, and assumptions about test order. Fix the confirmed isolation issue; do not
weaken assertions or force serial execution to hide it.

### TypeScript reports an unexpected browser global type

Check whether a local identifier shadows a browser global such as `document`, `window`, or
`location`. Rename the identifier if shadowing caused the error. Do not change TypeScript
configuration without evidence that the configuration is wrong.

### Vite emits files but `npm run build` fails

The build also runs `scripts/check_bundle_budget.mjs`. Read the failing diagnostic before
classifying the result. It can report bundle budgets, missing offline assets, or reader assets
entering precache. Vite output alone does not establish a build `PASS`.

## Browser-specific checks

### Offline behavior fails under `npm run dev`

The service worker is active only in production builds. Build first, then use the production
offline command from [testing.md](testing.md#commands). A missing service worker under the dev
server is not evidence of a product regression.

### Offline assets are unavailable on the first visit

Check that the first online load and precache installation finished before switching the browser
context offline. If the test itself fails after that, classify its actual assertion or browser
error; do not assume a cache timing issue.

### Vocabulary handoff cannot reach English101

That spec requires the sibling English101 checkout and its server. If the dependency is absent,
report the browser check `BLOCKED`. Do not rewrite the integration because the other repository
is unavailable.

### PDF or OCR browser tests run slowly

These specs render real fixtures and may use OCR. Run only the narrow spec and project warranted
by the change. A long-running test is not automatically a failure; apply the completion policy
without starting another copy.

## Retry and reporting

For one launcher or environment problem, allow at most two execution attempts total: the normal
command and one safe launcher fallback **or** officially approved scoped retry. These are not
separate budgets. A genuine `FAIL` can be rerun after a meaningful fix or a clearly identified
reason. See the [canonical policy](agent-execution-rules.md#7-execution--test-retry-policy) for
the exact decision rules.

Report `PASS` with the command, test count from the runner summary, and typecheck/build status.
Report `FAIL` with the failing command, test or file, relevant diagnostic, and affected area.
For `BLOCKED` or `UNRESOLVED`, use the canonical fields:

```text
STATUS: BLOCKED | UNRESOLVED
REASON: <confirmed restriction or missing final-result evidence>
ATTEMPTS: <commands or direct result check and count>
LAST CONFIRMED SUCCESS: <check or none>
UNVERIFIED SCOPE: <remaining gap>
```

Add a new troubleshooting entry only after the issue has occurred, its classification is clear,
and the corrective action is reusable. Keep chronological incident records elsewhere.
