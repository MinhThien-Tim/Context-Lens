# Architecture Contract Verification Plan

## TASK

Add a small, deterministic architecture-contract verification layer for existing invariants. Keep the current architecture and Vitest setup; do not implement in this task.

## AFFECTED SUBSYSTEM

Verification/tooling, with static config contracts, build artifact checks, existing translation/gateway tests, and verification documentation.

## CURRENT STATE / ROOT CAUSE

Important contracts currently live in `docs/ARCHITECTURE.md` and `COST & QUOTA GUARDRAILS.md`, while only some are enforced by tests or the production build. `verify:full` already runs typecheck, all Vitest tests, and `build`; the build runs `scripts/check_bundle_budget.mjs`. The verification map documents `verify:*` scripts, but no check currently confirms that its command names match `package.json`.

## SELECTED INVARIANTS AND ENFORCEMENT

| Candidate | Classification / decision | Why enforce / mechanism |
| --- | --- | --- |
| PWA `registerType: 'prompt'` | Static config check | Prevents silent reload policy drift. A small Node contract checker should inspect the Vite config structurally (TypeScript AST using the already-installed TypeScript package), locating the `VitePWA` options and checking the property value. Avoid a source regex. |
| Heavy reader chunks excluded from service-worker precache | Build artifact check | This protects both bundle separation and offline install cost. Extend the existing post-build `scripts/check_bundle_budget.mjs` (or its existing companion logic) to inspect generated precache manifest/service-worker references and fail if emitted `pdf-reader-*`, `ocr-reader-*`, `epub-reader-*`, `docx-reader-*`, or `archive-runtime-*` chunks enter precache. Also retain static assertions that the named manual chunk rules and matching `globIgnores` remain present only if artifact output cannot represent a rule. |
| Managed Worker execution restricted to `/api/*` | Static config check | Parse `gateway/wrangler.jsonc` as JSONC (Wrangler's existing dependency/tooling; no new package) and require `assets.run_worker_first` to equal `['/api/*']`. This keeps static assets on the assets path. |
| Gateway API allowlist currently only `/api/translate` | Existing integration test, with a small gap review | `gateway/src/index.ts` explicitly rejects every pathname except `/api/translate`, and `gateway/src/gateway.test.ts` is already in Vitest scope. Ensure a test asserts an unapproved `/api/*` path returns 404 and does not touch quota or upstream; do not add a config-level duplicate of routing behavior. |
| `ONLINE_ENABLED` false by default | Static config check | Parse `gateway/wrangler.jsonc` and assert `vars.ONLINE_ENABLED === 'false'`. This catches a cost-sensitive default before deploy. |
| Local/cache-first, existing managed Worker placement | Existing unit/integration tests | `src/core/translation/router.test.ts` already verifies cache before providers; `src/settings/engines.test.ts` covers the current managed-provider placement. In Auto mode the managed Worker follows local, browser, and MyMemory providers but can precede configured Google/Bing providers. Preserve this runtime order in this verification task. Do not test the pipeline by source-text ordering. |
| Bundle budget enforced by production build | Static package-script check | Contract checker asserts `build` includes `node scripts/check_bundle_budget.mjs` and gateway build retains its budget check. Build itself remains the behavioral validation; no duplicated budget calculation. |
| Verification map and `verify:*` scripts stay aligned | Static documentation/package check | Checker extracts authoritative command names from the `docs/verification-map.md` table and compares with `package.json` keys beginning `verify:` (including `verify:list` and `verify:partitions`, which must be explicitly represented/documented). Fail on missing, stale, or duplicate entries. Keep table parsing narrow and document the accepted table shape. |
| Critical generated/static asset rules | Build artifact check, limited to named contract | Check required PWA static inputs (icon files and dictionary/WordNet payloads) appear in generated precache output; check heavy reader chunks are absent. Do not attempt broad auditing of every public asset or generated file. |

## LIKELY FILES / OWNERSHIP

- New `scripts/check_architecture_contracts.mjs`: static checks for Vite PWA config, Wrangler `run_worker_first` and default, build script enforcement, and verification-map/script parity.
- `scripts/check_bundle_budget.mjs`: generated build artifact assertions for precache inclusion/exclusion, because it already runs after the production build and owns build-size checks.
- `gateway/src/gateway.test.ts`: behavior test for deny-by-default API route, if the existing tests do not already assert it.
- `src/core/translation/router.test.ts`, provider-registry test file, or `src/lookup/service.test.ts`: only extend an existing test for an uncovered provider-order seam; do not duplicate current coverage.
- `package.json`: add a dedicated `verify:contracts` script and include it in `verify:full`.
- `docs/testing.md`, `docs/verification-map.md`: document the dedicated script and its scope; keep `verify:full` command description accurate.

## IMPLEMENTATION PLAN

1. Add one static contract checker with clear, individual failure messages. Use the TypeScript compiler API for `vite.config.ts`, JSONC parsing available from installed Wrangler dependencies for `gateway/wrangler.jsonc`, and narrow table parsing for verification-map parity. Do not add dependencies.
2. Add `verify:contracts` as a cheap standalone command and make `verify:full` invoke it. Keep it out of every subsystem command to avoid adding repeated overhead to routine focused runs.
3. Extend the existing production build budget script to validate the generated PWA precache contents for the selected required assets and heavy-chunk exclusions. Keep checks resilient to content hashes while matching stable chunk prefixes.
4. Confirm the gateway deny-by-default behavioral assertion exists; add only the smallest missing test. Review current router/provider tests before changing them; preserve behavioral ownership in those suites.
5. Update `docs/testing.md` and `docs/verification-map.md` to list `verify:contracts`, explain its static/build checks, and retain clear separation from test partitions.

## RUNTIME COST

- `verify:contracts`: expected under one second; reads three small config/docs files and does no build or test startup.
- Build artifact assertions: negligible additional time during `build`; inspect already-generated files only.
- Gateway/provider assertions: run as part of existing `verify:translation` / `verify:full`; no new framework or browser run.

## FALSE-POSITIVE RISKS

- TypeScript AST checks can be over-coupled to config syntax; identify the relevant call/property by symbol and report inability to locate it as a clear contract failure. Avoid matching unrelated `registerType` text.
- `gateway/wrangler.jsonc` may acquire comments or formatting; use an actual JSONC parser supplied by existing tooling, not `JSON.parse` assumptions or regex.
- Build plugin versions may change generated manifest layout; artifact checker should locate the emitted Workbox precache list semantically and fail clearly if its expected artifact cannot be found.
- Verification-map table formatting changes can break a narrow parser. Keep the parser limited to the named table and make mismatches print expected/actual names.
- PWA precache output may rename or hash assets. Match stable prefixes/logical required paths rather than full hashed filenames.

## WHICH CHECKS RUN WHERE

- Dedicated `verify:contracts`: static config defaults, build-script enforcement, and map/package script parity.
- `verify:full`: invokes `verify:contracts`, then retains existing typecheck, full Vitest, and production build sequence. The build itself executes budget and precache artifact assertions.
- `verify:translation`: remains the focused owner for gateway and translation behavior; no new dedicated gateway command.
- Other subsystem scripts: unchanged.

## ARCHITECTURAL INVARIANTS

- Local/static first and cache before network; managed Worker remains opt-in and outside reading-critical local flows. Its current priority can precede configured Google/Bing providers; changing that order requires a separate behavior task.
- Worker API remains deny-by-default; only `/api/translate` is approved, and Worker-first routing remains `/api/*` only.
- PWA update remains prompt-based; heavy reader chunks remain lazy and excluded from precache.
- No new paid/network behavior, framework, dependency, broad lint rule, or architecture redesign.

## TESTS REQUIRED / TARGETED VERIFICATION

- Add focused tests only for behavior gaps identified in gateway/provider suites.
- Run `npm.cmd run verify:contracts` for the new static check.
- Run `npm.cmd run verify:translation` for gateway/provider behavior changes.
- Run `npm.cmd run verify:full` once as final verification because the task changes shared verification contracts and production build artifact assertions. Its build confirms budget plus precache checks.
- Documentation/link/diff check for updates to `docs/testing.md` and `docs/verification-map.md`.

## ACCEPTANCE CRITERIA

- The selected checks fail with actionable messages when their named contracts are deliberately violated, and pass against current config/build output.
- `verify:contracts` is deterministic, fast, and introduces no dependency or separate test framework.
- `verify:full` runs the static contract check and still enforces the bundle budget and generated precache constraints through production build.
- Gateway route allowlisting and translation/cache ordering remain behavior-tested in existing Vitest suites, with no source-regex ordering checks.
- `docs/verification-map.md` and `package.json` verify-script inventories cannot drift silently.
- The contract layer does not alter application architecture or runtime behavior.

## OUT OF SCOPE

Broad repository linting; redesigning Vite, provider, or gateway architecture; adding a test framework or dependencies; browser E2E; validating every static asset or generated file; implementing any change as part of this Planner task.

## OPEN QUESTIONS / RISKS

- Verify the installed Wrangler dependency exposes a supported JSONC parser before implementation; if not, use a small dependency-free parser only if it handles comments safely, or reduce this one check to a focused config test without adding a package.
- The current verification map lists the nine subsystem commands and `verify:full`, but does not list helper scripts `verify:list` and `verify:partitions`; decide whether to document those in a separate helper-script table or explicitly exempt them from parity comparison.
