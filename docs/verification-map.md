# Verification map

The authoritative command definitions live in
[`testing.md`](testing.md#per-subsystem-verify-commands); the table below only selects among those
existing scripts and scopes. Each subsystem `verify:*` command includes
typecheck and its Vitest scope, and the two UI-facing commands (`verify:lookup`, `verify:ui`) also run
`check:css` first; `verify:full` also runs contract checks and builds. First classify the diff with
[Change classes](#change-classes) below ([canonical rules](agent-execution-rules.md#4-verification-proportionality)),
then choose the narrowest applicable command; full regression is escalation only under §4 and §8 of
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
| Full regression | `npm run verify:fast` | Contract checks, CSS syntax, full Vitest suite, and typecheck; no production build |
| Full regression (with build) | `npm run verify:full` | Contract checks, full Vitest suite, typecheck, and build |
| Default alias | `npm run verify` | Alias for the with-build regression gate |

## Change classes

Before choosing a command, classify the diff as **`PRESENTATION_ONLY`**, **`LOCAL_UI`**,
**`SUBSYSTEM_LOGIC`**, or **`SHARED_CONTRACT`**. The canonical definitions, per-class defaults, the
presentation-only stop rule and the worked cases live in
[`agent-execution-rules.md` §4](agent-execution-rules.md#4-verification-proportionality) and are not
restated here.

| Change class | Then verify with |
| --- | --- |
| `PRESENTATION_ONLY` | `npm run check:css` for a CSS diff, then stop |
| `LOCAL_UI` | Targeted colocated test plus `typecheck`; one narrow browser spec only if needed |
| `SUBSYSTEM_LOGIC` | The mapped `verify:*` command from the table above |
| `SHARED_CONTRACT` | The mapped `verify:*` command, escalating to `verify:full` when required |

Verification follows the **changed behavior, not the directory containing the changed file**: a
CSS-only edit inside a Lookup-owned stylesheet is not a Lookup task. These classes add a selection
layer *above* the subsystem commands — they never change the scopes above, and they justify no new
per-area scripts (`verify:theme`, `verify:mobile`, `verify:button` and similar fragments remain
deliberately absent).

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
