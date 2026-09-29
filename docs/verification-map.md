# Verification map

Authoritative commands below match the existing scripts and scopes in
[`testing.md`](testing.md#per-subsystem-verify-commands). Each subsystem `verify:*` command includes
typecheck and its Vitest scope, and the two UI-facing commands (`verify:lookup`, `verify:ui`) also run
`check:css` first; `verify:full` also runs contract checks and builds. Choose the
narrowest applicable bucket; full regression is escalation only under §4 and §8 of
`agent-execution-rules.md`.

| Subsystem | Authoritative command | Typical scope |
| --- | --- | --- |
| Text reader | `npm run verify:reader` | `src/reader`, excluding PDF modes |
| PDF + OCR | `npm run verify:pdf` | `src/reader/pdf`, `src/reader/pdf-reading`, `src/documents/pdf` |
| Import | `npm run verify:import` | `src/documents`, excluding PDF and offline |
| Lookup | `npm run verify:lookup` | Lookup modules and lookup-sheet components (runs `check:css` first) |
| Language engine | `npm run verify:language` | `src/core/language`, lookup normalization |
| Translation / context / AI | `npm run verify:translation` | Translation, context, AI, integration, gateway |
| Storage | `npm run verify:storage` | Database, storage, notes store, vocabulary |
| UI | `npm run verify:ui` | Components, onboarding, app, NotesPanel (script exclusions apply; runs `check:css` first) |
| Offline | `npm run verify:offline` | Offline document and status surfaces |
| Full regression | `npm run verify:full` | Contract checks, full Vitest suite, typecheck, and build |

## Verification helper scripts

| Purpose | Command | Scope |
| --- | --- | --- |
| CSS syntax + import chain | `npm run check:css` | Parse every `src/**/*.css` with PostCSS; unresolved local `@import` also fails |
| Architecture contracts | `npm run verify:contracts` | Static PWA/Worker/build-script contracts and verify-script map parity |
| Test partition audit | `npm run verify:partitions` | Assign every Vitest test to one subsystem scope |
| List test files | `npm run verify:list` | List Vitest test files without running them |

Playwright is separate from these commands. Use the narrow browser spec and project required by §6
of `agent-execution-rules.md` for browser-observable changes. No `verify:quickcard` or
`verify:dictionary` scripts exist; dictionary audits are `npm run audit:dictionary` and
`npm run audit:en-vi-gaps`, not verification gates.

`verify:contracts` is included in `verify:full`; it checks stable config defaults and documentation
parity. The production build checks emitted service-worker precache contents and bundle budgets.

Run `npm run verify:partitions` to audit the partition. It enumerates every Vitest test file, derives
the nine scope definitions directly from the `verify:*` scripts in `package.json`, and applies the
same matching Vitest uses — case-insensitive positional substrings plus picomatch `--exclude` globs —
to assign each file to exactly one subsystem. It reports total, assigned, duplicate, orphan, and
per-subsystem counts, and exits unsuccessfully when a subsystem script is missing or when any test
file belongs to zero buckets or to more than one. Because it reuses the runner's own filter semantics
and the authoritative scope definitions, it fails on drift instead of merely listing test files.
