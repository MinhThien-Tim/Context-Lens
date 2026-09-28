# Testing & Verification

Related: [ARCHITECTURE.md](ARCHITECTURE.md).

## Test layout

| Kind | Location | Runner |
| --- | --- | --- |
| Unit / integration (co-located) | `src/**/*.test.ts`, `src/**/*.test.tsx` | Vitest via `vite.config.ts` |
| Gateway unit tests | `gateway/src/gateway.test.ts` | Vitest (same `include` glob) |
| Browser / E2E | `e2e/*.spec.ts` | Playwright, `playwright.config.ts` |
| Cross-repository vocabulary handoff | `e2e/vocabulary-handoff.spec.ts` | Playwright, `playwright.vocabulary.config.ts` |
| Shared setup | `src/test/setup.ts` (`fake-indexeddb/auto`, `vi.restoreAllMocks`), `src/test/fixtures.ts` | — |
| Bundle budget | `scripts/check_bundle_budget.mjs` | Node script, run during `build` |

Vitest config lives in `vite.config.ts` under `test`: `environment: 'jsdom'`,
`include: ['src/**/*.test.{ts,tsx}', 'gateway/**/*.test.{ts,tsx}']`,
`setupFiles: ['./src/test/setup.ts']`. There is **no** separate lint configuration; type safety is
`npm run typecheck` (`tsc -b`).

Notable colocated suites: `src/reader/TextReader.test.tsx`,
`src/reader/pdf/selectionAdapter.test.ts`, `src/reader/pdf/navigation.test.ts`,
`src/reader/pdf/stability.test.tsx`, `src/reader/pdf-reading/PdfReadingPage.test.tsx`,
`src/reader/pdf-reading/highlights.test.ts`, `src/documents/pdf/extractStructuredPages.test.ts`,
`src/documents/pdf/ocrEligibility.test.ts`, `src/documents/pdf/ocrStore.test.ts`,
`src/core/language/local-language-engine.test.ts`, `src/core/language/sense-resolver.test.ts`,
`src/core/translation/router.test.ts`, `src/core/translation/public-quality.test.ts`,
`src/lookup/normalization/normalization.test.ts`, `src/db/database.test.ts`,
`src/storage/backup.test.ts`, `src/vocabulary/export.test.ts`, `src/settings/engines.test.ts`,
`src/integration/languageFlow.test.ts`, `src/documents/offline.test.ts`,
`src/components/OfflineBadge.test.tsx`, `src/components/LookupBottomSheet.offline.test.tsx`.

## Commands

On Windows PowerShell, use `npm.cmd` and `npx.cmd` wherever the table says `npm` and `npx`.
Keep the same arguments and test scope; see the [launcher policy](agent-execution-rules.md#capability-and-security-boundary).

| Purpose | Command |
| --- | --- |
| Full unit/integration suite | `npm test` |
| Watch mode (**avoid in agent sessions**) | `npm run test:watch` |
| Type check | `npm run typecheck` |
| Production build + bundle budget | `npm run build` |
| Bundle budget only | `npm run check:bundle` |
| Targeted tests | `npx vitest run <path-or-glob>` |
| Single test by name | `npx vitest run <path> -t "<name>"` |
| Browser tests | `npm run test:browser` |
| Offline E2E (production build only) | `$env:QA_PRODUCTION='true'; npx playwright test e2e/offline.spec.ts` |
| Vocabulary handoff (two repos) | `npx playwright test --config playwright.vocabulary.config.ts` |
| Gateway typecheck / build / dry-run | `npm run gateway:typecheck`, `npm run gateway:build`, `npm run gateway:check` |
| Dictionary audits | `npm run audit:dictionary`, `npm run audit:en-vi-gaps` |

## Targeted verification strategy

Documentation-only tasks use document/link/diff checks; application tests are unnecessary.
Prefer targeted unit, relevant integration, then relevant E2E; full suite only when justified by scope
or evidence below.

1. Run the tests closest to the change first: one file, one `describe` block, or one `-t` filter.
2. Add or update a colocated test next to the module you changed, following the existing
   `describe` / `it` style and the jsdom + `fake-indexeddb` environment.
3. Add `npm run typecheck` when types, public signatures, or Dexie records changed.
4. Only escalate to `npm test` when the change crosses subsystem boundaries or touches shared
   contracts (cache keys, location shapes, backup schema, provider priority).
5. Run `npm run build` when bundle boundaries, dynamic imports, or service-worker precache lists
   changed.
6. Browser automation is a last resort; see the restrictions below.

## Execution and retry policy

Follow the canonical [Execution / Test Retry Policy](agent-execution-rules.md#7-execution--test-retry-policy)
for classification, safe launcher fallback, official sandbox approval, security boundaries, retry
budgets and unknown completion.
Do not escalate test scope because a targeted check is blocked.

## Verification status semantics

| Status | Meaning |
| --- | --- |
| `PASS` | Test ran and a passing result was confirmed. |
| `FAIL` | Test ran and a genuine code/test failure was confirmed: assertion, compilation, runtime or product behavior. |
| `BLOCKED` | Environment, security, permission or unavailable capability prevented verification. |
| `UNRESOLVED` | Execution occurred or may have occurred, but its final result cannot reliably be confirmed. |
| `NOT RUN` | Intentionally unnecessary or disproportionate. |

Never convert `BLOCKED`, `UNRESOLVED` or `NOT RUN` into `PASS`, or report an environment problem as
product `FAIL`. Report remaining unverified scope.

## Working rules

- **No watch mode.** `npm run test:watch` is a developer convenience and must not be started in an
  agent session; it never exits.
- **Prefer targeted tests** over full-suite runs.
- **Avoid unnecessary full-suite runs.** `npm test` is justified only by the triggers above.
- **Avoid heavy Playwright/browser automation** unless the task explicitly requires it. The
  Playwright suite starts a Vite dev server, uses the `chrome` channel, and runs single-worker with
  120 s timeouts; PDF/OCR specs additionally rasterize real fixtures.
- **Never weaken tests to make them pass.** Fix the code or report the failure.
- Tests must not reach the network. Stub `fetch` (see `src/lookup/webDictionary.test.ts`,
  `src/core/translation/providers/providers.test.ts`) and rely on `fake-indexeddb` for persistence.

## Environment notes / known restrictions

- `npm run dev` does not install a service worker, so offline reload behavior is only verifiable
  against the production build plus `npm run preview`. `e2e/offline.spec.ts` therefore skips at
  collection time unless `QA_PRODUCTION` is set, and needs a completed `npm run build` first:
  `$env:QA_PRODUCTION='true'; npx playwright test e2e/offline.spec.ts`. Its default `laptop` and
  `mobile-chromium` projects are the one-desktop/one-mobile pair required by the offline task; the
  spec drives real offline transitions with `context.setOffline(true)`, so it must not be retried as
  a flake when it fails.
- The service worker is active in production builds only; browser AI requests require HTTPS outside
  localhost.
- The production app precaches a large dictionary/WordNet payload, so the first online visit must
  complete before offline testing is meaningful.
- Playwright requires a locally installed Chrome channel; when it is unavailable, browser specs are
  reported `BLOCKED` rather than worked around.
- `e2e/vocabulary-handoff.spec.ts` is excluded from the default Playwright project and needs the
  sibling English101 repository served at `../English101`; without it, that spec is `BLOCKED`.
- The `release/` dictionary and WordNet assets and the `tmp/pdf-baseline` fixture app are build
  inputs, not test targets; do not "fix" them as part of unrelated tasks.

## Important files

`vite.config.ts` (test block), `playwright.config.ts`, `playwright.vocabulary.config.ts`,
`src/test/setup.ts`, `src/test/fixtures.ts`, `gateway/src/gateway.test.ts`,
`scripts/check_bundle_budget.mjs`, `e2e/pdfFixture.ts`, `e2e/pdfQueueFixture.ts`.
