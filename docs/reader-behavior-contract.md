# Reader Behavior Contract

Status: **FROZEN** — 2026-10-04 · Authority: [`docs/tasks/2026-10-04-reader-behavior-contract-decisions-t0e.md`](./tasks/2026-10-04-reader-behavior-contract-decisions-t0e.md) (U1–U8 decision record) · Supersedes the Reader **behavior** specification of T0b, T0c, T0d and [`docs/reader.md`](./reader.md)

This is the **authoritative product contract** for Reader behavior in the redesign. Implementation phases reference it instead of re-deriving behavior.

**Scope.** This contract fixes *observable* Reader behavior: what is reachable, what state is visible, what changes geometry, what is announced. It deliberately does **not** fix component structure, hook names, or internal state shape. Where a behavior must be testable, it is stated precisely enough to test; beyond that, implementation is free.

**Reading conventions.** **MUST** / **MUST NOT** = binding product rules. **EVIDENCE** = the measured or audited fact the rule rests on, with its record. **OPEN** = deliberately not decided here, with the phase that must decide it. Nothing in this contract is inherited from an unstated default.

**Precedence.** This contract wins over every earlier Reader behavior rule. [`docs/reader.md`](./reader.md) remains authoritative for *architecture* (module map, non-behavior invariants) and this contract for *behavior*; where the two describe the same behavior, this contract wins. [`COST & QUOTA GUARDRAILS.md`](<../COST & QUOTA GUARDRAILS.md>) and the invariants in [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) are binding and are not superseded here.

---

## 1. Responsive model

1.1 `≤1023px` **MUST** present **Mobile Chrome**. `≥1024px` **MUST** present **Desktop Chrome**. The boundary is inclusive on both sides: `1023px` is mobile, `1024px` is desktop.
1.2 There **MUST NOT** be a tablet Reader variant, and no Reader breakpoint **MAY** be defined between `1023px` and `1024px`.
1.3 `useDesktop()` / `1024px` **MUST** be the **sole** semantic responsive authority for Reader behavior. Any other Reader width condition is presentational at most and **MUST NOT** decide control ownership, disclosure form, or chrome behavior.
1.4 The obsolete 768 semantic Reader breakpoint **MUST** be **removed** during implementation, not re-targeted or re-purposed.
- **EVIDENCE.** `src/components/useDesktop.ts:2` = `matchMedia('(min-width: 1024px)')`, the only Reader responsive source; repository invariant `useDesktop()` (1024px) is the single responsive authority in [`docs/ui-system.md`](./ui-system.md); T0b Decision 2.
1.5 Reader control hit targets **MUST** be at least `44px` at `≤1023px` and at least `36px` at `≥1024px`. Every Reader control **MUST** remain reachable at `320px` without horizontal scrolling of the Reader chrome itself.

---

## 2. Reader architecture

2.1 Simple and Advanced **MUST** be **disclosure modes of one Reader architecture and one Reader state model** — not two shells, not two state stores, not divergent chrome.
- **EVIDENCE.** T0b Decision 1; both modes already share one shell element carrying `data-interface-mode`.
2.2 Original and Reading **MUST** be **one PDF presentation control**, not two features and not two entry points.
2.3 PDF **presentation** (reading mode, rendering) and PDF **processing/document tools** (OCR, extraction, page images) **MUST** remain **separate concerns internally**, even when More surfaces both as adjacent entries. Co-locating them in one disclosure **MUST NOT** merge their models.
2.4 Reader **MUST NOT** have a Reader FAB. Reader **MUST NOT** have a Reader Search surface. Reader **MUST NOT** have a Form Fill surface.
- **EVIDENCE.** T0b Decisions 5–6; Reader Search is currently a hard no-op (`onClick={() => {}}` + `disabled`); the FAB is untracked WIP.
2.5 Reader chrome **MUST NOT** create a scroll-observer feedback loop — no scroll listener **MAY** change layout in a way that re-triggers itself.
- **EVIDENCE.** `docs/reader.md` invariant 7.
2.6 Reader **MUST NOT** introduce upstream network calls, quota reservations, or Worker API traffic. Every Reader behavior in this contract is local/static.

---

## 3. Overlay chrome model

3.1 The Reader **MUST** use the Overlay chrome model (Overlay O). This contract does not adopt the static-header fallback.
3.2 The Header **MUST** overlay the reading surface. Content **MUST NOT** be pushed down by the Header.
3.3 Static top padding compensating for the Header **MUST** live **inside the scroll container**, so it participates in Reader scrolling.
3.4 The Footer band **MUST** remain reserved in layout and **MUST NOT** be dropped to gain content height.
3.5 Chrome **MUST NOT** add a reserved strip to the reading surface. The obsolete `.pdf-queue-status` reserved-strip model **MUST NOT** be reintroduced, in any form, as a layout shortcut.
3.6 No second popup architecture **MAY** exist. More (§9) is the **only** popup/disclosure architecture in the Reader; a Footer-owned popup of any kind is prohibited.

---

## 4. Chrome state model

4.1 Chrome has exactly two visible states: **visible** and **quiet**. Any third state (hidden-but-reserved, collapsed, ghost) is not part of this contract.
4.2 Quiet/reveal is **visual chrome behavior only**. It **MUST NOT** alter content height, `scrollTop`, page identity, reported location, or any layout geometry — see §13.
4.3 Quiet **MUST NOT** be available at `≥1024px`. Desktop Chrome is **always visible** and has no quiet state and therefore needs no escape affordance (§6).
4.4 Chrome **MUST NOT** be in the quiet state while an overlay that blocks reading is open (More, Lookup, selection surfaces, any menu).
4.5 Chrome **MUST NOT** enter the quiet state during load, restoration, or reconciliation, and a document opening **MUST** leave chrome visible.

---

## 5. Input semantics

Each input class is defined separately. Only real user scroll may change chrome state.

5.0 **Load and position lifecycle.** On document open the Reader follows exactly this order. The stages **MUST NOT** be reordered or conflated.

| Stage | State | Position | Purpose |
| --- | --- | --- | --- |
| 1 · **Open** | initial open state | `scrollTop = 0` | Reading surface established at true content top |
| 2 · **Geometry reconciliation** | reconciling | `scrollTop = 0` | Overlay compensation is measured against the true content top; reconciliation **MUST NOT** scroll past the injected padding (§3.3) |
| 3 · **Settle** | settled | `scrollTop = 0` | Layout and rendering settle; the initial viewport is treated as stable only from here |
| 4 · **Saved-position restoration** *(optional)* | restored | restored position | Only now — and only if a saved position exists and restoration is applicable — may a previously saved reading position be restored |

5.0.1 `scrollTop = 0` is the **geometry reconciliation reference point**, not a guarantee of the reader's final position. The settled reader **MUST NOT** be required to remain at `scrollTop = 0`; a reader with a saved position **MUST** be restored to it.
5.0.2 Stage 2 **MUST** complete before stage 4 begins. Saved-position restoration **MUST NOT** be applied to the unreconciled initial state, and **MUST NOT** substitute for reconciliation.
5.0.3 **Observable invariant for `scrollTop = 0`.** After reconciliation and settlement, the first readable content **MUST NOT** be covered by the overlaid Header (§13, A12-G5). This invariant is evaluated at the settled `scrollTop = 0` state, and is evaluated **separately** from any restored position.
5.0.4 Where restoration occurs, its effect **MUST** be evaluated as expected saved-position movement, separately from the `scrollTop = 0` invariant (§13.4).
5.0.5 Reconciliation and settlement **MUST NOT** be achieved by adding permanent content space for the Header, and **MUST NOT** alter the Overlay model (§3.1, §3.2). Coverage is achieved by reconciling scroll to the true content top, never by reserving a header strip.
5.0.6 The initial `scrollTop = 0` observation **MUST NOT** be treated as equivalent to the final restored position.

| Input class | May quiet | May reveal | May change geometry (§13) | May change page/location identity |
| --- | --- | --- | --- | --- |
| Real user scroll (wheel, trackpad, touch drag) | Yes, per §6 | Yes, per §6 | No | No |
| Wheel event (mouse wheel) | Yes, per §6 | Yes, per §6 | No | No |
| Touch (drag, momentum) | Yes, per §6 | Yes, per §6 | No | No |
| Tap / click on reading surface | **Never** | **Never** | No | No |
| Tap / click on a control | No | No | No | Only if that control's contract says so (§10, §11) |
| Programmatic scroll / page jump | **Never** | **Never** | No | Yes (its purpose) |
| Zoom change | **Never** | **Never** | Zoom itself may re-render text, but **MUST NOT** move the viewport box or reflow chrome | No |
| Mode change (Original⇄Reading, Simple/Advanced) | **Never** | **Never** | **Never** (§13) | No |
| Geometry reconciliation on open (§5.0 stages 1–3) | **Never** | **Never** | Establishes the reference geometry; does not alter it | Establishes the reconciliation reference location (A12-G4) |
| Saved-position restoration, optional (§5.0 stage 4) | **Never** | **Never** | **Never** — restores position only, never geometry | Yes, and intentionally (§13.4) |
| Keyboard / screen-reader focus entering chrome | No | **Yes** (§6.4) | No | No |
| Browser / hardware Back | **Never** | **Never** | No | Only via the §11 resolver |

5.1 Programmatic scroll, page jumps, zoom, mode changes, geometry reconciliation and saved-position restoration **MUST NOT** quiet or reveal chrome.
5.2 Programmatic scroll **MUST NOT** contribute to the chrome travel accumulator (§6). Only real user scroll may.
5.3 A tap, click, double-tap or long-press on the reading surface, on text, or on a selection handle **MUST NOT** quiet or reveal chrome.
5.4 Wheel and touch **MUST** use identical thresholds and identical accumulation, so device class cannot change chrome semantics.
5.5 Synthetic and programmatic scroll **MUST NOT** be used to satisfy a user-visible chrome requirement; only real input demonstrates it (see §15).

---

## 6. Reveal trigger, thresholds, hysteresis, and the quiet escape

6.0 **Reveal/quiet constants.**

| Rule | Semantics | Value |
| --- | --- | --- |
| Quiet | accumulated **downward** real-scroll travel | `≥ 32px` |
| Reveal | accumulated **upward** real-scroll travel | `≥ 32px` |
| Reveal (content top) | reading viewport at true content top | `top ≤ 40px` |
| Reveal (accessibility) | focus enters chrome | any (no threshold) |
| Reveal (explicit) | escape affordance activated | any (no threshold) |

6.1 Quiet and reveal **MUST** use **one shared constant** for their travel thresholds, in **opposite directions**.
- **DECISION (U7).** Symmetric accumulated travel; the value is the already-governing `32px`, **not** an inherited `-24px`.
6.2 The accumulator **MUST** add the absolute travel of each real-scroll delta while direction is unchanged, and **MUST** reset to `0` on any delta in the opposite direction before the new travel is applied.
6.3 A quiet/reveal transition **MUST** be driven **only** by the accumulated total. A **single-event** delta of any size **MUST NOT** trigger reveal, and the existing single-event `delta < -8` test **MUST** be removed.
- **EVIDENCE.** T0c §3 measured: up `-4`/`-6`/`-8` → still quiet; up `-10` → revealed. A ~10px effective threshold sits below the ~12–16px trackpad-flick noise band, so incidental upward corrections falsely reveal chrome. Symmetry is required so a deliberate 32px commitment to quiet is not undone by an accidental twitch.
6.4 **Focus reveal.** When focus enters chrome (§7 Header, §8 Footer, or the §6.5 escape affordance), chrome **MUST** become visible and **MUST** remain visible while focus stays inside chrome. When focus leaves chrome, chrome **MUST** return to the state it was in before focus entered. Focus capture anywhere else — reading surface, text, selection handles, document body — **MUST NOT** reveal chrome.
- **DECISION (U4).** The current `onFocusCapture` on the shell root, which un-quiets on *any* focus inside the shell, **MUST** be narrowed to focus entering chrome only.
6.5 **Escape affordance.** While chrome is quiet on Mobile Chrome, a dedicated, persistent, labeled **reveal-only** control **MUST** be available to the reader, and it **MUST** be reachable by keyboard and by assistive technology.
6.6 The escape affordance **MUST** only reveal chrome. It **MUST NOT** be able to quiet chrome, **MUST NOT** be a toggle, and **MUST NOT** be a FAB, a menu, or any popup.
6.7 The escape affordance **MUST NOT** be the primary means of reaching chrome for a reader who scrolls normally; upward real scroll and keyboard focus **MUST** remain sufficient. It exists to close the settled-reader gap, not to become the default interaction.
6.8 **Prohibited escapes.** The following **MUST NOT** reveal or quiet chrome: tap on the reading surface; double-tap; long-press; edge swipe; browser/hardware Back (§11); idle timeout; any automatic or timed reveal.
- **DECISION (U4).** Tap-to-toggle chrome is **not** reintroduced. The only deliberate change to the T0b rule is that a **labeled, dedicated, reveal-only** control may be activated to reveal chrome; no gesture toggles chrome.
6.9 **OPEN — affordance placement.** Whether the reveal-only control is anchored in the reserved Footer band or presented as a fixed edge affordance **MUST** be settled by **MobileChrome**, and **MUST** be tested at `320px`, `390px` and `844×390` landscape. It **MUST NOT** change reading viewport geometry (§13) and **MUST NOT** overlap the Footer controls it shares space with.

---

## 7. Header contract

7.1 The Header **MUST** own **exactly and only**: **Back**; **document title**; **Original / Reading** for PDF.
7.2 The Header **MUST NOT** own: Contents; Context; Notes; Markup; Text and theme; Language engines; Reading appearance (`Aa`); OCR Next or any OCR action; zoom; a More trigger; Search; any FAB.
- **EVIDENCE.** T0b consolidated Header table; T0d §6 inventory; the audited Header currently duplicates Contents, Markup, Context and `Aa`.
7.3 The document title **MUST** be present, **MUST** identify the current document, and **MUST NOT** be an interactive control.
7.4 `Original / Reading` **MUST** appear **only** for PDF and **MUST** be a single mode control (§10).
7.5 Header controls **MUST** meet the hit targets of §1.5 and **MUST** be reachable and operable by keyboard.

---

## 8. Footer contract

8.1 The Footer **MUST** own: **reading progress**; **location**; **percentage** where retained; **PDF zoom**; the **More trigger**; and **OCR status only per §12 and only during the active lifecycle**.
8.2 PDF zoom **MUST** be Footer-owned (T0b retains zoom in Footer) and **MUST** be a **direct Footer control** — decrease, level readout, increase.
8.3 Zoom **MUST NOT** be a popup, **MUST NOT** open any menu or sheet, and **MUST NOT** also be reachable from More.
- **DECISION (U3).** The third popup layer (`src/reader/pdf/PdfViewer.tsx:139-140`, `.pdf-more` / `.pdf-more-menu` / `.pdf-mobile-zoom-host`) **MUST** be removed. More is the only disclosure architecture (§3.6).
8.4 The Footer **MUST NOT** contain a permanent OCR status strip, and OCR status **MUST NOT** become a permanent navigation or control element. Footer OCR status exists **only** while a run is active (§12).
8.5 Reading progress and location **MUST** reflect the real reading position and **MUST** remain consistent with §13 page/location identity.
8.6 Footer controls **MUST** meet the hit targets of §1.5, **MUST** be keyboard reachable, and **MUST** remain operable at `320px` without hiding any Footer-owned control.

---

## 9. More contract

9.1 There **MUST** be exactly **one** conceptual More disclosure.
9.2 At `≤1023px` More **MUST** be a **bottom sheet**. At `≥1024px` More **MUST** be a **popover**. One disclosure, one implementation of dismissal and focus handling per form — **MUST NOT** be two More concepts.
- **EVIDENCE.** `src/reader-layout.css:102` (sheet, `left/right: 8px`, `max-height: 70dvh`), `:33` (popover, `width: 230px`); T0b open decision #2.
9.3 The More action inventory **MUST** be exactly: **Contents**; **Context**; **Notes**; **Markup**; **Text and theme**; **Language engines**; **document tools / OCR controls**; **Click word lookup**.
9.4 **No duplicate entry points.** An action in §9.3 **MUST NOT** also be reachable from the Header (§7.2) or from any other Reader surface. Zoom **MUST NOT** appear in More (§8.3). OCR controls **MUST NOT** appear outside document tools (§12).
9.5 `320px` behavior: More **MUST** be a bottom sheet; **MUST** fit the viewport width with its existing `8px` insets; **MUST NOT** exceed `70dvh` height; **MUST** expose every §9.3 action by scrolling within the sheet if the inventory does not fit; **MUST NOT** force horizontal scrolling; and **MUST** remain fully dismissible.
- **EVIDENCE.** T0d §7 verified existing 320px behavior; width-cap work for `768–1023px` is outstanding.
9.6 `768–1023px` behavior: More **MUST** remain a bottom sheet (there is no tablet variant, §1.2) and **MUST** apply a **width cap** so it does not span an unbounded desktop-width surface.
- **DEFECT (open).** No width cap currently exists on `.reader-more-menu` / `.pdf-reading-options` for `768–1023px`; this is **MobileChrome** work.
9.7 More **MUST** expose document tools and OCR controls as **one** More action opening the **one** document-tools surface; it **MUST NOT** be duplicated as separate OCR entries.
9.8 More **MUST** apply the chrome-blocking rule of §4.4 while open.

---

## 10. PDF mode contract

10.1 Original ⇄ Reading **MUST** be a single, PDF-only, presentation-only mode control.
10.2 Changing mode **MUST NOT** alter document content, extraction results, OCR state, or page identity.
10.3 If readable text is unavailable for the requested mode, the Reader **MUST NOT** present a silent no-op. The mode control **MUST** be hidden or disabled in that case, and its unavailable state **MUST** be programmatically perceivable (§14).
10.4 The mode control **MUST NOT** be the only way to any other Reader action, and **MUST NOT** be duplicated in More.

---

## 11. Back contract

11.1 There **MUST** be exactly **one** Back resolver for the Reader.
11.2 Resolver priority **MUST** begin with the **active overlay/surface** (More sheet or popover, Lookup surface, selection surfaces, any open menu), and **MUST** then **leave the document**.
11.3 There **MUST NOT** be a "Back reveals chrome" tier. Back **MUST NOT** quiet or reveal chrome (§6.8).
11.4 Browser and hardware Back **MUST** use the same resolver semantics wherever they apply to the Reader, so a system Back gesture and an in-app Back affordance **MUST NOT** diverge.
11.5 The Back affordance in the Header (§7.1) **MUST** be the single in-app entry point to the resolver.
11.6 **OPEN — history ownership.** How history entries are created and consumed (`pushState`, `popstate`, or router navigation) is **not established** by T0b/T0c/T0d evidence and is **MUST NOT** be invented here. It is an implementation consideration owned by **Lookup/Overlay**, constrained only by §11.1–§11.4. Any competing history owner — for example an untracked FAB's own `pushState`/`popstate` — **MUST** be removed (Cleanup).

---

## 12. OCR contract

12.0 **Lifecycle classes.** "OCR active" means the union of `preparing`, `running`, `paused`. All behavior below is defined over queue **state**; no rule in this section may be derived from localized status text.

| Class | States | Reader-visible meaning | Run controls | Status surfaces |
| --- | --- | --- | --- | --- |
| **Active / resumable** | `preparing`, `running`, `paused` | A run exists and can continue or be resumed | Start-remaining, Pause/Resume, Cancel | Footer progress **and** document-tools status |
| **Terminal success** | run finished with no error and no remaining work | OCR completed | Start-remaining disabled | Document-tools status **only** |
| **Terminal error** | `error` | The run failed | Start-remaining enabled (retry) | Document-tools status **only** |
| **Cancelled / cleared** | cancelled, or OCR results cleared | No run; queued work discarded | Start-remaining enabled | **None** |

12.1 **Preload.** The Reader **MUST** preload the **first 12 candidate pages**. The audited behavior of stopping at 6 is an **implementation defect** owned by the **PDF/OCR controls** phase, not a product rule.
- **EVIDENCE.** `usePdfOcrQueue.ts:71-79` iterates to 12 but breaks at `pending.length >= 6` (`:78`) while `OCR_AUTO_BATCH_SIZE = 12` (`:11`) and the caller gate uses `pdfPages.slice(0, 12)`. The current unit test **pins** the defect (14/14 green). Preload **MUST** remain local-only: no upstream request, no quota reservation, no Worker API call. [`docs/reader.md`](./reader.md)'s "at most 6" preload description is obsolete (§12.12).
12.2 **Explicit OCR.** Explicit OCR **MUST** process a **12-page window**, starting at the first unprocessed page.
12.3 **Automatic continuation.** Within a run, windows **MUST** continue automatically in 12-page steps until the document is exhausted, with no per-window user action.
12.4 **Run OCR on remaining pages.** Document tools **MUST** offer one action meaning *process every remaining unprocessed page, continuing in 12-page windows until exhaustion*. It **MUST** serve as the start-after-preload, restart-after-cancel and recover-after-error entry point. It **MUST NOT** be a per-window "next" advance, **MUST NOT** be an L1/Header action, and **MUST NOT** live outside document tools.
12.5 **Pause / resume.** Pause and resume **MUST** be available while a run is active, **MUST** preserve run state, and a paused run **MUST** remain classified active (§12.0) so progress stays visible.
12.6 **Cancel.** Cancel **MUST** end the run, **MUST** clear the active status surfaces, and **MUST** leave the document readable. After cancel the reader **MUST** be able to start a new run (§12.4).
12.7 **Success.** A run that completes **MUST** end in an explicit terminal-success state that is observable and **MUST NOT** be inferred from a localized message.
- **DEFECT (open).** Today `done` is set only for the nothing-left case and a successful non-empty run ends in `null` (`src/reader/pdf/usePdfOcrQueue.ts:116`), so success is indistinguishable from idle. Owned by **PDF/OCR controls**.
12.8 **Error.** A failed run **MUST** end in an explicit terminal-error state distinguishable from success, **MUST** keep previously produced results, and **MUST** offer the §12.4 entry point for retry.
12.9 **No work.** "Nothing to OCR" **MUST** be observable and **MUST NOT** be a copy-matched special case; a reader with nothing to process **MUST NOT** be shown an active run.
- **DEFECT (open).** Two string-coupled predicates compare a localized message (`src/app/App.tsx:594`, `src/reader/pdf/PdfModeSwitch.tsx:32`). Owned by **PDF/OCR controls**.
12.10 **Active status visibility.** The Footer OCR surface **MUST** be present **only** while a run is active (`preparing`, `running`, `paused`) and **MUST NOT** be present for idle, terminal success, terminal error, or cancelled/cleared.
- **EVIDENCE.** `src/app/App.tsx:589` already gates on `['preparing','running','paused']`.
12.11 **OCR action ownership.** Every OCR action **MUST** live in the document-tools surface reached from More (§9.3). No OCR action **MAY** appear in the Header, Footer, or any other surface.
- **EVIDENCE.** `src/reader/pdf/PdfModeSwitch.tsx:32` has a second string-coupled `done` predicate; `:48` carries the "tối đa 12 trang" copy; `:49-58` renders a `<p role="status">` block. The current copy path is suppressed by `showNext={false}` (`src/app/App.tsx:595`), so the OCR Next copy is currently **invisible** — the action is unreachable, not merely mis-placed.
12.12 **Obsolete semantics retired by this section.** The `.pdf-queue-status` strip, the 3-page and 6-page OCR vocabulary in copy and tests, and `docs/reader.md`'s "at most 6" preload description **MUST NOT** be treated as Reader behavior. Stale 3/6-page labels and tests **MUST** be migrated in the **PDF/OCR controls** phase.
- **EVIDENCE.** T0d §4 stale inventory, including `ReaderShell.test.tsx:96` (`'next 6'`), `e2e/pdf-mode-layout.spec.ts:51` (`/OCR.*6/`), and five `'OCR 3/6 trang'` / `'Không có trang scan cần OCR'` targets.
12.13 **Announcements.** Transitions into and out of the active lifecycle **MUST** be programmatically perceivable (§14). Exact wording is **OPEN**, owned by **PDF/OCR controls**.

---

## 13. A12 geometry contract

13.0 These are **true geometry invariants**: properties of the reading viewport box and page identity, independent of chrome position or chrome visibility. Chrome position/visibility assertions are **not** geometry invariants and are specified in §4, §6 and §13.3.
13.0.1 A12-G1–A12-G9 describe **true geometry**: the viewport box and page identity as such. A12-G10 describes the **load lifecycle** (§5.0) — the ordered stages at which the geometry reference state is established and at which optional saved-position restoration may occur. A12-G10 governs *when* position may change, not *what* the geometry is.

**True geometry invariants (carried forward from T0c, 12/12 PASS):**

- **A12-G1 — viewport top stable.** The reading viewport box top **MUST NOT** change across chrome quiet, chrome reveal, mode change, zoom change, Lookup open/close, or More open/close.
- **A12-G2 — viewport height stable.** The reading viewport box height **MUST NOT** change across those same transitions.
- **A12-G3 — quiet/reveal does not alter geometry.** Quiet/reveal **MUST NOT** change content height, `scrollTop`, page identity, reported location, or layout geometry.
- **A12-G4 — geometry reconciliation at true content top.** On open, the shell **MUST** perform geometry reconciliation at `scrollTop = 0` (§5.0 stages 1–3) before the initial viewport is treated as stable. Reconciliation **MUST NOT** scroll past the injected static top padding (§3.3). This is a **reconciliation reference state**, not a required end state: once settlement completes, optional saved-position restoration (§5.0 stage 4) **MAY** move the reader.
- **A12-G5 — first readable line clear.** In the settled `scrollTop = 0` state, the first readable content **MUST NOT** be covered by the overlaid Header; its top **MUST** sit at or below the Header's bottom edge. This invariant is scoped to the settled `scrollTop = 0` state and is evaluated **separately** from any restored position. *(T0c measured `firstLineTop = 121.8` vs `headerBottom = 88` at true `scrollTop 0` → clear → PASS; the audited shell instead settled at `scrollTop = 96`, exactly the injected `calc(header + 8px)` padding, where the line sat `25.796875px` below the viewport-box top → covered → FAIL. Fixed by A12-G4, not by padding growth.)*
- **A12-G6 — Lookup does not alter the viewport box.** Opening or closing a Lookup surface **MUST NOT** change the reading viewport box (A12-G1/A12-G2).
- **A12-G7 — page/location identity stable.** Page identity and reported location **MUST** remain stable across chrome quiet/reveal, Lookup open/close, More open/close, mode change, and across geometry reconciliation and settlement (A12-G4). Movement attributable to saved-position restoration is expected and is specified separately in A12-G10.
- **A12-G8 — static padding creates no unintended jump.** Static top padding inside the scroll container **MUST NOT** produce an unintended page/location jump during reconciliation or settlement (§3.3, A12-G4, A12-G7). A jump to the restored position (§5.0 stage 4) is intended movement and is **not** an unintended jump.
- **A12-G9 — revealed header overlap bounded.** A revealed Header **MUST** overlap no more than its own visual height and **MUST NOT** cause reflow (§3.2, §4.2).
- **A12-G10 — saved-position restoration is position-only.** When restoration occurs, it **MUST** occur only after reconciliation and settlement (A12-G4), **MUST** preserve A12-G1/A12-G2 viewport geometry, and **MUST NOT** be confused with a layout-induced scroll change. Its observable effect **MUST** be attributable to the saved position.

13.1 Geometry **MUST** hold at every viewport in the §15.6 matrix.
13.2 Geometry **MUST NOT** depend on whether chrome is visible.
13.3 **Geometry where geometry is the product requirement only.** Tests assert geometry when the requirement *is* geometry. Chrome position and visibility are asserted as chrome state (§4, §6), never as geometry.

**13.4 Observable load stages (verification order).** The lifecycle in §5.0 is verified as ordered observable stages, not as a single end-state:

| Stage | Observable |
| --- | --- |
| Open | Reading surface established at `scrollTop = 0` |
| Geometry reconciliation | `scrollTop` remains `0`; not scrolled past the injected padding (A12-G4) |
| Settled | Initial viewport stable; A12-G1/A12-G2 hold; first readable content not covered by the Header (A12-G5) |
| Saved-position restoration *(if applicable)* | Position moves to the saved position (A12-G10); A12-G1/A12-G2 still hold; the movement is attributable to the saved position, **not** to a layout-induced scroll change |

13.4.1 Expected saved-position movement **MUST** be distinguishable from an unintended layout-induced scroll change. Any scroll change not attributable to the saved position is a violation of A12-G10, regardless of how it is produced.
13.4.2 The A12-G5 invariant **MUST** be evaluated at the settled `scrollTop = 0` state and **MUST NOT** be inferred from, or asserted against, the restored position.
13.4.3 These requirements specify **observable stages only**. They do not prescribe timing, waiting intervals, DOM structure, or state names; a verification approach **MUST** observe stages rather than depend on any particular implementation of them.

---

## 14. Accessibility

Chrome and every Reader control **MUST** satisfy the following observable requirements. Requirements are behavior, not implementation.

14.1 **Focus entering chrome reveals it** and keeps it revealed while focus is inside chrome (§6.4). Focus elsewhere **MUST NOT** reveal chrome.
14.2 **Keyboard navigation.** Every Reader control — Back, document title context, Original/Reading, Footer progress, location, percentage, zoom decrease/level/increase, the More trigger, and every More action — **MUST** be reachable and operable by keyboard alone, in a focus order that does not require pointer input and does not trap focus.
14.3 **Screen-reader access.** Every Reader control **MUST** have an accessible name that describes its action or state without relying on iconography, position, or color alone. The More disclosure **MUST** expose its expanded/collapsed state.
14.4 **Focus restoration.** After More or a Lookup surface is dismissed, focus **MUST** return to the element that opened it (the More trigger or the Lookup trigger), not to the document body and not to nothing.
14.5 **Disabled / unavailable Original/Reading.** When PDF readable text is unavailable, the mode control **MUST** be hidden or disabled — never an enabled control that does nothing (§10.3) — and its unavailable state **MUST** be programmatically determinable, not conveyed by visual dimming alone.
14.6 **OCR status announcements.** Transitions into and out of the active OCR lifecycle (§12.0) **MUST** be programmatically perceivable. The Footer OCR surface is a progress indicator and **MUST NOT** be a focus trap, a control, or a navigation target.
14.7 **The quiet escape.** The reveal-only escape affordance (§6.5–§6.9) **MUST** be keyboard operable and **MUST** be discoverable without relying on a visual-only gesture (§5.3, §6.8). Chrome **MUST NOT** be reachable only by scrolling.
14.8 **No visual-only dependency.** Reader behavior **MUST NOT** require a visual-only gesture, hover, drag, or pointer-only affordance for any function. Every visual-only chrome affordance **MUST** have a keyboard and assistive-technology equivalent.
14.9 **Hit targets** per §1.5.

---

## 15. Test obligations

Tests **MUST** verify **observable product behavior**, not implementation structure.

15.0 **Prohibitions (binding on every Reader test).** No Page Object framework. No class-name assertions unless the class itself is explicitly the product contract. No direct state mutation to simulate user behavior. No synthetic/fake scroll events where real input is required. No magic coordinates. No `test.fixme` as a final migration strategy — a quarantined spec is either migrated or deleted with a recorded reason.
- **EVIDENCE.** T0c already quarantined `pdf-click-mobile.spec.ts:11`, `pdf-mobile-chrome-space.spec.ts:10,72`, `pdf-mode-layout.spec.ts:9`; these are migration obligations for the Lookup/Overlay and PDF/OCR phases, not a permanent state.

15.1 **Roles and labels.** Assert accessible names, roles, and expanded/collapsed state for Back, Original/Reading, zoom controls, the More trigger, and every More action — by role/name queries, not by class.
15.2 **User-visible state.** Assert what a reader can perceive: chrome visible/quiet, More open form (sheet at `≤1023px`, popover at `≥1024px`), mode selected, zoom level.
15.3 **Real wheel/touch input.** Chrome quiet/reveal **MUST** be proven with **real** wheel or touch input, including that an upward jitter below threshold does **not** reveal (§6.3). Synthetic scroll events **MUST NOT** satisfy this.
15.4 **Focus behavior.** Focus entering chrome reveals chrome (§14.1); focus elsewhere does not; focus restores to the opener after More/Lookup dismissal (§14.4); the escape affordance is keyboard operable (§14.7).
15.5 **Geometry only where geometry is the product requirement.** Assert §13 A12-G1–A12-G9 when geometry is the requirement. Chrome position and visibility are asserted as chrome state (§4, §6), never as geometry (§13.3).
15.6 **Responsive matrix.** Assert the contract at **`320`, `390`, `767`, `768`, `1023`, `1024`** plus the required landscape sizes **`844×390`** and **`915×412`**: Mobile/Desktop boundary correctness (§1.1), More form (§9.2), 320px reachability (§1.5, §9.5), `768–1023` width cap (§9.6), and A12-G1–A12-G9 (§13.1).
15.7 **Page/location identity and the load lifecycle.** Assert A12-G7 and A12-G8: identity stable across quiet/reveal, Lookup open/close, More open/close, mode change, and across reconciliation and settlement. Then assert the lifecycle as ordered observable stages (§13.4):

1. open the document and observe `scrollTop = 0`;
2. observe geometry reconciliation occurring at `scrollTop = 0`, not scrolled past the injected padding (A12-G4);
3. allow the reader to settle;
4. verify the first readable content is not covered by the Header (A12-G5);
5. **if** a saved position exists, verify restoration occurs only after the initial geometry reconciliation and settlement (A12-G10), and that the resulting movement does not introduce an unintended geometry jump or violate A12-G1/A12-G2 (A12-G10);
6. distinguish expected saved-position movement from an unintended layout-induced scroll change.

The initial `scrollTop = 0` observation **MUST NOT** be asserted as the final position when a saved position exists. Stages **MUST** be observed rather than timed; no wait interval, DOM structure, or state name is prescribed (§13.4.3).
15.8 **More ownership.** Assert the §9.3 inventory is complete, that no §9.3 action is duplicated in the Header or Footer, that zoom is **not** in More (§8.3), and that no second popup architecture exists (§3.6).
15.9 **OCR lifecycle.** Assert §12.0–§12.11 end to end: 12-page window, first-12 preload, automatic continuation without a per-window action, pause keeps the run active and visible, cancel clears status, terminal success and terminal error distinguishable, no-work observable, Footer status **only** while active, all OCR actions in document tools only, and no 3/6-page semantics surviving in copy or tests.
15.10 **Accessibility.** Assert §14.2, §14.3, §14.5, §14.6, §14.7 observably.
15.11 **Tap does not toggle.** Assert that taps on the reading surface, text, and selection handles never change chrome state in either direction (§5.3, §6.8), and that the escape affordance reveals but never quiets (§6.6).
15.12 **Verification routing.** Phase-specific commands are owned by [`docs/verification-map.md`](./verification-map.md). Relevant commands: `verify:reader`, `verify:pdf`, `verify:ui`, `verify:lookup` (the last two run `check:css` first), `check:css`, and `verify:full` as escalation only.

---

## 16. OPEN items

| # | Item | Owner phase | Why not decided here |
| --- | --- | --- | --- |
| 16.1 | Reveal-only escape affordance placement (reserved Footer band vs fixed edge affordance) | MobileChrome | Must be tested at 320px and landscape; geometry-neutral either way |
| 16.2 | Footer layout at 320px with the 3-control direct zoom stepper | MobileChrome | Escalation path is specified in §8.6; layout depends on the built result |
| 16.3 | Back history ownership (`pushState` / `popstate` / router navigation) | Lookup/Overlay | Not established by T0b/T0c/T0d; must not be invented here (§11.6) |
| 16.4 | Whether terminal success is one state or "no error + exhausted" | PDF/OCR controls | Observable requirement is fixed (§12.7); state shape is implementation |
| 16.5 | OCR announcement wording and politeness level | PDF/OCR controls | Announcement obligation is fixed (§12.13); phrasing is copy |

---

## 17. Change control

Any change to this contract requires a decision record entry in [`docs/tasks/2026-10-04-reader-behavior-contract-decisions-t0e.md`](./tasks/2026-10-04-reader-behavior-contract-decisions-t0e.md) style — evidence, decision, rationale, rejected alternatives — and **MUST** be labeled as changing a **FROZEN** item in the mapping (§11.1 of the decision record). Implementation **MUST NOT** deviate from this contract to accommodate a simpler implementation.