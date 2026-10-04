# T0e — Reader behavior decisions U1–U8 + Reader Behavior Contract freeze

Date: 2026-10-04 · Role: Planner (decision + specification only; **no implementation**) · Status: decisions frozen, contract authored

Authority for this task: [`docs/agent-execution-rules.md`](../agent-execution-rules.md), [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md), [`docs/testing.md`](../testing.md), [`docs/verification-map.md`](../verification-map.md).
Companion deliverable: [`docs/reader-behavior-contract.md`](../reader-behavior-contract.md) — **the authoritative Reader Behavior Contract** produced by this task.

This record resolves the eight open decisions released by T0c/T0d and freezes the contract. Every label below is one of **FACT**, **MEASUREMENT**, **INTERPRETATION**, **DECISION**, **RECOMMENDATION**.

---

## 1. Preconditions (verified against audited HEAD)

| # | Check | Result | Label |
| --- | --- | --- | --- |
| P1 | Branch | `main` | **PASS** |
| P2 | HEAD | `ae39ef4` (`docs: carry the no-issue rule into the Investigator role`) | **PASS** |
| P3 | Working tree | `git status --porcelain` empty before this task | **PASS** |
| P4 | T0c evidence record present | [`2026-10-03-reader-overlay-feasibility-t0c.md`](./2026-10-03-reader-overlay-feasibility-t0c.md) | **PASS** |
| P5 | T0d evidence record present | [`2026-10-04-reader-ocr-more-audit-t0d.md`](./2026-10-04-reader-ocr-more-audit-t0d.md) | **PASS** |
| P6 | Approved T0b decision record present | [`2026-10-03-reader-experience-redesign-decision-record.md`](./2026-10-03-reader-experience-redesign-decision-record.md) | **PASS** |
| P7 | Repository still matches the T0d handoff | `git diff 6d189f0 HEAD -- src/ e2e/` → **empty**; the 5 changed files since T0d are docs-only (`AGENTS.md`, `docs/agent-execution-rules.md`, `docs/agent-roles/investigator.md`, `docs/tasks/…t0d.md`, `docs/testing-troubleshooting.md`) | **PASS** |

**Conclusion:** the repository matches the T0d handoff; no material divergence; execution proceeded. T0e modified no `src/`, `e2e/`, test, CSS, or runtime file (only `docs/`).

---

## 2. Decision summary

| ID | Question | Selected outcome |
| --- | --- | --- |
| U1 | A12 #10 load-state first-line coverage | **Option 1, CLARIFIED** — reconcile opening scroll to true content top. Lifecycle: `open → geometry reconciliation at scrollTop=0 → settle → optional saved-position restoration`; `scrollTop = 0` is the reconciliation **reference point**, not a guaranteed final position |
| U2 | OCR Next | **More/document-tools action meaning "run OCR on remaining unprocessed pages"**; retired as Header/L1, *not* retired as a capability |
| U3 | PDF zoom | **Direct Footer control (decrease / level / increase)** — Footer-attached, **no popup** |
| U4 | Chrome quiet escape hatch | **Reveal-only escape affordance anchored in the reserved Footer band + focus/screen-reader reveal**; Desktop has no quiet at all |
| U5 | "OCR active" | **`paused` is active/resumable**; four outcome classes defined by *state*, never by localized text |
| U6 | 6-page preload defect | **IMPLEMENTATION DEFECT — fix in the PDF/OCR controls phase**, one line; explicit window stays 12 |
| U7 | Reveal sensitivity | **Symmetric accumulated-travel hysteresis: quiet ≥ 32px down, reveal ≥ 32px up, plus content-top reveal; no single-event reveal** |
| U8 | OCR status ownership | **Two surfaces with strictly different responsibilities** — Footer = ambient run progress (active only); document tools = canonical status + controls |

---

## 3. U1 — A12 #10 load-state first-line coverage

**DECISION — CLARIFIED (2026-10-04): the load/position lifecycle.**

```text
open → geometry reconciliation at scrollTop=0 → settle → optional saved-position restoration
```

**The settled load state is `scrollTop = 0`. `scrollTop = 0` is the geometry reconciliation *reference point*, not a guarantee of the reader's final position.**

| Stage | Position | Purpose |
| --- | --- | --- |
| 1 · Open | `scrollTop = 0` | Reading surface established at true content top |
| 2 · Geometry reconciliation | `scrollTop = 0` | Overlay compensation measured against the true content top; **MUST NOT** scroll past the injected padding |
| 3 · Settle | `scrollTop = 0` | Layout and rendering settle; the initial viewport is treated as stable only from here |
| 4 · Saved-position restoration *(optional)* | restored position | Only now, and only if a saved position exists and restoration is applicable |

The four stages **MUST NOT** be reordered or conflated. Stage 2 **MUST** complete before stage 4 begins; restoration **MUST NOT** be applied to the unreconciled initial state and **MUST NOT** substitute for reconciliation. Saved-position restoration **MUST NOT** be conflated with the initial geometry-reconciliation state.

**Why `scrollTop = 0` is the geometry reconciliation reference point.** Overlay compensation is injected as static top padding inside the scroll container (contract §3.3), so the only position at which the compensated geometry can be evaluated against the true content top is `scrollTop = 0`. Reconciliation is meaningful nowhere else; the T0c measurement below is only valid at that reference point.

**Why saved-position restoration is intentionally later.** Restoration is a *user-intent* concern, not a geometry concern. Applying it to the unreconciled initial state would (a) measure compensation at the wrong position, (b) conflate an intentional restore with a layout-induced scroll change, and (c) make the first-line coverage invariant unverifiable, since a restored position can legitimately place content under the Header. Deferring it to stage 4 keeps geometry reconciliation independently observable.

**The resulting first-line coverage invariant.** After reconciliation and settlement at `scrollTop = 0`, the first readable content **MUST NOT** be covered by the overlaid Header. This is evaluated **at the settled `scrollTop = 0` state only** and is evaluated **separately** from any restored position. Where restoration occurs, its effect is expected saved-position movement and **MUST** be distinguishable from an unintended layout-induced scroll change (contract §13.4, A12-G10).

**This clarification does not reopen Overlay O.** O remains the chrome model; no reserved header strip is introduced, and reconciliation **MUST NOT** be achieved by adding permanent content space. Quiet/reveal remains visual-only and **MUST NOT** change content geometry, `scrollTop`, height tokens, or cause reflow (contract §13, A12-G1–A12-G3). U2–U8 are unchanged.

**MEASUREMENT (T0c §4).** In Overlay O with PDF chrome (`--reader-header-height: 108px`):

| Reference | Value | A12 #10 |
| --- | --- | --- |
| First readable line at true `scrollTop 0` | `firstLineTop = 121.8` vs `headerBottom = 88` | clear → PASS |
| Actual settled shell position | `scrollTop = 96` — exactly the injected `calc(header + 8px)` padding | `covered: true` → **FAIL** |
| First readable line at settled position | `25.796875px` below the viewport-box top | **FAIL** |

**INTERPRETATION.** The gap is not a layout defect; it is that load reconciliation scrolls *past* the padding it just injected. The first readable line is clear in the model and hidden in the reconciled-and-settled product state.

**RATIONALE (Option 1).**

- Overlay O is approved and is preserved here; Option 4 would discard approved architecture for a defect that has a local fix.
- A12 #10 must assert the state a reader actually observes. Option 3 (define #10 only at true `scrollTop 0`) would leave the real settled state untested — a coverage gap in the product requirement, not an acceptable narrowing.
- Option 2 (grow static padding until the settled position clears) requires padding ≥ `121.8px` for the PDF header, permanently indenting the first line of **every** document by roughly 120px to solve a 96px reconciliation overshoot. That is a presentation regression traded for a one-line logic fix, and it is exactly the reserved-strip workaround this clarification forbids.
- Option 1 makes `scrollTop = 0` the canonical reconciliation reference, which keeps page/location identity stable through reconciliation and settlement (page 1 is page 1 before and after) and keeps A12 #10 meaningful at the real product state.

**CONSEQUENCES.**

- Geometry reconciliation **MUST** occur at `scrollTop = 0` on mobile and desktop, including when static top padding is injected, and **MUST** complete before any saved-position restoration.
- Opening a document **MUST NOT** change page identity or reported location during stages 1–3: the reconciled state is the reference location for persistence.
- Reconciliation **MUST NOT** reflow after settle (contract §13, invariants A12-G1–A12-G3).
- A reader with an applicable saved position **MUST** be restored to it after settlement; the settled reader is **not** required to remain at `scrollTop = 0`.
- Test obligation: verify the lifecycle as ordered observable stages (contract §13.4) — open, reconcile at `scrollTop = 0`, settle, first readable content clear, and — only when a saved position exists — restoration afterwards, evaluated separately from the `scrollTop = 0` invariant — at every viewport in the §15 matrix.

**REJECTED.** Option 2 (padding growth → permanent top indent, and still load-order dependent); Option 3 (defines the contract only for a state the product does not settle in); Option 4 (abandons approved Overlay O for a non-structural defect).

---

## 4. U2 — OCR Next

**DECISION.** OCR Next is **retired as a Header/L1 action** and **adopted as a document-tools action inside More**, whose meaning is: *run OCR on every remaining unprocessed page, continuing in 12-page windows until the document is exhausted.* It is never an L1 action, never a Header action, and never a "next window" advance.

**FACT.** Two entry points exist for the same call: the Header `primaryActions` button `aria-label="OCR next"` (`../../src/app/App.tsx:594`, live) and the document-tools action `../../src/reader/pdf/PdfModeSwitch.tsx:48` (`showNext={false}` at `../../src/app/App.tsx:595`, rendered but suppressed). Automatic continuation is real: `../../src/reader/pdf/usePdfOcrQueue.ts:85-88` advances 12-page windows until exhaustion.

**INTERPRETATION.** Because continuation is automatic, "OCR next" is not a per-window advance — that capability does not exist. Three residual jobs survive automatic continuation, and each is a *start/restart/recover* job, never an *advance* job: (a) starting a run after preload has not promoted to a run, (b) restarting from the current page after a cancel, (c) recovering after an error.

**RATIONALE.**

- T0b locks Header ownership to Back, document title, and Original/Reading; keeping OCR Next in Header would reinstate a secondary L1 Reader action.
- Retiring the capability outright (the second option) would leave jobs (a), (b), (c) with no entry point, because preload is not itself a run — it only prepares candidates. Retiring it is therefore a silent removal, not a simplification.
- A capability-named, count-free action ("run OCR on remaining pages") survives the 12-page window change and does not encode the obsolete 3/6-page vocabulary.

**CONSEQUENCES.**

- The Header `primaryActions` OCR entry and its unit-test coverage are deleted in the PDF/OCR controls phase.
- The document-tools action label becomes count-free; its enable/disable rule must be derived from queue state, never from a localized message (see contract §12, U5/U8).
- The action must not appear anywhere else — More is its only owner.

**REJECTED.** Keeping OCR Next in Header/L1 (violates approved Header ownership); retiring the capability (removes the only start/restart/recover entry point; silent behavior change); leaving it duplicated in Header and document tools (duplicate Reader controls).

---

## 5. U3 — PDF zoom

**DECISION.** PDF zoom stays **Footer-attached as a direct control** — decrease, level readout, increase — and the PDF zoom popup is deleted. Zoom is **not** moved into More and is **not** a Footer popup.

**FACT.** A third popup layer exists: `../../src/reader/pdf/PdfViewer.tsx:139-140` renders `.pdf-more` (`aria-label="PDF options"`) and portals it into the Footer's `.pdf-mobile-zoom-host` on mobile; `../../src/reader/ReaderShell.tsx` lists `.pdf-more-menu` among its chrome-blocking overlays. It is a separate popup system with no approved home. T0b requires the Footer to retain PDF zoom; T0d moves Click out of the Footer into More.

**RATIONALE.**

- "Remain a Footer-attached zoom control" and "become another direct Footer control" are only compatible if the attached control is not a popup: the retained popup *is* the unapproved second popup architecture the brief forbids.
- More must remain "exactly one conceptual More disclosure". A Footer popover would make two popup architectures in one Footer and would also force the More sheet/popover and the zoom popover to arbitrate focus and dismissal separately.
- A direct stepper is operable at 320px with no nested menu, needs no dismissal protocol, and is fully keyboard- and screen-reader-navigable without a popup role.

**CONSEQUENCES.**

- `.pdf-more`, `.pdf-more-menu`, `.pdf-mobile-zoom-host` and their Chrome-blocking registration are removed in the PDF/OCR controls phase.
- Footer gains three zoom affordances; More gains none. Zoom must not be reachable from both surfaces.
- Zoom levels must be operable and labeled at 320px with the same hit-target rule as other Footer controls; zoom must not clip, wrap, or push Footer controls out of reach. **Risk, stated explicitly:** a 3-control stepper competes with progress, location, percentage and the More trigger at 320px. If the MobileChrome phase cannot fit it at 320px, that phase must **escalate** — it may not introduce a Footer popup, move zoom into More, or quietly drop the Footer zoom requirement.
- Zoom changes are an input class that must never quiet or reveal chrome (§5 of the contract).

**REJECTED.** Keeping the Footer-attached popup (an unapproved second popup architecture); moving zoom into More (breaks the approved requirement that the Footer retains zoom and duplicates an owned surface); a second More-like disclosure anywhere else.

---

## 6. U4 — Chrome quiet escape hatch

**DECISION.** Three sanctioned, non-toggle mechanisms, and no others:

1. **Reveal-only escape affordance (touch, mouse).** While chrome is quiet on Mobile Chrome, a dedicated, always-rendered, always-labeled **reveal-only control** is present, anchored inside the **reserved Footer band** (bottom-leading edge, inside the safe area). Activating it reveals chrome. It can **never quiet** chrome. It is not a FAB, is not a menu, opens no popup, and changes no geometry.
2. **Focus entry (keyboard, screen reader, switch access).** Focus entering chrome — the escape affordance or any Header/Footer control — reveals chrome and keeps it revealed while focus remains inside chrome. Leaving chrome by focus-out returns to the pre-focus quiet state unless upward travel occurred. Focus capture on the reading surface does **not** reveal chrome; only focus entering chrome itself does.
3. **No other sanctioned escape.** Specifically **not**: tap anywhere on the reading surface, tap-to-toggle, double-tap, long-press, edge swipe, and **not** browser/hardware Back (§11 forbids a "Back reveals chrome" tier).

**FACT.** Quiet is mobile-only in the audited code: the quiet transition is gated on `!desktop` (`../../src/reader/ReaderShell.tsx`). Therefore **Desktop Chrome (≥1024px) has no quiet state and needs no escape hatch.** The defect is Mobile-only.

**FACT.** The audited code already carries a `.reader-reveal` button (`aria-label="Show reading controls"`, visible text `Aa ···`) rendered only while quiet, plus an `onFocusCapture` reveal on the shell root.

**INTERPRETATION.** T0d classifies `.reader-reveal` as obsolete because a tap that reveals chrome violates the approved rule "tap never toggles chrome", and T0d explicitly left the gap it creates unresolved: upward real scroll is the only reveal trigger, so a user who quieted chrome with downward travel and then needs the controls has no sanctioned path. The two findings are not separable — deleting the control without specifying a replacement leaves the product with no escape.

**RATIONALE.**

- The gap is real and is a **discoverability/operability** failure, not a cosmetic one: without it, a touch-only reader can reach chrome only by scrolling up, which is unavailable to a reader who has settled and stops.
- A **reveal-only** control is not tap-to-toggle. Quiet has exactly one cause — accumulated downward real-scroll travel (contract §6, U7). No activation of the affordance, and no keyboard interaction, can enter quiet. Tap-to-toggle is therefore structurally impossible, which is the specific behavior T0b locked.
- A persistent, labeled, focusable control is the only mechanism that satisfies all five input classes at once: touch and mouse (activation), keyboard and screen reader (focus entry, reachable by traversal), and hardware Back (correctly unused, since Back is a navigation resolver, not a chrome affordance).
- Anchoring it in the reserved Footer band reuses space the approved chrome model already reserves, so it costs no reading-viewport geometry and adds no reserved strip. Keeping it visible while quiet is what makes it discoverable; a control that hides with the chrome cannot be the escape.

**CONSEQUENCES.**

- This is the **one explicit change to the approved "tap never toggles chrome" rule**: a tap on a dedicated, labeled, persistent control reveals chrome. A tap anywhere else — reading surface, text, handles, selection — must never change chrome state in either direction.
- The affordance must be present whenever chrome is quiet and absent (or not actionable) whenever chrome is visible, must have an accessible name, a ≥44px hit target at ≤1023px, and must not be styled as a floating action button.
- `onFocusCapture` un-quieting on *any* focus inside the shell is too coarse for the frozen model: the contract scopes reveal to focus entering **chrome**.
- U4 changes nothing about the reveal threshold; that is U7.

**REJECTED.** Tap-to-toggle on the reading surface (reintroduces the forbidden implicit toggle; unpredictable while selecting text); upward scroll as the only escape (leaves the settled-user gap open); edge/back-swipe (collides with OS back gestures); auto-reveal on idle (reveals chrome exactly while the user reads, defeating quiet); Back-as-escape (contradicts the Back contract).

---

## 7. U5 — "OCR active" definition

**DECISION.** `paused` **is** active. "OCR active" is the union of the queue states `preparing | running | paused`, and the contract recognizes **four outcome classes** below. All predicates are expressed over **state**, never over localized message text.

| Class | States | Observable meaning | Run controls | Status surface |
| --- | --- | --- | --- | --- |
| **Active / resumable** | `preparing`, `running`, `paused` | A run exists and can continue or resume | Start-remaining, Pause/Resume, Cancel | Footer progress **and** document-tools status |
| **Terminal success** | run completed with no error and nothing remains to process (today only the "nothing left" case sets `done`) | OCR finished; no further work | Start-remaining disabled | Document-tools status only |
| **Terminal error** | `error` | The run stopped on a failure | Start-remaining (retry) enabled, results preserved or cleared per the run | Document-tools status only |
| **Cancelled / cleared** | run cancelled, or OCR results cleared | No run; queued work discarded | Start-remaining enabled | **No status surface at all** |

**FACT.** The Footer gate already treats `paused` as active: `['preparing','running','paused'].includes(state) ? status : null` (`../../src/app/App.tsx:589`).

**FACT.** Five states exist (`preparing | running | paused | done | error`, `../../src/reader/pdf/usePdfOcrQueue.ts:9`). `done` is set **only** for the nothing-left case; a successful run otherwise ends in `null` (`usePdfOcrQueue.ts:116`). `cancel()` clears status to `null`. Two string-coupled predicates compare the localized message (`../../src/app/App.tsx:594`, `../../src/reader/pdf/PdfModeSwitch.tsx:32`).

**RATIONALE.**

- `paused` is the one state where a run exists but is not progressing. Treating it as inactive would blank the progress indicator and the status while the user still owns an in-flight job — the indicator would flicker off at exactly the moment the user paused it.
- Terminal success must be a state, not a message match. Under the audited code a successful non-empty run ends in `null`, so "success" is currently indistinguishable from "idle" and a successful run reports nothing at all. The contract therefore requires the run to end in an explicit terminal-success state, and forbids deriving that state from text.

**CONSEQUENCES.**

- The queue must expose terminal success as a state; the "nothing left" wording must not be load-bearing for enablement, status, or tests.
- A copy change to any OCR message must not change which actions are enabled, which status surfaces exist, or which tests pass.

**REJECTED.** Excluding `paused` (hides live progress during an owned run); keeping the message-coupled predicates (copy becomes behavior — the defect T0d recorded); defining the contract only through localized status text (explicitly forbidden by the task).

---

## 8. U6 — 6-page preload defect

**DECISION — disposition only: this is an IMPLEMENTATION DEFECT, fixed in the PDF/OCR controls phase. T0e does not implement it.** The explicit OCR window remains **12 pages**; auto-preload must select the **first 12 candidate pages**, not the hard-coded 6.

**FACT.** `preloadFirstTwelve` iterates `1..min(12, pageCount)` but breaks at `if (pending.length >= 6) break;` (`../../src/reader/pdf/usePdfOcrQueue.ts:78`) and never references `OCR_AUTO_BATCH_SIZE = 12` (`usePdfOcrQueue.ts:11`). The caller gates on `pdfPages.slice(0, 12)` (`../../src/app/App.tsx:138-141`).

**MEASUREMENT.** `../../src/reader/pdf/usePdfOcrQueue.test.tsx:52-57` asserts `[1,2,3,4,5,6]` and **passes**; the file is 14/14 green. The defect is invisible to CI because the test pins it.

**RATIONALE.**

- The function name, the constant, the caller gate and the explicit-OCR copy all say 12; only one comparison says 6. There is no product reading in which the first preload batch is half the advertised window.
- The defect is a correctness defect in OCR coverage, not a taste question, so deferring it beyond the OCR-controls phase would ship the OCR lifecycle wrong twice.

**CONSEQUENCES.**

- PDF/OCR controls phase: `usePdfOcrQueue.ts:78` becomes `OCR_AUTO_BATCH_SIZE`; the unit test's name and expectation migrate from 6 to 12; `docs/reader.md`'s "at most 6" preload description becomes obsolete (§11.1, O7).
- **Cost guardrails:** OCR runs on-device (`../../src/reader/pdf/PdfModeSwitch.tsx` diagnostic: "OCR chạy trên thiết bị"), so widening preload 6 → 12 increases local compute only. It introduces **no upstream request, no quota reservation and no Worker API call**, so it does not require a proposal under [`COST & QUOTA GUARDRAILS.md`](../../COST%20&%20QUOTA%20GUARDRAILS.md). Preload must remain local-only.
- The obsolete 3/6-page labels and tests migrate in the same phase (§11.1, O8; §11.3 PDF/OCR controls).

**REJECTED.** Fixing it in T0e (explicitly out of scope); leaving it unfixed (ships wrong OCR coverage); changing the window to 6 to match the bug (the advertised and explicit-OCR window is 12).

---

## 9. U7 — Reveal sensitivity

**DECISION.** Quiet and reveal become **symmetric accumulated-travel thresholds in opposite directions**, sharing one constant, with content-top reveal as the second trigger. **A single-event delta of any size never reveals.**

| Rule | Semantics | Value |
| --- | --- | --- |
| Quiet | accumulated **downward** real-scroll travel | `≥ 32px` (unchanged) |
| Reveal | accumulated **upward** real-scroll travel | `≥ 32px` |
| Reveal (top of content) | reading viewport at content top | `top ≤ 40px` |
| Reveal (accessibility) | focus entering chrome | any (U4) |
| Reveal (explicit) | escape affordance activated | any (U4) |

Accumulator semantics: accumulate `|delta|` in the current direction; **any** delta in the opposite direction resets the accumulator to 0 before the new travel is added. A quiet/reveal state change is driven only by the accumulated total, never by one event's magnitude.

**MEASUREMENT (T0c §3, audited code `ReaderShell.tsx`).** Quiet already requires accumulated downward travel > 32px (`QUIET_TRAVEL = 32`, line 10). Reveal is a **single-event** upward test `delta < -8` (≈line 68), and `travel` resets to 0 on any upward delta. Observed: Down +10 → no quiet; +20 → no quiet; +30 (cumulative 60) → quiet; Up −4, −6, −8 → still quiet; Up −10 → **revealed**.

**INTERPRETATION.** The effective reveal threshold is ≈10px of single-event upward travel, and that threshold sits **below** the ~12–16px band T0c recorded as ordinary trackpad flick noise — so an incidental upward correction reveals chrome. The asymmetry is also unprincipled: quiet is a deliberate 32px commitment, reveal is an accidental 10px twitch.

**RATIONALE.**

- The value is **32px because it is the constant already governing quiet**, not because −24px was recommended earlier. That gives one named constant, symmetric semantics, and a threshold comfortably above the measured noise band — and it satisfies the requirement not to adopt −24px merely because it was suggested.
- Requiring *accumulated* travel removes the entire false-reveal class that a single-event test cannot distinguish from a flick: a −8px jitter never reveals at any speed.
- 32px of upward travel is roughly one deliberate scroll gesture, so reveal stays responsive for a user who deliberately scrolls up, while the settled user has U4's affordance instead of depending on scroll speed.
- Content-top reveal is preserved because it is semantically necessary, not a threshold compromise: at the top of the document there is no upward travel left to generate.

**CONSEQUENCES.**

- The single-event `delta < -8` reveal test is replaced by the accumulated rule; the change happens in the ChromeFoundation phase, not in T0e.
- Reveal thresholds are contract values with observable consequences and must be asserted in tests; their implementation location is not.
- Programmatic scroll, page jumps, zoom and mode changes never contribute travel (§5, input semantics).

**REJECTED.** Keeping `−8` single-event (measured false-reveal); adopting −24px by inheritance from a prior recommendation (no measurement supports it, and the brief forbids inheriting it); symmetric 8px/8px (puts quiet below the noise band too); distance-based (top-of-document) reveal alone (does not exist yet and would not cover mid-document reveal).

---

## 10. U8 — OCR status ownership

**DECISION — two surfaces with strictly different responsibilities.** There is no third host and no strip.

| Surface | Responsibility | Present when | Carries controls? |
| --- | --- | --- | --- |
| **Footer — ambient run progress** | completed/total progress of the run | **Only while a run is active** (`preparing`, `running`, `paused`) | **No.** Not clickable, not a trigger, not a navigation element |
| **More → document tools — canonical status + controls** | Full status message, outcome, and all run actions (start remaining, pause/resume, cancel, clear) | Whenever the user opens document tools; the **only** surface where status survives beyond the active run (terminal success, terminal error) | Yes |
| **Everything else** | — | Never | — |

**FACT.** Exactly two live hosts exist and both are transient: Footer `.reader-ocr-status` (`role="progressbar"`, `aria-label="OCR progress"`, text `OCR {completed}/{total}`; `../../src/reader/ReaderProgress.tsx:9`) and a `<p role="status">` inside document tools (`../../src/reader/pdf/PdfModeSwitch.tsx:49-58`). The dead `.pdf-queue-status` DOM was deleted in `0a6c1ea` while its CSS survives (T0d Finding A); 17 e2e assertions still target it, 11 of them passing vacuously.

**RATIONALE.**

- Merging into one surface was rejected: the Footer surface exists precisely so a run in progress is visible **without the user opening anything**, and the document-tools surface exists precisely so outcome and controls have a home after the run ends. One surface cannot do both — a Footer that carries controls becomes a permanent control/navigation element (forbidden), and a document-tools-only surface hides progress from users who never open More.
- Keeping them as-is with overlapping roles was rejected: today both render a status string derived from the same queue state, and the Footer copy is not a strict subset of the document-tools copy, so the two can disagree.
- The split makes the required rule unambiguous: **"OCR status is always visible only while a run is active"** applies to the Footer surface, and **document tools is the only surface where OCR status may outlive the active run.** Header never shows OCR status. No surface shows it while no run exists and no terminal outcome is pending.

**CONSEQUENCES.**

- `.pdf-queue-status` CSS is deleted and its 11 vacuous assertions are removed in the Cleanup phase; the 6 text assertions are rewritten against the canonical surface.
- Footer OCR status is `aria-hidden`-equivalent to a live progressbar only while active; when the run is not active the element must not exist, so assistive technology does not announce stale progress.
- Both surfaces derive their content from queue state. Neither may parse a localized message.

**REJECTED.** Merge to one canonical surface (loses ambient progress or makes the Footer a control surface); leaving the two surfaces with overlapping roles (they can disagree); keeping `.pdf-queue-status` as a third strip (explicitly forbidden — it is a permanent navigation-shaped strip of dead CSS with no owning semantics).

---

## 11. Contract freeze + mapping

The new contract is [`docs/reader-behavior-contract.md`](../reader-behavior-contract.md). It is the **authoritative source** for all Reader behavior in the redesign and supersedes the obsolete rules in §11.2.

### 11.1 Mapping

**APPROVED / FROZEN** (carried forward unchanged; binding on every phase)

| ID | Item | Source |
| --- | --- | --- |
| F1 | Overlay O chrome model; Header overlays the reading surface; static top padding inside the scroll container; Footer band reserved | T0b, T0c |
| F2 | `≤1023px` = Mobile Chrome, `≥1024px` = Desktop Chrome, **no tablet variant**, `useDesktop()` is the sole semantic responsive authority | T0b |
| F3 | Header owns only Back, document title, Original/Reading (PDF) | T0b |
| F4 | Footer owns reading progress, location, retained percentage, PDF zoom, More trigger, and active-run OCR progress only | T0b + U3/U8 |
| F5 | Exactly one conceptual More disclosure: bottom sheet `≤1023px`, popover `≥1024px` | T0b + T0d |
| F6 | One Back resolver; priority begins with active overlay/surface, then leave document; **no "Back reveals chrome" tier** | T0b |
| F7 | Simple and Advanced are disclosure modes of one Reader architecture/state model | T0b |
| F8 | Original ⇄ Reading is one PDF presentation control; presentation-only | T0b |
| F9 | No Reader FAB, no Reader Search, no Form Fill | T0b, T0d |
| F10 | A12 true-geometry invariants (viewport top/height stable, quiet/reveal does not alter geometry, Lookup open/close does not alter the viewport box, page/location identity stable) | T0c (12/12 PASS) |
| F11 | No Reader scroll-observer feedback loop | `docs/reader.md` invariant 7 |
| F12 | Local/static first, cache before network, Worker API deny-by-default, safe degradation, no hidden cost | [`COST & QUOTA GUARDRAILS.md`](../../COST%20&%20QUOTA%20GUARDRAILS.md) |

**IMPLEMENTATION DEFECT** (fix in the named phase; not design changes)

| ID | Defect | Evidence | Owner phase |
| --- | --- | --- | --- |
| D1 | Auto-preload breaks at 6 instead of 12; test pins the defect | `usePdfOcrQueue.ts:78`, `usePdfOcrQueue.test.tsx:52-57` | PDF/OCR controls (U6) |
| D2 | Single-event `delta < -8` reveal; asymmetric to quiet | `ReaderShell.tsx` ≈68 | ChromeFoundation (U7) |
| D3 | OCR `done` means only "nothing left"; a successful non-empty run ends in `null` | `usePdfOcrQueue.ts:116` | PDF/OCR controls (U5) |
| D4 | Two string-coupled `done` predicates parse a localized message | `App.tsx:594`, `PdfModeSwitch.tsx:32` | PDF/OCR controls (U5/U8) |
| D5 | `768–1023px` is styled by neither stylesheet (`max-width: 767px` vs `≥1024px`) | `styles.mobile-reader.css:2,274`, `styles.desktop-reader.css:2`, T0b D1 | MobileChrome |
| D6 | More/document-tools sheets have no width cap for `768–1023px` | `reader-layout.css:102,106` | MobileChrome |
| D7 | Dead `.pdf-queue-status` CSS; 17 e2e assertions, 11 vacuous | T0d Finding A | Cleanup |
| D8 | Untracked `ReaderFab.tsx` has no `desktop` guard, all CSS inside the `767px` block, and its own `pushState`/`popstate` (a competing Back tier-2 owner) | T0b D2 | Cleanup |
| D9 | Reader Search is a hard no-op (`onClick={() => {}}` + `disabled`) | T0b Decision 6 | Cleanup |
| D10 | Dead `min-width:768px` block keyed on `:has(.pdf-queue-status)` and `calc(100dvh - 110px)` | `styles.reader-base.css:248` | Cleanup |
| D11 | `onFocusCapture` un-quiets on **any** focus inside the shell, not focus entering chrome | `ReaderShell.tsx` ≈90 | ChromeFoundation (U4) |
| D12 | Zoom popup (`.pdf-more`/`.pdf-more-menu`/`.pdf-mobile-zoom-host`) is an unapproved second popup layer | `PdfViewer.tsx:139-140` | PDF/OCR controls (U3) |

**DEFERRED** (deliberately not decided in T0e; must not be guessed during implementation)

| ID | Item | Why deferred | Must be settled by |
| --- | --- | --- | --- |
| G1 | Exact Footer layout at 320px with the 3-control zoom stepper | Requires the ChromeFoundation + MobileChrome result to be observed; U3 states the obligation, not the layout | MobileChrome (escalation path defined in U3) |
| G2 | Whether `Terminal success` is one state or success is signalled by absence of error + exhaustion | Contract fixes the *observable* requirement; the state shape is an implementation choice | PDF/OCR controls |
| G3 | Screen-reader announcement wording and politeness level for OCR transitions | Announcement *obligation* is fixed; exact phrasing is copy | PDF/OCR controls |
| G4 | History ownership details for Back (`pushState` vs `popstate` vs `navigate`) | Not established by T0b/T0c/T0d evidence; the brief forbids inventing them | Lookup/Overlay |
| G5 | Which of the two More entry points (Footer trigger only vs Footer + reader-reveal) hosts discovery affordances | Depends on the 320px Footer result | MobileChrome |

**OBSOLETE OLD SPEC / OLD RULE** (deleted during implementation; must not be preserved for compatibility)

| ID | Obsolete item | Replacement |
| --- | --- | --- |
| O1 | Header secondary actions: Contents, Markup, Context panel, Reading appearance (`Aa`) | Contract §7 (Header) + §9 (More inventory) |
| O2 | Header/L1 "OCR next" | U2 → document tools "run OCR on remaining pages" |
| O3 | Reader FAB (`ReaderFab.tsx`) | F9 — no FAB |
| O4 | Reader Search | F9 |
| O5 | Form fill / Form Fill | F9 — dropped |
| O6 | `.pdf-queue-status` strip (DOM, CSS, 17 assertions) | U8 — Footer progress (active only) + document-tools status |
| O7 | `docs/reader.md` "at most 6" pages preload description | U6 — first 12 candidates |
| O8 | 3/6-page OCR vocabulary in copy and tests (9 rewrite targets, incl. `ReaderShell.test.tsx:96` `'next 6'`, `e2e/pdf-mode-layout.spec.ts:51` `/OCR.*6/`, five `'OCR 3/6 trang'` / `'Không có trang scan cần OCR'` targets) | U2/U6 — count-free copy, 12-page window |
| O9 | Obsolete 768 semantic Reader breakpoint | F2 — 1024px sole authority; delete `styles.reader-base.css:248` |
| O10 | Zoom popup layer and its chrome-blocking registration | U3 — Footer direct stepper |
| O11 | Tap-to-toggle chrome / `.reader-reveal` in its audited form | U4 — reveal-only affordance + focus reveal |
| O12 | Phase ordering or behavior asserted by any superseded Mobile Reader/Home redesign document | This contract + [`docs/reader-behavior-contract.md`](../reader-behavior-contract.md) |

### 11.2 Specifications replaced by the new contract

The new contract replaces **all Reader behavior specification** in:

1. [`2026-10-03-reader-experience-redesign-decision-record.md`](./2026-10-03-reader-experience-redesign-decision-record.md) — T0b. Its Reader **behavior** sections (Header/Footer tables, Back tiers, More presentation) are superseded; its **evidence, locked-authority list and defect list D1–D6** remain valid history.
2. [`2026-10-03-reader-overlay-feasibility-t0c.md`](./2026-10-03-reader-overlay-feasibility-t0c.md) — T0c. Its **measurements and A12 results** remain authoritative; its **open Blocker (a) options** are resolved by U1 and its single-event reveal observation is superseded by U7.
3. [`2026-10-04-reader-ocr-more-audit-t0d.md`](./2026-10-04-reader-ocr-more-audit-t0d.md) — T0d. Its **findings and inventories** remain valid; its **§9 open decisions** are resolved here.
4. [`2026-09-30-quiet-mobile-reading-chrome.md`](./2026-09-30-quiet-mobile-reading-chrome.md), [`2026-10-01-advanced-ui-redesign.md`](./2026-10-01-advanced-ui-redesign.md), [`2026-09-29-reader-stabilization-closure.md`](./2026-09-29-reader-stabilization-closure.md), [`2026-10-02-mobile-pdf-transparent-chrome-investigation.md`](./2026-10-02-mobile-pdf-transparent-chrome-investigation.md), [`2026-10-02-mobile-layout-shift-investigation.md`](./2026-10-02-mobile-layout-shift-investigation.md) — historical evidence; **not** an authority for phase ordering or behavior.
5. [`docs/reader.md`](../reader.md) — remains the Reader **architecture** doc (module map, invariants), but all Reader **behavior** specification is taken from the new contract; its OCR preload description becomes obsolete (O7).

### 11.3 Migration map by phase

| Phase | Old Reader rules/specs replaced or deleted there |
| --- | --- |
| **ChromeFoundation** | O11 (`.reader-reveal` in its audited form), D2 (single-event `−8` reveal), D11 (`onFocusCapture` scope) |
| **MobileChrome** | O1 (Header secondary actions — only those not already removed), D5 (`768–1023` unstyled band), D6 (width caps), plus re-measurement of the More sheet/popover at 320px |
| **Responsive/Geometry** | O9 (768 semantic breakpoint — the dead `styles.reader-base.css:248` block is deleted, not re-targeted); F10 invariants become the acceptance gate |
| **Lookup/Overlay** | O6 only insofar as Lookup's overlay contributes to chrome blocking; no OCR status content is inherited; G4 settled here |
| **PDF/OCR controls** | O2, O7, O8, O10; D1, D3, D4, D12; O5 if any Form-fill residue survives there |
| **Home** | O3 (FAB, if it is reachable from home composition), O4 (Reader Search), O5 (Form Fill); no Reader chrome behavior is defined by Home |
| **Cleanup** | O6 (dead `.pdf-queue-status` CSS + 17 assertions), D7, D8, D9, D10; plus every remaining 3/6-page string target not covered by the OCR phase |

---

## 12. Phase handoffs (required inputs + contract obligations only)

No implementation is prescribed below. Each phase lists what it must consume and what it must satisfy.

### 12.1 ChromeFoundation

- **Inputs:** contract §4 (chrome model), §5 (input semantics), §6 (reveal trigger and thresholds); T0c §3 measurements; F1, F11.
- **Obligations:** quiet/reveal are **visual-only** and alter no content height, `scrollTop`, location, page identity or layout geometry (G1–G3); reveal follows the accumulated-travel rule with content-top and focus/affordance triggers; quiet remains mobile-only; focus capture reveals only on focus entering chrome; no `.reader-reveal` toggle semantics.
- **Verification:** `npm run verify:reader`; geometry assertions are visual-only, so no A12 escalation.

### 12.2 MobileChrome

- **Inputs:** §4, §7 (Header), §8 (Footer), §9 (More); U3, U4; D5, D6; G1, G5.
- **Obligations:** `≤1023px` = Mobile Chrome; the `768–1023px` band is styled; More is a bottom sheet with a width cap and full actions at 320px; Header shows Back/title/Original-Reading only; Footer's 3-control zoom stepper plus progress/location/percentage/More trigger are reachable at 320px (else **escalate**, do not add a popup); escape affordance present and labeled while quiet.
- **Verification:** `npm run verify:ui` (runs `check:css` first) + targeted Reader e2e at 320/390/767/768/1023.

### 12.3 Responsive/Geometry

- **Inputs:** F2, F10; T0c §4/§5; U1.
- **Obligations:** 1024px is the sole semantic authority; the dead 768 block is deleted; the §5.0 load lifecycle (contract §5.0) is honored — open, geometry reconciliation at `scrollTop = 0`, settle, then optional saved-position restoration (contract §13.4); A12's true-geometry invariants pass at the full viewport matrix; the viewport matrix is extended with the landscape sizes already proven (844×390, 915×412).
- **Verification:** Reader A12 tier on `--project=laptop`; `npm run check:css`.

### 12.4 Lookup/Overlay

- **Inputs:** F6, F10 (Lookup open/close does not alter the viewport box); G4.
- **Obligations:** Lookup participates in chrome blocking and in the Back resolver as an active overlay; Back uses one resolver with no "reveals chrome" tier; history ownership is settled (G4) before implementation.
- **Verification:** `npm run verify:lookup` (runs `check:css` first).

### 12.5 PDF/OCR controls

- **Inputs:** U2, U3, U5, U6, U8; §8, §10, §12 of the contract; D1, D3, D4, D12; O2, O7, O8, O10; G2, G3.
- **Obligations:** 12-page explicit window; first-12-candidate preload (local-only, no upstream request); pause/resume/cancel/success/error/no-work lifecycle with `paused` active; two strictly-scoped status surfaces with state-derived (never text-derived) content; no `.pdf-queue-status`; count-free OCR copy; zoom is a Footer stepper with no popup; document tools owns every OCR action and no OCR action exists elsewhere.
- **Verification:** `npm run verify:pdf` (Reader OCR unit tests) + `npm run verify:ui` if the Footer changes.

### 12.6 Home

- **Inputs:** F7, F9; O3, O4, O5; D8, D9.
- **Obligations:** no FAB, no Reader Search, no Form Fill; Simple/Advanced remain disclosure modes of one Reader state model; Home defines no Reader chrome behavior.
- **Verification:** `npm run verify:ui`.

### 12.7 Cleanup

- **Inputs:** O6, O10, O11 remnants, D7, D10; §15 test obligations.
- **Obligations:** delete dead `.pdf-queue-status` CSS and all 17 targeted assertions; delete the dead `min-width:768px` block; delete FAB/Search/Form-fill residue; migrate remaining 3/6-page string targets; no `test.fixme` left as a migration strategy — each quarantined spec from T0c is either migrated or deleted with a recorded reason.
- **Verification:** `npm run verify:full` only if a subsystem command cannot cover the deletion set; otherwise the mapped subsystem commands plus `check:css`.

---

## 13. Contract consistency check

| # | Check | Result |
| --- | --- | --- |
| 1 | No contradiction with T0b decisions (F1–F9) — the only T0b rule narrowed is "tap never toggles chrome", explicitly and narrowly by U4 | **PASS** |
| 2 | No contradiction with T0c proven invariants (A12 12/12, viewport matrix, Overlay O feasibility) — U1 and U7 extend them without weakening any measured invariant | **PASS** |
| 3 | No accidental reintroduction of L1 — Header is Back/title/Original-Reading; OCR Next, Contents, Markup, Context, Aa all have More owners; no FAB | **PASS** |
| 4 | No duplicate Reader controls — zoom only in Footer; OCR only in document tools; More reachable only from the Footer trigger | **PASS** |
| 5 | No tablet breakpoint — 1024px sole authority; dead 768 block deleted, not re-targeted | **PASS** |
| 6 | Tap-to-reveal — deliberately and explicitly changed by U4 to a **reveal-only** affordance with a single quieter (downward travel); no toggle exists | **PASS** (explicit change, recorded) |
| 7 | No permanent OCR status strip — `.pdf-queue-status` obsolete; Footer progress is active-run-only and carries no control | **PASS** |
| 8 | No obsolete 3/6-page OCR semantics — preload 6 is an implementation defect (U6), all 3/6-page copy and test vocabulary is obsolete (O8) | **PASS** |

**U1 clarification (2026-10-04), re-verified after amendment.** The contract was amended to state U1's load lifecycle as `open → geometry reconciliation at scrollTop=0 → settle → optional saved-position restoration`. Consistency was re-checked against the eight rows above:

| Check after the U1 clarification | Result |
| --- | --- |
| U2–U8 unchanged by the amendment | **PASS** — U1 has no cross-dependency on U2–U8; no U2–U8 paragraph or contract section was edited |
| Overlay O preserved; no reserved header strip; no permanent content space introduced | **PASS** — contract §3.1–§3.5 and contract §5.0.5 unchanged and explicitly restated |
| A12 true geometry preserved — quiet/reveal remains visual-only, no geometry/`scrollTop`/height-token change, no reflow | **PASS** — contract A12-G1–A12-G3 and contract §4.2 textually unchanged |
| No A12 measurement weakened — T0c `121.8` vs `88` and `scrollTop = 96` figures retained verbatim | **PASS** — A12-G5 evidence annotation unchanged |
| Page/location identity still stable through reconciliation and settlement | **PASS** — A12-G7 retained, now explicitly excluding restoration movement, which is separately specified in A12-G10 |
| No unresolved conflict requiring another decision to be reopened | **PASS** — the only contradiction found was internal to U1 (old A12-G4 "including when a prior reading position exists" and the old §5 input-table row conflating reconciliation with restoration); both were resolved inside U1 |
| Implementation, tests, and unrelated files untouched | **PASS** — `git diff -- src e2e` empty; working tree contains only these `docs/` files |

Additional self-checks: no `src/`, `e2e/`, test, CSS or runtime file was modified (**PASS**); the old Mobile Reader/Home redesign material is treated as history only (O12) (**PASS**); every unverifiable item is listed as DEFERRED rather than guessed (**PASS**); the working tree contains only these `docs/` additions (**PASS**).

---

## 14. Checks performed in T0e

| Check | Label |
| --- | --- |
| `git log -1` / branch / `git status --porcelain` | **PASS** |
| `git diff 6d189f0 HEAD -- src/ e2e/` (repository matches T0d handoff) | **PASS** |
| T0b / T0c / T0d records present and read in full | **PASS** |
| Source grounding for U1–U8 (`ReaderShell.tsx`, `ReaderToolbar.tsx`, `ReaderProgress.tsx`, `PdfModeSwitch.tsx`, `usePdfOcrQueue.ts`, `App.tsx` seams, `reader-layout.css`, `styles.*.css`, `useDesktop.ts`, `docs/reader.md`) | **PASS** |
| Contract commands cross-checked against `docs/verification-map.md` (`verify:reader`, `verify:pdf`, `verify:ui`, `verify:lookup`, `check:css`, `verify:full`) | **PASS** |
| OCR cost classification against `COST & QUOTA GUARDRAILS.md` (on-device ⇒ no upstream/quota effect) | **PASS** |
| Runtime / e2e / typecheck / CSS suite | **NOT RUN** — T0e changed no product code; running a full suite is not required to ground a contract in audited HEAD |

One probe was classified and abandoned once: `docs/tasks/2026-10-03-reader-experience-redesign.md` does not exist; the old redesign material was instead identified by enumerating `docs/tasks/` (5 task documents, listed in §11.2).

**U1 clarification amendment (2026-10-04).** The contract and this record were amended for U1 only. Checks run after the amendment:

| Check | Label |
| --- | --- |
| Consistency sweep of both documents for `load`, `open`, `initial`, `scrollTop`, `settle`, `restorat`, `first readable`, `first line`, `A12-G4`, `A12-G5` | **PASS** — every remaining occurrence is either the clarified lifecycle, the retained T0c measurement, focus restoration (contract §14.4, unrelated), or the chrome "settled-reader gap" (contract §6.7, unrelated) |
| Internal `§` cross-references in both documents resolve to a heading or rule | **PASS** — contract: 0 unresolved; this record: only cross-document refs to contract §3.3, §5.0, §13.4, each explicitly labelled `contract §…` |
| `A12-G1`–`A12-G10` defined once; no bare `G#` label remains | **PASS** |
| `git diff -- src e2e` | **PASS** (empty) |
| `git status --porcelain` | **PASS** (only these two `docs/` files) |
| Runtime / e2e / typecheck / CSS suite | **NOT RUN** — T0e changed no product code |

---

## 15. Terminal outcome

T0e CONTRACT FROZEN — READY FOR IMPLEMENTATION