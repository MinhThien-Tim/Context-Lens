# Verification map

Authoritative commands below match the existing scripts and scopes in
[`testing.md`](testing.md#per-subsystem-verify-commands). Each subsystem `verify:*` command includes
typecheck and its Vitest scope; `verify:full` also runs contract checks and builds. Choose the
narrowest applicable bucket; full regression is escalation only under §4 and §8 of
`agent-execution-rules.md`.

| Subsystem | Authoritative command | Typical scope |
| --- | --- | --- |
| Text reader | `npm run verify:reader` | `src/reader`, excluding PDF modes |
| PDF + OCR | `npm run verify:pdf` | `src/reader/pdf`, `src/reader/pdf-reading`, `src/documents/pdf` |
| Import | `npm run verify:import` | `src/documents`, excluding PDF and offline |
| Lookup | `npm run verify:lookup` | Lookup modules and lookup-sheet components |
| Language engine | `npm run verify:language` | `src/core/language`, lookup normalization |
| Translation / context / AI | `npm run verify:translation` | Translation, context, AI, integration, gateway |
| Storage | `npm run verify:storage` | Database, storage, notes store, vocabulary |
| UI | `npm run verify:ui` | Components, onboarding, app, NotesPanel (script exclusions apply) |
| Offline | `npm run verify:offline` | Offline document and status surfaces |
| Full regression | `npm run verify:full` | Contract checks, full Vitest suite, typecheck, and build |

## Verification helper scripts

| Purpose | Command | Scope |
| --- | --- | --- |
| Architecture contracts | `npm run verify:contracts` | Static PWA/Worker/build-script contracts and verify-script map parity |
| Test partition audit | `npm run verify:partitions` | Assign every Vitest test to one subsystem scope |
| List test files | `npm run verify:list` | List Vitest test files without running them |

Playwright is separate from these commands. Use the narrow browser spec and project required by §6
of `agent-execution-rules.md` for browser-observable changes. No `verify:quickcard` or
`verify:dictionary` scripts exist; dictionary audits are `npm run audit:dictionary` and
`npm run audit:en-vi-gaps`, not verification gates.

`verify:contracts` is included in `verify:full`; it checks stable config defaults and documentation
parity. The production build checks emitted service-worker precache contents and bundle budgets.

Run `npm run verify:partitions` to audit all Vitest test files against these nine scopes. The audit
reports total and assigned files, duplicates, and orphans, and exits unsuccessfully if any file is
unassigned or assigned more than once.
