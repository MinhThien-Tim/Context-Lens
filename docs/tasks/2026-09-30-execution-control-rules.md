# Task spec — Execution-control rules for request efficiency, edit recovery, and interruption

## TASK

Add six execution-control rules to the canonical agent policy set: request efficiency ≠ batch
everything, sequential read for control-flow files, narrow read before edit, tool-result
association, no-match recovery, and interruption-is-terminal (with pending-confirmation handling).

## FINDINGS

- `docs/agent-execution-rules.md` is the canonical policy owner; `AGENTS.md` is the short
  high-priority layer and outranks it by the precedence chain in both files.
- **§3 "Request and context efficiency"** (lines 68–120) is the declared canonical owner of
  request-efficiency rules. It currently states the core principle as *"Spend requests on new
  information, not on re-reading…"* and owns `### Core principle`, `### Rules for all roles`,
  `### Per-role application`. It already contains a **batching** bullet ("Batch independent reads
  and searches into a single call when the available tool supports batching") and a
  **narrow-read** bullet ("Do not re-read an unchanged file when the required evidence is already
  in hand. Read a range, not the whole file, when only one region is unknown."). The new rules must
  extend, not contradict, those two bullets — Rule 1 qualifies batching, Rule 3 generalizes narrow
  read to a pre-edit obligation.
- `docs/agent-execution-rules.md` §2 (lines 43–58) already carries a related navigation bullet:
  *"Do not re-read a large unchanged file when only one unknown region is needed; read the range."*
  Rule 3 overlaps §2 and should be stated once in §3 with a cross-reference from §2, not duplicated.
- **§11 "Stop condition"** (line 442) is the canonical stop rule for *agent* behavior
  ("When the implementation is complete … **stop**"). **§7 "Terminal Loop Guard"** (line 250) is
  explicitly scoped to *terminal/shell execution* — "The mandatory stop rule for terminal execution"
  — and its budget is per-command retry semantics. Interruption is a user signal, not a command
  failure, so §11 is the correct owner; §7 must not absorb it.
- No interruption / cancellation / user-stop rule exists anywhere in `docs/` (verified by grep
  across all agent docs). Rule 6 is a genuine gap.
- No edit-failure / no-match recovery rule exists anywhere in `docs/` (verified by grep). Rule 5 is
  a genuine gap.
- No tool-result-association rule exists. Rule 4 is a genuine gap.
- Anchor dependencies on `agent-execution-rules.md` are referenced from `AGENTS.md` (§4, §7, §8,
  `#terminal-loop-guard`, `#capability-and-security-boundary`), `docs/verification-map.md`,
  `docs/testing.md`, `docs/testing-troubleshooting.md`, `docs/ARCHITECTURE.md`,
  `docs/agent-roles/{planner,implementer,verifier}.md`, and one task file. **All existing anchors are
  `##`-level.** Therefore every new rule must be added as a `###` subsection under an existing
  numbered section — never as a new numbered `##` — so no anchor renumbers.
- Role files are deliberately thin: `docs/agent-roles/planner.md` §Compactness states repository-global
  rules live in `AGENTS.md` / `agent-execution-rules.md` and the handoff **references** them. The three
  role files already carry one pointer each to §3 (`planner.md:64`, `implementer.md:84`,
  `verifier.md:49`). New rules belong in the canonical doc; role files get pointers, not copies.
- `scripts/check_architecture_contracts.mjs` validates only `docs/verification-map.md` ↔
  `package.json` verify-script parity plus PWA/Worker/build-hook contracts. It does **not** read
  `AGENTS.md`, the role files, or `agent-execution-rules.md`. No code/test contract is affected by a
  docs-only change here.
- `AGENTS.md` is ~126 lines and is explicitly the *short* layer; §7 already carries a "no numeric
  request budget" paragraph. Rule 1 must not be turned into a numeric budget there.

## SCOPE

- Agent policy documents only: `AGENTS.md`, `docs/agent-execution-rules.md`, and the three
  `docs/agent-roles/*.md` files.
- Allowed change types: new `###` subsections, edits to existing bullets, and added cross-reference
  links inside these Markdown files.
- Allowed: prose clarification that resolves a contradiction the new rules would otherwise create
  with an existing bullet.

## RELEVANT FILES

| File | Why |
| --- | --- |
| `docs/agent-execution-rules.md` | Canonical owner. §3 gains the request/read/edit-recovery rules; §11 gains interruption-is-terminal. §2 and §7 need cross-reference lines only. |
| `AGENTS.md` | Higher precedence than the canonical doc. §6 (Stop instead of looping) and §7 (Minimize redundant requests) each need one short pointer, or the terminal-interruption rule sits below the layer agents read first. |
| `docs/agent-roles/planner.md` | Existing §3 pointer at line 64; extend so the Planner's read order and stop behavior reference the new rules. |
| `docs/agent-roles/implementer.md` | Existing §3 pointer at line 84; the role that performs edits — needs the narrow-read and no-match-recovery rules referenced. |
| `docs/agent-roles/verifier.md` | Existing §3 pointer at line 49; must be able to check the same rules against the diff. |

## PRESERVE / INVARIANTS

- The precedence chain text in `AGENTS.md` §Instruction precedence and `agent-execution-rules.md`
  §Precedence — unchanged.
- §3's existing core principle sentence and the "**No numeric request budget.**" paragraph — Rule 1
  must not introduce any cap, quota, or per-turn limit.
- §3's existing batching bullet — Rule 1 qualifies its scope; it does not delete or weaken batching
  of genuinely independent reads.
- §7 in full: Terminal Loop Guard, failure classification, launcher fallback, two-attempt budget,
  approval mechanics, reporting block. Rule 6 adds an override **on top of** §7, not a replacement.
- §4 change classes and §8 verification/reporting contracts — untouched.
- All existing `##`-level anchors in `agent-execution-rules.md` (§1–§8, §10–§12, plus
  `#terminal-loop-guard`, `#capability-and-security-boundary`) — their slugs and line targets must
  keep resolving.
- The `### Per-role application` table shape in §3.
- Documentation language: English, matching the surrounding prose of every file touched.

## OUT OF SCOPE

- Application source, tests, `package.json`, `scripts/**`, and any subsystem `verify:*` command.
- `docs/testing.md`, `docs/verification-map.md`, `docs/ARCHITECTURE.md`, `docs/task-template.md`, and
  `docs/testing-troubleshooting.md` — no command table, change class, or routing entry changes, so
  their existing references to §3/§4/§7/§8 stay valid untouched.
- `docs/archive/**`.
- Renumbering the missing `## 9.` gap in `docs/agent-execution-rules.md` (§8 is followed by §10).
  Pre-existing; report separately, do not fix here — renumbering would break every inbound anchor.
- Adding a machine-readable or enforced version of these rules (lint rule, hook, script). Docs only;
  enforcement is a separate task.

## IMPLEMENTATION DIRECTION

Write the rules as short, imperative, individually identifiable entries — a `###` subsection inside
§3 titled for execution-control, containing Rule 1–5, and a `###` subsection inside §11 containing
Rule 6. Each rule: one normative sentence, plus a short "not this" only where the wrong behavior is a
known observed failure (interruption continuation, no-match guessing). No restated rationale
paragraphs, no examples longer than two lines. Target ≈4–6 lines per rule.

Rule 1 — request efficiency is not batch everything. Qualify the existing §3 batching bullet: batch
only reads that are genuinely independent and equally needed; batching unrelated or not-yet-needed
reads trades a round trip for a mapping step and raises token cost.

Rule 2 — sequential read for control-flow files. Name the control-flow file set explicitly
(`AGENTS.md`, `docs/agent-execution-rules.md`, `docs/agent-roles/*.md`) and the reason (the agent must
resolve role/policy before acting on it). State the order role file → `AGENTS.md` relevant sections →
canonical policy sections → target files, and that this exception to batching applies to control-flow
files only.

Rule 3 — narrow read before edit. State the obligation (read the target's exact range before editing
it; section-level context is sufficient) and cross-reference §2's existing narrow-read bullet instead
of restating it in two places.

Rule 4 — tool-result association. Each result belongs to its call in submission order; never infer
reordering from content. On doubt: re-read the one file whose result looks wrong, once. Explicitly
forbid the alternating read/re-read loop.

Rule 5 — no-match recovery. A failed exact match means re-read the exact target text; never
reconstruct the search string from memory or retry whitespace/variant guesses.

Rule 6 — interruption is terminal, under §11. When the user stops, cancels, interrupts, or requests
handoff: terminate the current execution loop; no retry, no fresh approach, no resumption, no further
tool call, and no new terminal request. Add the pending-confirmation clause in the same subsection:
when a tool confirmation is pending at interruption, leave it untouched or cancel it — never resolve
it by issuing another command.

Cross-reference line in §7's "Official approval for a sandbox execution denial" subsection pointing
back to §11's interruption rule, so an approval request is never raised after an interruption.

Role files: extend the existing §3 pointer line in each of the three files to also name the new
subsections. One line each. No rule text copied into role files.

`AGENTS.md`: §6 gains a one-sentence interruption rule plus a pointer; §7 gains a one-sentence
pointer to §3's batching qualification. Both must stay short — `AGENTS.md` is the compressed layer.

No JSX, CSS, state, or data-flow change. No refactor.

## CHANGE CLASS / RISK

Documentation/policy-only. None of the four product change classes applies — no production file,
no config, no persisted contract. §4's documentation clause governs: document/link/diff checks only.

## VERIFICATION

- Stop point: the diff itself.
- Confirm every pre-existing `##`-level anchor string referenced from the repo still exists as a
  heading in `docs/agent-execution-rules.md` (`#terminal-loop-guard`,
  `#capability-and-security-boundary`, `#3-request-and-context-efficiency`,
  `#4-verification-proportionality`, `#6-browser-e2e-playwright`,
  `#7-execution--test-retry-policy`, `#8-verification-execution-and-reporting`,
  `#11-stop-condition`, `#12-final-handoff`). A missing slug is a `FAIL` and must be fixed in this
  task.
- Confirm every relative link added in this diff resolves to a file that exists.
- Confirm no numeric request/turn budget was introduced anywhere.
- `npm run verify:contracts` — `NOT RUN` is the expected and correct result: the script reads only
  `package.json`, `gateway/wrangler.jsonc`, and `docs/verification-map.md`, none of which change.
- No `typecheck`, no Vitest, no `verify:full`, no browser check.

## ACCEPTANCE CRITERIA

- A reviewer reading only `docs/agent-execution-rules.md` finds all six rules stated once, each
  identifiable by name, with no contradiction against §2, §3's existing bullets, §7, or §11.
- Interruption, stop, cancel, and handoff are all named in the terminal-interruption rule, and the
  pending-confirmation clause appears in the same rule.
- Rule 1 is compatible with — and visibly qualifies — §3's existing batching bullet; the "no numeric
  request budget" paragraph is unchanged.
- All existing anchors resolve after the change.
- `AGENTS.md` states interruption-is-terminal without duplicating the canonical text.
- Role files reference the new rules in one line each and contain no copied rule text.
- Diff touches only the five files in `RELEVANT FILES`.

## DOC IMPACT

Required — this task **is** the doc impact. `AGENTS.md`, `docs/agent-execution-rules.md`, and the
three role files are updated in this task. No domain architecture doc needs a change: no subsystem,
ownership boundary, control flow, data flow, persistence, or integration behavior is affected.

## OPEN QUESTIONS / RISKS

- **Approval-vs-interaction conflict (resolve in-task, do not defer).** §7 currently authorizes
  requesting one scoped approval for a sandbox denial. The new terminal-interruption rule must
  outrank it. The Implementer adds the back-reference in §7 rather than leaving the two rules to be
  read as co-equal.
- **Rule density risk.** `docs/agent-execution-rules.md` is already ~450 lines and AGENTS.md is
  ~126. If the six rules expand §3 past roughly 30 added lines, compress Rule 1 and Rule 3 to their
  normative sentence plus one qualifier, or fold Rule 3 into the existing §2 narrow-read bullet with
  a pointer from §3. Do not create a new top-level document.
- **`## 9.` numbering gap** in `docs/agent-execution-rules.md` is pre-existing and left untouched;
  report it in the final handoff as an out-of-scope finding.