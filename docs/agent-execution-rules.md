# Agent Execution Rules

Detailed workflow for agents changing this repository. Read [`AGENTS.md`](../AGENTS.md) first — it holds
the short, high-priority rules. This file covers *how* to execute a task.

Architecture lives in [`ARCHITECTURE.md`](ARCHITECTURE.md). Test structure, runners, and the full command
table live in [`testing.md`](testing.md) and are **not** duplicated here. This document decides *when and
how far* to verify, and *when to stop*.

## Precedence

```text
task-specific instructions  >  AGENTS.md  >  this document  >  domain architecture docs
```

Code and config (`vite.config.ts`, `package.json`, `playwright.config.ts`) are the final authority for
behavior and facts. When a doc and the code disagree, the code is right and the doc gets fixed in the
same task.

## 1. Scope discipline

Establish before the first edit:

```text
TASK
AFFECTED SUBSYSTEM   (one domain doc from the ARCHITECTURE.md routing table)
LIKELY FILES
ARCHITECTURAL INVARIANTS AT RISK   (docs/ARCHITECTURE.md; COST & QUOTA GUARDRAILS.md)
TESTS REQUIRED
```

- Change only the subsystem named in the task. Adjacent code is not an invitation.
- No opportunistic cleanup, drive-by refactors, formatting sweeps, or renaming.
- An unrelated defect discovered mid-task is **reported, not fixed**, unless the task explicitly
  includes it.
- Do not add dependencies, tooling, or configuration that the task did not ask for.

## 2. Architecture-first navigation

1. `docs/ARCHITECTURE.md` → subsystem map, entry points, invariants, routing table.
2. The single matching domain doc: `reader.md`, `translation-pipeline.md`, `ui-system.md`,
   `data-storage.md`, or `testing.md`.
3. Only the source files that domain doc names.

- **Never** start with a recursive repository scan or a broad search for a concept.
- Docs are a navigation aid, not truth. When a documented path or contract looks wrong against the
  source, verify the source and correct the doc.
- Do not re-verify the whole documentation set. Check only the subsystem being changed.
- Do not re-read a large unchanged file when only one unknown region is needed; read the range.
- Any document in `docs/` that the `ARCHITECTURE.md` documentation tiers do not list as canonical or
  specialized is historical background, not current architecture. Read it only when the task explicitly
  asks about that history.

### Architecture doc maintenance

Update the affected domain doc **in the same task** when the change alters architecture, ownership,
subsystem boundaries, control flow, data flow, persistence, or meaningful integration behavior.

Do **not** update architecture docs for: copy, naming, style values, test-only additions, or isolated
bug fixes. Architecture docs describe current structure, not task history.


## 3. Token and context efficiency

- Search exact filenames, symbols, and config keys first; read the matching range second.
- Do not load large data assets into context: the `release/dictionary` and `release/wordnet` packs,
  `tmp/` fixtures, lockfiles, build output, and captured JSON reports.
- `release/` assets and `tmp/pdf-baseline` are build inputs, not code to refactor.
- Reuse what an earlier read already established instead of re-reading it.
- When context is already large and the implementation is stable, stop expanding it and produce a
  handoff rather than carrying the session forward.
- Run targeted searches with a narrow question; avoid queries that return whole directories.

## 4. Verification proportionality

Effort tracks **blast radius**, not test availability. `docs/testing.md` has the commands; this table
decides how many of them are justified.

| Risk | Typical change | Justified verification |
| --- | --- | --- |
| **Low** | Copy, token rename, style value, isolated pure function, doc-only | The one colocated test if one exists, or `npx vitest run <path>`. Nothing else. |
| **Medium** | Pipeline stage, normalization, provider adapter, cache key, component logic, Dexie record shape | Targeted Vitest file(s) plus `npm run typecheck`. Add a colocated test next to the change. |
| **High / shared contract** | Dexie schema version, `TRANSLATION_VERSION` / `CONTEXT_VERSION` / `OCR_CONFIG_VERSION`, cache keys, location shapes, backup schema, provider priority, cross-subsystem state | Targeted tests, then `npm test` as the escalation gate. `npm run build` when bundle or service-worker precache boundaries moved. |
| **Browser-observable** | Selection/highlight, PDF canvas or OCR queue, layout/responsive, focus/scroll/panel, PWA install or offline | High-risk checks plus one narrow Playwright spec (§6). |

Two hard exclusions:

- **No watch mode.** `npm run test:watch` never exits and must not be started in an agent session.
- **No full-suite reflex.** `npm test` is justified only by the "High / shared contract" row or by a
  targeted test revealing an unexpected cross-module dependency. Full suite once, at final
  verification, when scope warrants it.

## 5. Test escalation order

1. **Targeted unit test** — the colocated file next to the change: `npx vitest run src/path/file.test.ts`.
2. **Narrower still** — a single case: `npx vitest run src/path/file.test.ts -t "name"`.
3. **Typecheck** — `npm run typecheck` whenever types, public signatures, or Dexie records changed.
4. **Integration** — `npx vitest run src/integration/languageFlow.test.ts` for cross-pipeline behavior.
5. **Full suite** — `npm test`, only per §4.
6. **Build** — `npm run build` (includes the bundle budget) for bundle or precache changes;
   `npm run check:bundle` when only budgets moved.
7. **Browser** — `npx playwright test e2e/<spec>.spec.ts`, only per §6.

Tests must not reach the network. Stub `fetch` (see `src/lookup/webDictionary.test.ts`) and rely on
`fake-indexeddb` via `src/test/setup.ts`. Never weaken a test to make it pass — fix the code or report
the failure.

## 6. Browser E2E (Playwright)

Playwright is **not banned** and **not mandatory**. `playwright.config.ts` defines two projects —
`laptop` (1366×900) and `mobile-chromium` (Pixel 7) — with single-worker execution, a 120 s timeout, and
`channel: 'chrome'`. It starts a Vite dev server automatically, so it is heavy relative to Vitest.

Warranted when the change is genuinely browser-level:

- reader interaction, selection, highlights, notes, or lookup sheet behavior;
- browser persistence (IndexedDB via Dexie, service-worker cache);
- PDF canvas, text layer, or OCR queue behavior;
- layout, responsive, or theme/mobile interaction;
- focus, scroll, or panel behavior.

Not warranted for: dictionary or translation logic, normalization, provider fallbacks, storage
schema, doc-only edits, refactors, or anything already covered by a colocated Vitest suite.

When warranted, run the **narrowest** target and never the whole directory:

```bash
npx playwright test e2e/ui-interactions.spec.ts --project=laptop
npx playwright test e2e/pdf-mode-layout.spec.ts -g "reader chrome"
```

`npm run test:browser` (the full `playwright test` run) is reserved for release-level checks.
`e2e/vocabulary-handoff.spec.ts` is excluded by the default config and needs
`playwright.vocabulary.config.ts` plus the sibling English101 checkout; without it, that spec is
`BLOCKED`, not a failure.

## 7. Retry and failure discipline

- Allow at most **2–3 meaningful attempts** for the same verification problem.
- Every retry requires a concrete code change or a genuinely different valid execution method.
  A typo, wrong path, or misnamed filter may be corrected once or twice — that is normal.
- Never rerun an unchanged failing command, and never poll process or terminal state.
- Stop earlier when the error is clearly environmental: Execution Policy, permissions, sandbox,
  missing Chrome channel, launcher failure, or tool limits.

## 8. Environment and execution blocks

When verification is blocked by the environment, do **not**:

- change Execution Policy, security settings, or machine configuration;
- swap shells, runners, or launchers to route around the block;
- install unrelated global tooling to force a test to run;
- escalate to a heavier workflow (a full Playwright run) to bypass a restriction;
- create helper scripts or retry loops to circumvent the block;
- treat blocked execution as evidence that the product is broken.

Stop that path and report the exact gap so a human can close it.

## 9. Verification status vocabulary

| Status | Meaning |
| --- | --- |
| `PASS` | Ran and produced a confirmed passing result. |
| `FAIL` | Ran and produced a confirmed failing result. |
| `BLOCKED` | Could not run because of environment, policy, or tool restrictions. |
| `UNRESOLVED` | May have run, but the result cannot be confirmed reliably. |
| `NOT RUN` | Intentionally skipped as unnecessary or disproportionate. |

Never convert `BLOCKED`, `UNRESOLVED`, or `NOT RUN` into `PASS`. If shell integration cannot confirm
completion, report `UNRESOLVED` — do not assume either outcome.

## 10. Code changes based on evidence

- A `BLOCKED`, `UNRESOLVED`, or `NOT RUN` check is **not** a defect. Do not edit implementation to
  compensate for a test that never ran.
- Change code only on evidence of a real defect or a clearly justified requirement.
- If verification is blocked, finish the implementation if it can be done safely, then report.

## 11. Stop condition

When the implementation is complete and reasonable verification is done or appropriately blocked,
**stop**. Do not continue with:

- unrelated cleanup or drive-by refactors;
- speculative future-proofing;
- re-running already-passing checks without a concrete reason;
- heavier tests merely because they exist.

## 12. Final handoff

Keep it short and factual:

```text
Files changed:         <paths>
Implementation:        <what changed and why, 1–3 lines>
Architecture docs:     <updated, or "not required — no structural change">
Tests run:             <command — PASS|FAIL|BLOCKED|UNRESOLVED|NOT RUN>
Not verified:          <check + reason, if any>
External behavior:     <network/provider/Worker impact, or "none">
Out-of-scope findings: <unrelated issues noticed but not fixed>
```

Do not ask a follow-up agent to rescan the repository; point at the specific files listed above.
