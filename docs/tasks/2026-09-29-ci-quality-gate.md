# CI Quality Gate — Task Plan

## TASK

Add a lightweight GitHub Actions quality gate for normal type, unit/integration, production-build, and bundle regressions. Keep the existing secret scan as a separate security gate.

## AFFECTED SUBSYSTEM

CI verification and repository quality gates.

## CURRENT STATE / ROOT CAUSE

- `.github/workflows/secret-scan.yml` runs independently on `push`, `pull_request`, `merge_group`, and `workflow_dispatch`; it has read-only contents permission and a 10-minute timeout.
- `npm run verify:full` is the existing aggregate verification command: architecture contracts, typecheck, full Vitest run, then production build. `npm run build` runs the bundle budget check and verifies production precache assets.
- Playwright is deliberately separate from verify scripts. The full browser run starts a Vite server, requires the Chrome channel, and has documented environment and fixture constraints.

## LIKELY FILES

- Add `.github/workflows/quality-gate.yml`.
- Leave `.github/workflows/secret-scan.yml` unchanged.

## ARCHITECTURAL INVARIANTS

- Reuse the existing `verify:full` command; do not duplicate its steps or test filters in YAML.
- Keep network-dependent runtime providers disabled; unit and integration tests must continue using their existing local stubs.
- Do not add deployment, secrets, gateway online mode, or unsupported services.
- Keep Playwright outside the default gate under the current policy in `docs/testing.md` and `docs/agent-execution-rules.md` §6.

## IMPLEMENTATION PLAN

1. Add a separate workflow triggered by `push`, `pull_request`, `merge_group`, and `workflow_dispatch`, matching the secret-scan coverage. Avoid path filters so required checks cannot be skipped by an incomplete path list.
2. Use one Linux job, for example `quality`, with a bounded job timeout (recommend 30 minutes initially). A single job preserves the documented sequence, avoids repeated checkout/install across split jobs, and makes any failure block the same aggregate check.
3. Grant only `contents: read`. Checkout with persisted credentials disabled. Set up a supported pinned Node LTS major and enable the setup-node npm cache keyed by `package-lock.json`; run `npm ci` from the lockfile.
4. Run `npm run verify:full`. This uses existing scripts and performs the desired typecheck → full unit/integration suite → production build and bundle budget, with static contract checks also included by the authoritative aggregate command. Do not add a separate `build` or `check:bundle` step, which would repeat work.
5. Keep the secret scan as its own workflow/job and status check. Do not make it dependent on quality-gate success; both should run independently for the same events.

## TESTS REQUIRED

- Validate workflow syntax and action references by review or the repository's available CI validation mechanism; do not add repository tests for workflow behavior unless an existing convention requires it.
- CI's required application check is `npm run verify:full` on Ubuntu. It includes `verify:contracts`, `typecheck`, `vitest run`, `build`, and bundle/precache checks.
- Playwright: **outside the default PR/push gate for now**. Keep manual/targeted runs for changes with browser-observable behavior; the documented Chrome-channel dependency, production-only offline test requirements, and cross-repository vocabulary fixture make blanket E2E unsuitable as a routine gate. Reconsider selected reader-sensitive E2E only if reliable CI browser provisioning and a clear path-based policy are established.

## OUT OF SCOPE

- Application behavior, tests, or verification script redesign.
- Gateway online checks, deployment, secret provisioning, external services, matrices, and the full Playwright suite.
- Changing the existing secret-scan workflow or combining security and quality checks into one job.

## OPEN QUESTIONS / RISKS

- Use a supported Node LTS version compatible with the lockfile and current Vite/Vitest toolchain; verify the chosen major before implementation. Pin third-party actions to immutable commit SHAs, following the existing secret-scan workflow's supply-chain practice.
- A single sequential `verify:full` job is simpler and avoids duplicate installs, but a full Vitest run may take longer than a targeted subsystem bucket; monitor actual CI duration before considering job splitting.
- npm cache stores package download data, not `node_modules`; `npm ci` remains deterministic. Cache is appropriate because the lockfile provides a stable key and it does not bypass installation.
- Rollback risk is low: removing the new workflow restores the previous CI behavior. The main operational risk is a required status check or timeout configuration that prevents merges; verify branch-protection check naming when adopting it.
