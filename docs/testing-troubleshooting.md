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

### PowerShell blocks npm.ps1

**Symptom**

```text
npm.ps1 cannot be loaded because running scripts is disabled

Classification
Launcher failure.
Fast action
Use:
npm.cmd run verify:pdf

or:
npx.cmd vitest run <test-file>

Do not modify Windows execution policy and do not retry through multiple shell wrappers.
Vitest watch mode does not exit
Symptom
The command stays running after tests finish or waits for file changes.
Cause
vitest or npm run test:watch was used instead of run mode.
Fast action
Use:
npx.cmd vitest run <test-file>

or the appropriate subsystem command:
npm.cmd run verify:<subsystem>

Agents must not use watch mode.
Single test passes but subsystem verification fails
Symptom
npx vitest run some-test.ts
PASS

but:
npm run verify:<subsystem>
FAIL

Meaning
The isolated test is not authoritative. A shared-state, integration, typecheck, or another test in the subsystem may be failing.
Fast action
Use the first real failure reported by the subsystem command.
Do not report the subsystem as PASS based only on the single-file run.
Full suite fails outside the task scope
Symptom
Targeted subsystem verification passes, but verify:full reports unrelated failures.
Fast action
Determine whether the failure is:
- caused by the current diff;
- pre-existing;
- environment-related.
If clearly unrelated, report it as an out-of-scope finding.
Do not fix unrelated code in the current task.
Playwright cannot find Chrome
Symptom
Browser launch fails because the configured Chrome channel is unavailable.
Classification
BLOCKED.
Fast action
Stop browser verification and report the missing browser.
Do not modify product code or switch browsers merely to make the test run.
Offline test fails when using dev server
Symptom
Service worker or offline reload behavior does not work under:
npm run dev

Cause
Context Lens service worker is production-build only.
Correct flow
npm.cmd run build
$env:QA_PRODUCTION='true'
npx.cmd playwright test e2e/offline.spec.ts

Do not treat missing service-worker behavior under the Vite dev server as a product regression.
Offline test starts before precache completes
Symptom
App shell loads but dictionary, WordNet, or other offline assets are unavailable.
Cause
The first online installation/cache population was incomplete.
Fast action
Allow one complete online load before switching the browser context offline.
Vocabulary handoff test cannot start
Symptom
e2e/vocabulary-handoff.spec.ts cannot reach English101.
Cause
The sibling English101 checkout/server is missing.
Classification
BLOCKED.
Do not rewrite the test or Context Lens integration because the second repository is absent.
Test unexpectedly performs a network request
Symptom
Vitest reaches an external provider or fails because network access is unavailable.
Cause
A provider/fetch call was not stubbed.
Fast action
Stub fetch or the provider using the patterns already present in:
src/lookup/webDictionary.test.ts
src/core/translation/providers/providers.test.ts

Unit/integration tests must not depend on live network services.
IndexedDB state leaks between tests
Symptom
Tests pass alone but fail when run together, often with stale records or unexpected database state.
Fast checks
- Confirm fake-indexeddb is being used through src/test/setup.ts.
- Check database cleanup/reset between tests.
- Check mocks are restored.
- Check the test does not depend on execution order.
Do not solve this by weakening assertions or forcing serial execution unless the architecture requires it.
TypeScript reports document or another browser global incorrectly
Known Context Lens example
A module-scope helper named document shadowed the global browser document.
Fast action
Check for local identifiers shadowing browser globals such as:
document
window
location
history
navigator

Rename the helper rather than changing TypeScript configuration.
Build succeeds in Vite but final build command fails
Symptom
Vite emits files successfully, but:
npm run build

still returns failure.
Cause
Context Lens also runs bundle/precache validation.
Fast action
Inspect the failure from:
scripts/check_bundle_budget.mjs

Possible causes include:
- JS bundle budget exceeded;
- CSS budget exceeded;
- required offline assets missing;
- heavy reader assets incorrectly entering precache.
Do not report build PASS just because Vite itself completed.
PDF/OCR browser tests are slow
Meaning
PDF rendering, OCR, real fixtures, and Playwright are intentionally heavier than normal Vitest tests.
Fast action
Run only the narrow spec/project required by the task.
Do not repeatedly restart a legitimate long-running test.
Test completion is unknown
Symptom
A command may have finished, but no reliable final PASS/FAIL result is available.
Classification
UNRESOLVED.
Fast action
Perform at most one direct result-status check.
If the final result still cannot be established, stop and report UNRESOLVED.
Do not repeatedly poll processes, logs, timestamps, or terminals.
Quick decision path
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

Retry limits
For launcher/environment problems:
1. Run the documented command.
2. Perform one safe fallback or approved retry.
Maximum: two execution attempts.
Do not chain shell workarounds or repeatedly rerun unchanged commands.
For genuine code failures, rerun only after:
- a meaningful code/config change; or
- a clearly identified reason requiring another execution.
Reporting template
PASS
STATUS: PASS
COMMAND: <command>
RESULT: <test count / build result>

FAIL
STATUS: FAIL
COMMAND: <command>
FAILURE: <test/file>
ERROR: <relevant assertion or diagnostic>
SCOPE: <current task or pre-existing/out-of-scope>

BLOCKED
STATUS: BLOCKED
REASON: <confirmed restriction>
ATTEMPTS: <commands and count>
LAST CONFIRMED SUCCESS: <check or none>
UNVERIFIED SCOPE: <remaining gap>

UNRESOLVED
STATUS: UNRESOLVED
REASON: <missing final-result evidence>
ATTEMPTS: <commands/status check>
LAST CONFIRMED SUCCESS: <check or none>
UNVERIFIED SCOPE: <remaining gap>

Maintenance rule
Only add a troubleshooting entry when:
1. the issue has actually occurred;
2. the cause or classification is understood well enough to reuse;
3. there is a stable fast-action path.
Do not turn this document into a chronological error log.

### 2. Thêm link vào `docs/testing.md`

Ở đầu `docs/testing.md`, hiện bạn có:

```md
Related: [ARCHITECTURE.md](ARCHITECTURE.md).

đổi thành:
Related: [ARCHITECTURE.md](ARCHITECTURE.md) · [Testing troubleshooting](testing-troubleshooting.md).