# Testing & Verification

Related: [ARCHITECTURE.md](ARCHITECTURE.md) · [Testing troubleshooting](testing-troubleshooting.md).

## Test layout

| Kind | Location | Runner |
| --- | --- | --- |
| Unit / integration (co-located) | `src/**/*.test.ts`, `src/**/*.test.tsx` | Vitest via `vite.config.ts` |
| Gateway unit tests | `gateway/src/gateway.test.ts` | Vitest (same `include` glob) |
| Browser / E2E | `e2e/*.spec.ts` | Playwright, `playwright.config.ts` |
| Browser / E2E by execution tier | `e2e/*.spec.ts` | Playwright, `playwright.tiers.config.ts` (`PW_TIER`, tags `@pdf` / `@heavy`) |
| Cross-repository vocabulary handoff | `e2e/vocabulary-handoff.spec.ts` | Playwright, `playwright.vocabulary.config.ts` |
| Shared setup | `src/test/setup.ts` (`fake-indexeddb/auto`, `vi.restoreAllMocks`), `src/test/fixtures.ts` | — |
| Bundle budget + precache assets | `scripts/check_bundle_budget.mjs` | Node script, run during `build` |
| CSS syntax + import chain | `scripts/check_css_syntax.mjs` | Node script, run by `check:css`, `verify:ui`, `verify:lookup` |
| Static architecture contracts | `scripts/check_architecture_contracts.mjs` | Node script, run by `verify:contracts` |

Vitest config lives in `vite.config.ts` under `test`: `environment: 'jsdom'`,
`include: ['src/**/*.test.{ts,tsx}', 'gateway/**/*.test.{ts,tsx}']`,
`setupFiles: ['./src/test/setup.ts']`. There is **no** separate lint configuration; type safety is
`npm run typecheck` (`tsc -b`).

Notable colocated suites: `src/reader/TextReader.test.tsx`,
`src/reader/pdf/selectionAdapter.test.ts`, `src/reader/pdf/navigation.test.ts`,
`src/reader/pdf/stability.test.tsx`, `src/reader/pdf-reading/PdfReadingPage.test.tsx`,
`src/reader/pdf-reading/PdfReadingView.test.tsx`, `src/reader/pdf-reading/highlights.test.ts`,
`src/reader/pdf-reading/readingSelectionAdapter.test.ts`, `src/documents/pdf/extractStructuredPages.test.ts`,
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
| Architecture contract checks | `npm run verify:contracts` |
| Type check | `npm run typecheck` |
| Production build + bundle budget | `npm run build` |
| Bundle budget only | `npm run check:bundle` |
| CSS syntax + import chain only | `npm run check:css` |
| Targeted tests | `npx vitest run <path-or-glob>` |
| Single test by name | `npx vitest run <path> -t "<name>"` |
| Browser tests | `npm run test:browser` |
| Browser tests by execution tier | `$env:PW_TIER='<fast\|pdf-normal\|heavy>'; npx playwright test --config playwright.tiers.config.ts <spec>` |
| Browser tests, filtered by tag | `npx playwright test --config playwright.tiers.config.ts --grep '@pdf' <spec>` |
| Offline E2E (production build only) | `$env:QA_PRODUCTION='true'; npx playwright test e2e/offline.spec.ts` |
| Vocabulary handoff (two repos) | `npx playwright test --config playwright.vocabulary.config.ts` |
| Gateway typecheck / build / dry-run | `npm run gateway:typecheck`, `npm run gateway:build`, `npm run gateway:check` |
| Dictionary audits | `npm run audit:dictionary`, `npm run audit:en-vi-gaps` |

## Playwright execution tiers

`playwright.tiers.config.ts` imports the base `playwright.config.ts` and layers a tier on top, so
projects, `--project=laptop` / `--project=mobile-chromium`, and the web server behave exactly as
usual. Select a tier with `PW_TIER`; an unknown value fails fast rather than falling back silently.

### Tags

Tags are plain inline markers in the **test title**, not a separate declaration:

```ts
test('render trang 1 @pdf', async ({ page }) => { /* ... */ });
test('OCR window drain @pdf @heavy', async ({ page }) => { /* ... */ });
```

A title carries at most the tags it needs, and a tag is chosen by what the test *does*, never by
how long it happened to take.

| Tag | Meaning | Tier |
| --- | --- | --- |
| *(none)* | Navigation, chrome transitions, no PDF rasterisation | `fast` |
| `@pdf` | One PDF loaded: geometry, DPR, Lookup invariants | `pdf-normal` |
| `@heavy` | OCR windows, queue drains, long stability checks | `heavy` |

`@heavy` should almost always accompany `@pdf` for a PDF test, but it is independent: `heavy` selects
on `@heavy` alone, so a non-PDF slow test is still reachable. Adding `@heavy` is not a way to make a
failing test pass — a test is promoted because it is genuinely heavy, never because it was red.

### Tiers

| Tier | `PW_TIER` | Test timeout | `actionTimeout` | Workers | `globalTimeout` | Matches |
| --- | --- | --- | --- | --- | --- | --- |
| FAST | `fast` (default) | 30s | 10s | 4 | 20 min | untagged, excluding `@pdf`/`@heavy` |
| PDF-NORMAL | `pdf-normal` | 90s | 10s | 2 | 45 min | `@pdf` without `@heavy` |
| HEAVY | `heavy` | 180s | 10s | 2 | 60 min | `@heavy` |

`retries` stays `0` in every tier: a failing test is a failing test, and an automatic rerun would
hide exactly the flakiness these tiers exist to expose. `forbidOnly` is enabled under CI so a stray
`.only` cannot silently shrink a whole tier. `fullyParallel` is off unless `PW_FULLY_PARALLEL=1`,
because most specs in a file share Reader state.

**Concurrency is tier-owned, not uniform.** The tiers deliberately run `fast` at 4 workers and
`pdf-normal` / `heavy` at 2, because PDF rasterisation and OCR are CPU-bound: several workers
competing for the same cores is slower than running them alone. OCR/PDF wall-clock timeouts measured
under `workers: 4` are therefore **not** comparable with the same test run serially — see
[testing-troubleshooting.md](testing-troubleshooting.md).

### Environment overrides

| Variable | Effect |
| --- | --- |
| `PW_TIMEOUT_MS` | Overrides the tier's per-test timeout |
| `PW_WORKERS` | Overrides the tier's worker count |
| `PW_FULLY_PARALLEL=1` | Runs tests within a single file in parallel |
| `PW_REUSE_SERVER=0` | Always starts a fresh server instead of reusing one |

Server mode is selected by `QA_BASELINE=1`, `QA_PRODUCTION=1` (default: dev), or `QA_BASE_URL`.
`heavy` is best run with `QA_PRODUCTION=1` so dev-server on-demand compilation does not add
variance to a 180s budget.

```powershell
$env:PW_TIER='pdf-normal'; npx playwright test --config playwright.tiers.config.ts e2e/pdf-reader-chrome-a12.spec.ts
$env:PW_TIER='heavy'; npx playwright test --config playwright.tiers.config.ts e2e/pdf-ocr.spec.ts
```

## Per-subsystem verify commands

Each subsystem has **one command** — typecheck plus its Vitest scope. Classify the diff first with the
[change classes](verification-map.md#change-classes) and the
[canonical rules](agent-execution-rules.md#4-verification-proportionality); when it is
`SUBSYSTEM_LOGIC` or `SHARED_CONTRACT`, pick the subsystem command instead of discovering tests or
assembling ad-hoc `vitest run` filters. These scopes remain the architectural boundary and are not
narrowed per change class. `verify:full` is the escalation gate for shared-contract or bundle
changes, not the default, and the per-class defaults are not duplicated here.

| Subsystem | Command | Scope |
| --- | --- | --- |
| Reader (text surfaces) | `npm run verify:reader` | `src/reader`, excluding `src/reader/pdf/**` and `src/reader/pdf-reading/**` |
| PDF + OCR | `npm run verify:pdf` | `src/reader/pdf`, `src/reader/pdf-reading`, `src/documents/pdf` |
| Import | `npm run verify:import` | `src/documents`, excluding `src/documents/pdf/**` and `src/documents/offline*` |
| Lookup | `npm run verify:lookup` | `src/lookup` + lookup-sheet components, excluding `src/lookup/normalization/**` and `**/*.offline.test.tsx` |
| Language engine | `npm run verify:language` | `src/core/language`, `src/lookup/normalization` |
| Translation / context / AI | `npm run verify:translation` | `src/core/translation`, `src/core/context`, `src/core/{cache,diagnostics,performance}`, `src/ai`, `src/settings`, `src/integration`, `gateway` |
| Storage | `npm run verify:storage` | `src/db`, `src/storage`, `src/notes/store`, `src/vocabulary` |
| UI | `npm run verify:ui` | `src/components`, `src/onboarding`, `src/app`, `src/notes/NotesPanel`, excluding lookup/offline components |
| Offline | `npm run verify:offline` | `src/documents/offline`, `src/components/OfflineBadge`, `src/components/LookupBottomSheet.offline` |
| Full suite, no build | `npm run verify:fast` | `verify:contracts` + `check:css` + `typecheck` + full `vitest run` |
| Everything | `npm run verify:full` | `verify:contracts` + `typecheck` + full `vitest run` + `build` (bundle and precache checks) |
| Everything (alias) | `npm run verify` | Alias for `npm run verify:full` |

`npm run verify:contracts` checks PWA update/chunk exclusions, Worker route/default config,
production-build budget hooks, and parity between `package.json` verify scripts and
[`verification-map.md`](verification-map.md). The production build checks that heavy reader chunks
stay out of the generated service-worker precache and that required icons, dictionary, and WordNet
payloads remain precached.

`npm run verify:partitions` is the automated partition audit: it enumerates every Vitest test file,
derives the nine subsystem scopes from the `verify:*` scripts in `package.json`, and applies the same
matching Vitest uses — case-insensitive positional substrings plus picomatch `--exclude` globs. It
reports total, assigned, duplicate, orphan, and per-subsystem counts, and exits non-zero if a
subsystem script is missing, or if any file belongs to zero buckets or to more than one. It reuses the
runner's own filter semantics and scope definitions, so it fails when the mapping drifts instead of
merely listing files. `npm run verify:list` only lists files. Vitest positional filters are
case-insensitive substring matches, not globs — scope with directory or file prefixes plus
`--exclude` globs. Playwright stays out of these scripts: browser specs remain `npm run test:browser`,
and the production-only offline spec keeps its one-off command in the table above.

`npm run verify:ui` and `npm run verify:lookup` start with `npm run check:css`
(`scripts/check_css_syntax.mjs`). Typecheck and jsdom Vitest do not parse stylesheets — jsdom never
loads them — so a malformed stylesheet such as an unclosed `@media` block used to pass every narrow
subsystem check and fail only in `vite build`, as a PostCSS `Unclosed block` error. The guard reuses
the same PostCSS parser the Vite pipeline uses, fails non-zero on any parse error or unresolved local
`@import`, and covers every stylesheet under `src/`. It parses the whole `src/**/*.css` set rather
than one entry point because only `src/styles.css` is imported eagerly: `src/reader-layout.css`
(with the reader base/mobile/desktop files) and `src/home-advanced.css` are reached through lazy
`import()` calls in `src/app/App.tsx` and are invisible to an entry-only walk.

## Targeted verification strategy

Classify the diff first with the canonical
[change classes](verification-map.md#change-classes) and the
[§4 proportional verification policy](agent-execution-rules.md#4-verification-proportionality):
`PRESENTATION_ONLY` stops at `npm run check:css`, `LOCAL_UI` may stop at its targeted check,
`SUBSYSTEM_LOGIC` uses the mapped `verify:*` command, and `SHARED_CONTRACT` escalates to
`verify:full` when justified.

Documentation-only tasks use document/link/diff checks; application tests are unnecessary.
Use the mapped subsystem command as authoritative final verification when a subsystem bucket applies.
Full regression is escalation
only when justified by scope or evidence below; browser E2E remains a separate narrow check when
warranted, one spec and one project where sufficient.

1. While iterating, a file, `describe` block, or `-t` filter may be a fast pre-check; once the change lands, run the subsystem `verify:*` command per [§8](agent-execution-rules.md#8-verification-execution-and-reporting) rather than steps 1–3 as separate turns.
2. Add or update a colocated test next to the module you changed, following the existing
   `describe` / `it` style and the jsdom + `fake-indexeddb` environment; the subsystem command is the
   authoritative run after implementation, and is the intended final check for a `LOCAL_UI` change.
3. Typecheck is already included in each `verify:*` command, and is skipped for a CSS-only
   `PRESENTATION_ONLY` diff.
4. Escalate to `npm run verify:full` only when the change crosses subsystem boundaries, touches shared
   contracts (cache keys, location shapes, backup schema, provider priority), or otherwise meets §4
   of `agent-execution-rules.md`.
5. Build is included in `verify:full` for justified bundle, dynamic import, or precache changes.
6. Browser automation is a separate narrow check only when warranted; see the restrictions below.

## Execution and retry policy

Follow the canonical [Execution / Test Retry Policy](agent-execution-rules.md#7-execution--test-retry-policy)
for classification, safe launcher fallback, official sandbox approval, security boundaries, retry
budgets and unknown completion; follow [§8](agent-execution-rules.md#8-verification-execution-and-reporting)
for command batching and reporting.
Use the narrowest target and one relevant project; never the whole directory, and no extra viewport
unless the task itself concerns responsive or device behavior. Do not use browser checks to
compensate for a blocked targeted check. A `BLOCKED` browser run is reported, not worked around,
and does not justify a broader run.

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
