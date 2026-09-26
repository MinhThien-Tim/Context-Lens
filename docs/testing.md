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
`src/integration/languageFlow.test.ts`.

## Commands

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
| Vocabulary handoff (two repos) | `npx playwright test --config playwright.vocabulary.config.ts` |
| Gateway typecheck / build / dry-run | `npm run gateway:typecheck`, `npm run gateway:build`, `npm run gateway:check` |
| Dictionary audits | `npm run audit:dictionary`, `npm run audit:en-vi-gaps` |

## Targeted verification strategy

1. Run the tests closest to the change first: one file, one `describe` block, or one `-t` filter.
2. Add or update a colocated test next to the module you changed, following the existing
   `describe` / `it` style and the jsdom + `fake-indexeddb` environment.
3. Add `npm run typecheck` when types, public signatures, or Dexie records changed.
4. Only escalate to `npm test` when the change crosses subsystem boundaries or touches shared
   contracts (cache keys, location shapes, backup schema, provider priority).
5. Run `npm run build` when bundle boundaries, dynamic imports, or service-worker precache lists
   changed.
6. Browser automation is a last resort; see the restrictions below.

## Blocked-execution rule (mandatory)

If a test or command is blocked by any of the following:

- Execution Policy
- shell integration restrictions
- environment or tool restrictions
- permission restrictions

then **stop attempting that blocked execution path**. Do not:

- repeatedly retry the same command
- poll or sleep-wait on processes
- create workaround or retry loops
- change shell or security policy
- launch a heavier alternative test workflow (for example a full Playwright browser run) merely to
  bypass the restriction

Report the affected verification as `BLOCKED` and state the exact remaining verification gap so a
human can close it.

Allowed verification statuses: `PASS`, `FAIL`, `BLOCKED`, `UNRESOLVED`, `NOT RUN`.

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
  against the production build plus `npm run preview`.
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
