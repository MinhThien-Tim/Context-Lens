# Mobile layout shift — root-cause investigation

TASK
Investigate the reported Mobile Layout Shift / Header-Footer / Lookup interaction issue and determine the actual root cause before any implementation. Investigation only.

---

## PART A — CURRENT ARCHITECTURE

The reader has **three surfaces**, each with a different scroll owner and a different chrome contract.

| Surface | Scroll owner | Header | Compensation for fixed header |
|---|---|---|---|
| **Text** (`TextReader`) | window/document | `position: fixed` at ≤767 px | static `padding-top: calc(var(--reader-header-height) + 12px)` |
| **PDF Original** (`PdfViewer`) | `.pdf-scroll` | `position: fixed` at ≤767 px | `position: relative; top: var(--reader-header-height)` **on the viewport** |
| **PDF Reading** (`PdfReadingView`) | `.pdf-reading-scroll` | `position: fixed` at ≤767 px | `position: relative; top: var(--reader-header-height)` **on the viewport** |

Above 767 px (`reader-layout.css:93-110`) the header is `position: sticky`, participates in flow, and `.reader-viewport` is never offset.

Key ownership facts:

- **`ReaderShell` owns only the transient `chrome-quiet` class.** It is purely observational — passive listeners, one class toggle, no geometry writes. It never touches navigation.
- **`App.tsx` owns `.reader-viewport`** and passes `controlsLocked={lookupOpen || …}`. This is the coupling that makes Lookup open trigger the chrome reveal.
- **Height strategy is `100dvh`** throughout, which correctly tracks the visual viewport. Two `100vh` stragglers remain in `styles.reader-base.css`.
- **`LookupBottomSheet` renders inline** (no portal), `position: fixed` on mobile, positioned by `--lookup-vv-*` custom properties derived from `window.visualViewport`.
- **`useDialog` uses `preventScroll: true` on every focus call** — the focus trap cannot move reading position.
- **Portals exist only** in `PdfPage.tsx` / `PdfViewer.tsx`. Lookup does not portal.

The critical asymmetry: **the text surface compensates with static padding on the content; the PDF surfaces compensate by offsetting the scroll viewport itself.** The second approach moves the content when the offset changes.

---

## PART B — REPRODUCTION MATRIX

Movement columns use pinned `scrollTop` / pinned `window.scrollY` so that scrolling cannot confound the measurement.

| Scenario | Reproduced? | Document-flow movement? | `scrollTop` changed? | Viewport changed? | Root cause |
|---|---|---|---|---|---|
| Text @320 — quiet toggle, pinned scroll | **Yes (no shift)** | No | No | No | none — static `padding-top` |
| Text @390 — real wheel down/up/repeat | **Yes (no shift)** | No | Yes (legitimate) | No | none — `anchorDocY` constant |
| Text @768 — quiet toggle | **Yes (no shift)** | No | No | No | none — `top: auto`, header `sticky` |
| Text @390 — Lookup open/expand/scroll/close | **Yes (no shift)** | No | No | No | none |
| Text @390 — address-bar change | **Yes (no shift)** | No | No | Yes (`dvh`) | none — `dvh` correct |
| **PDF Original @320** — quiet toggle | **Yes** | **No reflow** | No | **Yes 712→800** | `mobile-reader.css:41-48` |
| **PDF Original @390** — quiet toggle | **Yes** | **No reflow** | No | **Yes 712→800** | `mobile-reader.css:41-48` |
| **PDF Original @430** — quiet toggle | **Yes** | **No reflow** | No | **Yes 712→800** | `mobile-reader.css:41-48` |
| PDF Original @768 — quiet toggle | **Yes (no shift)** | No | No | No | rule does not apply >767 px |
| PDF Original @390 — real wheel scroll | **Yes** | **No reflow** | Yes (legitimate) | **Yes** | `mobile-reader.css:41-48` |
| **PDF Reading @390** — quiet toggle | **Yes** | **No reflow** | No | No (height static) | `mobile-reader.css:41-42` (`top` only) |
| **PDF Original @390** — Lookup open | **Yes** | **No reflow** | No | **Yes** | `controlsLocked` forces reveal → `:41-48` |
| PDF Original @390 — Lookup scroll/close | Yes (no further shift) | No | No | No | — |
| PDF Original @390 — address-bar change | **Yes (no shift)** | No | No (≤4 px drift) | Yes (`dvh`) | none |
| PDF Original @768 — real wheel scroll | **Yes (no shift)** | No | Yes (legitimate) | No | rule does not apply |

**Discriminator:** at 768 px the shift is exactly **0**; at 320/390/430 it is exactly **88 px**. The only difference is whether `styles.mobile-reader.css`'s ≤767 px block applies.

**Classification:** this is **not** a layout shift by the strict definition — no reflow, no `scrollTop` change, no document-coordinate change, fully reversible. It is a deliberate repositioning of an in-flow scroll viewport. It nevertheless produces the reported perceived symptom.

---

## PART C — ROOT CAUSES

### CONFIRMED

**R1 — `chrome-quiet` repositions the PDF reading viewport (all phone widths).**
`src/styles.mobile-reader.css:41-48`. `top: var(--reader-header-height)` → `top: 0`, and for Original `.pdf-viewer-wrap` `height: calc(100dvh - var(--reader-header-height))` → `height: 100dvh`. Deterministic, exactly 88 px, fully reversible, `scrollTop` and page unchanged. **Owns symptoms (a) and (d).**

**R2 — Lookup open forces the same reveal on PDF.**
`App.tsx` passes `controlsLocked={lookupOpen || …}`; `ReaderShell` early-returns `setQuiet(false)`. Opening Lookup therefore triggers R1. **Extends symptom (d) to the Lookup path.**

**R3 — The text surface is structurally immune.**
Fixed header + static `padding-top` compensation. Confirmed 0 px at 320, 390, and 768. **Exonerates the text surface entirely.**

### HYPOTHESES / NOT CONFIRMED

- **H1 — Address-bar movement.** `100dvh` behaves correctly; the ≤4 px residual matches `usePdfScroll` tracker drift, not a height-induced shift. **Not reproduced as a defect.**
- **H2 — Lookup overlay.** 98.9 % coverage of the content area is real but **by design** — `position: fixed`, full-bleed, `aria-modal`. The report overstates it as a defect. Not a bug.
- **H3 — OCR queue interaction** with `:has(.pdf-queue-status)` height overrides (`styles.mobile-reader.css:49-51`). Untested.

---

## PART D — EXISTING TEST FAILURES

All named failures are **static geometry or text assertions** with no scroll, `chrome-quiet`, resize, or address-bar dependency. **None is causally related to the dynamic issue.** Treated as pre-existing per instruction; none was modified, and none was used as evidence for R1/R2.

| Failure | Nature | Relation to dynamic shift |
|---|---|---|
| `.language-cycle` width ≤72 (`ui-interactions.spec.ts:75`) | static width | **Unrelated** |
| mobile pronunciation inspector `EN+VI` / `↻` (`:130-131`) | static text | **Unrelated** |
| homepage action geometry (`:264-267`) | static width | **Unrelated** |
| `.continue-card` height (`continue-reading.spec.ts`, `homepage.spec.ts`) | static height | **Unrelated** |
| Continue Reading click timeout | interaction timeout | **Unrelated** |
| cross-spec interference | test isolation | **Unrelated** |

**Conversely, the two specs that *do* cover this area currently pass** and assert the 88 px movement as expected — see the "behavior change" note in `RECOMMENDATION`.

---

## PART E — FIX OPTIONS

Evaluated per the task's constraint: **none of these are implemented.**

| Option | Evidence for | Evidence against | Necessary? |
|---|---|---|---|
| **`position: fixed` overlay** (for the viewport) | Removes the in-flow box entirely, so `top` can never move it | Requires re-deriving PDF scroll geometry; high regression surface | **No** — the offset is intentional chrome reclaim |
| **`transform: translateY(...)`** | Compositor-only, cheap | Would move content by the same 88 px — **reproduces the symptom, does not fix it** | **No** |
| **`100dvh` → `100svh`/`100lvh`** | `dvh` already tracks correctly; measured 0 shift | Fixes a non-bug | **No** |
| **Scroll-direction detection** | Already exists and already works | Cannot help — `controlsLocked` bypasses it | **No** |
| **`requestAnimationFrame`** | N/A | No geometry is written per-frame | **No** |
| **`IntersectionObserver`** | N/A | No intersection logic involved | **No** |
| **Lookup Portal / fixed overlay** | Sheet is already `position: fixed` | Already fixed; portal would change nothing about the 88 px jump | **No** |

### Minimal technically justified fix

Make the PDF surfaces use the **same compensation model the text surface already proves works**: hold `.reader-viewport`'s box stable and let chrome overlap or not, instead of moving the box.

Concretely — stop coupling `top` to `chrome-quiet`, and stop toggling `.pdf-viewer-wrap` height. One viable shape is to keep the viewport pinned at `top: var(--reader-header-height)` in both states and accept the header overlapping the freed area, or to inset the *inner* scroll container rather than the viewport. Affected files: `src/styles.mobile-reader.css` (lines 41-48 only).

- **Risk:** this **breaks `e2e/pdf-mode-layout.spec.ts:60-66`**, which asserts `quiet.y === 0` and `before.y === 88`. It may also affect `pdf-mobile-chrome-space.spec.ts`.
- **Regression surface:** PDF chrome geometry, `usePdfScroll`'s `geometryKey` re-navigation path, OCR queue `:has()` height overrides, Lookup open/close on PDF.

### Architectural fix (NOT recommended for the next task)

Unify chrome compensation behind one mechanism — a single `--reader-content-top` custom property consumed identically by text and PDF. This is the structurally correct end state but is a `SHARED_CONTRACT` change across three surfaces and is out of proportion to one symptom.

---

## PART F — RECOMMENDATION

**Smallest technically justified next task — and it is a decision, not an implementation:**

The reported bug **does not exist as a defect on the text surface**, and on PDF surfaces the 88 px movement is **current, deliberate, and asserted by two passing specs**. Fixing it would be a **product behavior change**, not a silent correction.

Therefore the correct next task is a **Planner scoping decision** on:

> Should the PDF chrome-reclaim keep moving the reading viewport by 88 px, or should PDF adopt the text surface's stable-box compensation model?

- If the current reclaim is **intended**, no code change is warranted — the right output is a documentation update recording the accepted behavior.
- If it is **not intended**, the minimal change is confined to `src/styles.mobile-reader.css:41-48`, with the two passing specs updated **deliberately and explicitly** as part of the behavior change.

**Do not implement either path yet.** Before any implementation, the Planner must resolve the `controlsLocked` coupling (R2), because a scroll-direction-only change provably cannot fix the Lookup path.

**Explicitly NOT recommended:** any portal, `svh`/`lvh`, `IntersectionObserver`, or `requestAnimationFrame` work. Each was evaluated and found unnecessary — see `PART E`.

---

## PART G — CONFIRMED FACTS / REPRODUCED BEHAVIOR / ROOT CAUSE / HYPOTHESES / PROPOSED FIX / OUT OF SCOPE

**CONFIRMED FACTS**
- `styles.mobile-reader.css:41-48` toggles `top` and `height` on `chrome-quiet` for PDF surfaces only.
- The shift is exactly 88 px at 320/390/430 and exactly 0 px at 768.
- It is fully reversible and `scrollTop`, page, and percentage are unchanged.
- The text surface shows 0 px shift at 320, 390, and 768.
- `useDialog` uses `preventScroll: true` everywhere.
- `e2e/pdf-mode-layout.spec.ts` and `e2e/pdf-mobile-chrome-space.spec.ts` **pass** and assert the movement.
- `git status --short` is empty at HEAD `9c2a9c0`; no production code was modified.

**REPRODUCED BEHAVIOR**
- Chrome show/hide moves PDF content 88 px at phone widths.
- Opening Lookup on a PDF surface moves content 88 px via the forced reveal.
- Address-bar changes move `dvh` correctly with ≤4 px tracker drift.
- Lookup covers 98.9 % of the PDF content area while open.

**ROOT CAUSE**
- Single cause: **`chrome-quiet` repositions and resizes the in-flow `.reader-viewport` on PDF surfaces** (`styles.mobile-reader.css:41-48`). Amplified by **`App.tsx`'s `controlsLocked`**, which forces the reveal on Lookup open.

**HYPOTHESES**
- OCR queue `:has()` interaction — untested.
- Real-device address-bar collapse and pinch-zoom — untested (Chromium synthetic only).
- Landscape/rotation — untested.

**PROPOSED FIX**
- None implemented. Recommendation is a Planner scoping decision (see `PART F`); the minimal candidate is `styles.mobile-reader.css:41-48` only, with explicit spec updates.

**OUT OF SCOPE**
- All six named Playwright failures (pre-existing, static, unmodified).
- The duplicate `aria-label="Close meaning"` on `.sheet-backdrop` / `.explain-close` — real but minor, and not a layout cause.
- The `100vh` stragglers in `styles.reader-base.css`.
- Any production-code change.

---

## FACT REPORT (role handoff)

TASK
Investigate the reported Mobile Layout Shift / Header-Footer / Lookup interaction issue and determine the actual root cause before any implementation. Investigation only.

## FINDINGS

The reported symptoms are **four independent issues**, not one bug. Only one of them is a real geometry defect, and it is on the **PDF surfaces**, not the text surface.

- **(a) Header/Bottom Toolbar appearing or disappearing during mobile scroll causes content movement** — **CONFIRMED, PDF surfaces only.** Exactly 88 px, deterministic, caused by a deliberate CSS toggle, and currently *asserted as correct* by two passing specs.
- **(b) Mobile browser address-bar changes cause layout movement** — **NOT REPRODUCED as a defect.** `100dvh` tracks the visual viewport correctly; measured movement was ≤4 px and attributable to the scroll tracker, not the height change.
- **(c) Lookup Bottom Sheet/header overlays the reading content** — **BY DESIGN, but overstated in the report.** Measured 98.9 % coverage of the content area on a 390 px phone. It is `position: fixed`, full-bleed, and intentionally modal.
- **(d) Opening/closing Lookup changes the reader's reading position** — **PARTIALLY TRUE, PDF surfaces only.** Opening Lookup forces the chrome to reveal, which shifts content 88 px on PDF. The *persisted* position is correct (page, %, `scrollTop` all stable) — only the rendered position jitters.
- **(e) Existing Playwright geometry failures** — **ALL UNRELATED.** Static geometry/text assertions with no scroll, `chrome-quiet`, or resize dependency. Treated as pre-existing per instruction; not modified, not used as evidence.

The text reader surface is **fully exonerated at every tested width** with hard numeric evidence.

### Root cause (the one confirmed defect)
`src/styles.mobile-reader.css:41-48` couples two toggles to `chrome-quiet`:

```css
.reader-shell.reader-shell[data-reader-surface="original"] .reader-viewport,
.reader-shell.reader-shell[data-reader-surface="reading"] .reader-viewport { position: relative; top: var(--reader-header-height); }   /* :41-42 */
.reader-shell.reader-shell.chrome-quiet[data-reader-surface="original"] .reader-viewport,
.reader-shell.reader-shell.chrome-quiet[data-reader-surface="reading"] .reader-viewport { top: 0; }                                     /* :43-44 */
.reader-shell.reader-shell[data-reader-surface="original"] .pdf-viewer-wrap { height: calc(100dvh - var(--reader-header-height)); }     /* :46 */
.reader-shell.reader-shell.chrome-quiet[data-reader-surface="original"] .pdf-viewer-wrap { height: 100dvh; }                            /* :48 */
```

On quiet engage: `top` goes `88px → 0` **and** `.pdf-viewer-wrap` height goes `712 → 800`. Both move the reading surface. `position: relative` keeps the viewport in flow, so no sibling reflows and no document reflow occurs — but the box is repositioned, so **every visible line inside it moves 88 px**.

The text surface escapes this because it has no such rule. `.reader-shell.reader-shell .reader-text` compensates with static `padding-top: calc(var(--reader-header-height) + 12px)` (= 100 px at 88 px header) under a `position: fixed` header, so the header never occupies flow space and quiet mode only applies `transform`/`opacity`.

**This is not a layout shift by the strict definition** — no reflow, no `scrollTop` change, no document-coordinate change. It is a *deliberate repositioning of an in-flow scroll viewport*. It nonetheless produces exactly the perceived symptom, because the visible content inside the viewport moves.

### Critical finding for the Planner: the jump is asserted, not accidental

Both existing guards **pass today** and **codify the 88 px movement as expected**:

- `e2e/pdf-mode-layout.spec.ts:60-66` — `expect(quiet.y).toBe(0); expect(before.y).toBe(88);` asserts the container rect moves 88 → 0.
- `e2e/pdf-mobile-chrome-space.spec.ts:12-40` — asserts `viewportTop ≈ headerBottom` in the revealed state and that the scroll top stays aligned.

Verified: `2 passed (47.1s)`. Changing this behavior is therefore a **deliberate behavior change with an explicit regression surface**, not a straight bug fix. Do not plan it as a silent correction.

## SUBSYSTEM

Reader chrome / PDF surfaces (`docs/ARCHITECTURE.md` routing → reader + PDF domain).

- `src/reader/ReaderShell.tsx` — sole owner of the transient `chrome-quiet` class. Purely observational: attaches passive listeners, toggles one class. Never touches navigation or geometry. Constants `TAP_MS=450`, `TAP_SLOP=10`, `QUIET_TRAVEL=32`; gate `travel > 32 && top > 40 && now - lastReadingGesture < 1200`.
- `src/app/App.tsx` — renders `.reader-viewport`; passes `controlsLocked={lookupOpen || …}`, which is why opening Lookup forces `setQuiet(false)`.
- `src/styles.mobile-reader.css` — **the defect site** (≤767 px block).
- `src/reader-layout.css:93-110` — tablet/desktop chrome; `position: sticky` header, `--reader-header-height` per breakpoint.
- `src/styles.reader-base.css:116` — `.reader-viewport { transition: margin 200ms ease; }` (mobile-only; disabled at desktop). Not implicated here.
- `src/components/LookupBottomSheet.tsx` — publishes `--lookup-vv-*` from `window.visualViewport`; no portal; `position: fixed` on mobile.
- `src/components/useDialog.ts` — **exonerated**: every `focus()` uses `{ preventScroll: true }`, so the focus trap cannot move the reading position.
- `src/reader/pdf/usePdfScroll.ts` — scroll tracker; passive, rAF-coalesced; has a `geometryKey` re-navigation path that does **not** fire on `chrome-quiet` (confirmed: `scrollTop`, page, and % unchanged across toggles).

## PRESERVE / INVARIANTS AT RISK

- Reading position must survive chrome show/hide, lookup open/close, and address-bar changes. Currently **the persisted position is correct on both surfaces** — a fix must not regress it.
- PDF page indicator, percentage, and `scrollTop` must not change on a chrome toggle (currently true).
- `position: fixed` header + static `padding-top` compensation on the text surface (the invariant that makes the text surface correct).
- `useDialog` `preventScroll` focus behavior.
- The chrome-space contract in `pdf-mobile-chrome-space.spec.ts` (no toolbar gap; `scrollBottom <= height`).
- OCR queue `:has(.pdf-queue-status)` height overrides (`styles.mobile-reader.css:49-51`) — interact with the same `height` declarations.

## CROSS-SUBSYSTEM IMPACT

- **Lookup** — because `controlsLocked` includes `lookupOpen`, every Lookup open on a PDF surface triggers the 88 px shift. A fix that only addresses scroll direction would still leave this path.
- **None beyond reader/lookup/PDF.** No storage, offline, translation, or vocabulary involvement was observed.

## EVIDENCE

Live measurements, dev server `http://127.0.0.1:5173`, 40-page deterministic fixture (`tmp/investigate/probe.pdf`, 80 874 bytes, from `e2e/pdfFixture.ts`).

**PDF Original — class toggled directly at pinned `scrollTop`, 390×800:**

| Probe | `quiet` | `.reader-viewport` `top` | viewport h | `scrollTop` | page slot `rect.top` | page |
|---|---|---|---|---|---|---|
| quiet=OFF | false | `88px` | 712 | 1500 | −1408.0 | 8/40 |
| quiet=ON | true | `0px` | 800 | 1500 | −1496.0 | 8/40 |
| quiet=OFF 2 | false | `88px` | 712 | 1500 | −1408.0 | 8/40 |
| quiet=ON 2 | true | `0px` | 800 | 1500 | −1496.0 | 8/40 |

Fully reversible, exactly −88 px, `scrollTop` and page unchanged.

**Width sweep — same toggle, Original surface, `scrollTop` pinned at 3000:**

| Width | `--reader-header-height` | mobile block applies | content shift | viewport height changed |
|---|---|---|---|---|
| 320 | `calc(88px + 0px)` | yes | **100.8 px** | yes (712→800) |
| 390 | `calc(88px + 0px)` | yes | **92 px** | yes (712→800) |
| 430 | `calc(88px + 0px)` | yes | **88 px** | yes (712→800) |
| 768 | `152px` | **no** | **0 px** | **no** (600→600) |

768 px is above the ≤767 px block, so the toggle rule never applies → **zero shift**. This is the clean discriminator proving the mobile block is the cause.

**Isolation of the residual (390 px, careful measurement):** `slotHeights` delta 0, `pageWidths` delta 0, `scrollHeight` delta 0, `wrapH` delta −88, `scrollTop` delta −4. At **320 px** the same toggle four times gave `scrollTop` delta **0** and slot top delta **exactly −88** with `clientH` delta +88. Conclusion: the mechanism is a single clean **88 px** offset. The larger 92/100.8 figures in the sweep were transient `scrollTop` drift from the `usePdfScroll` rAF tracker settling after a programmatic assignment, **not a second cause**. Single root cause.

**PDF Reading Mode — same result:** `probeRectTop` 2523.1 (quiet off) → 2435.1 (quiet on), `scrollTop` pinned at 2000, `offsetTop` unchanged at 4435. `pdf-reading-view` height does not toggle; only `top` does.

**PDF Reading Mode — real wheel scroll:** `quiet` engaged at `scrollTop` 1172, `headerTransform matrix(1,0,0,1,0,-88)`, viewport `top` `88px → 0px`, `page4_docY` 4523.1 → 4435.1 (**88 px**).

**Text surface — anchor document Y (`rect.top + scrollY`), 390 px, real wheel scroll:**

| Probe | `anchorDocY` | `scrollY` | `quiet` | `headerTransform` |
|---|---|---|---|---|
| initial | 1881.25 | 0 | false | `none` |
| wheel down 1600 | 1881.25 | 920 | **true** | `matrix(1,0,0,1,0,-88)` |
| wheel up back | 1881.25 | 0 | false | `none` |
| wheel down again | 1881.25 | 460 | **true** | `matrix(1,0,0,1,0,-88)` |

`anchorDocY` and `docHeight` (6104) constant throughout. Every rect delta was a pure function of `scrollY` — normal scrolling.

**Text surface — quiet toggle at pinned scroll, 320 and 768:**

| Width | viewport `position` | `top` | `padding-top` | header `position` | content shift |
|---|---|---|---|---|---|
| 320 | `static` | `auto` | 100px | `fixed` | **0** |
| 768 | `static` | `auto` | 32px | `sticky` | **0** |

**Lookup on PDF Original, 390 px — the `controlsLocked` interaction:**

| Probe | `quiet` | viewport `top` | viewport h | probe `rect.top` | `scrollTop` | page | sheet |
|---|---|---|---|---|---|---|---|
| before lookup | true | `0px` | 800 | −956.9 | 1381.6 | 4/40 | — |
| word selected | true | `0px` | 800 | −956.9 | 1381.6 | 4/40 | — |
| **Lookup open** | **false** | **`88px`** | **712** | **−868.9** | 1381.6 | 4/40 | `side-panel expanded`, top 96, h 704 |
| scroll in sheet | false | `88px` | 712 | −868.9 | 1381.6 | 4/40 | unchanged |
| after close | false | `88px` | 712 | −868.9 | 1381.6 | 4/40 | — |

Content moves **down 88 px** when Lookup opens. `scrollTop` and page unchanged. Sheet covers **98.9 %** of the `.reader-viewport` content area; `position: fixed`.

**Address-bar simulation, PDF Original, 390 px:**

| Label | `innerHeight` | `visualViewport.height` | viewport h | `scrollTop` | page | slot `rect.top` |
|---|---|---|---|---|---|---|
| expanded | 800 | 800 | 712 | 3000 | 8/40 | −2487.3 |
| collapsed | 700 | 700 | 612 | 3004 | 8/40 | −2491.3 |
| restored | 800 | 800 | 712 | 3004 | 8/40 | −2491.3 |

`100dvh` tracks correctly. The 4 px delta matches the observed `scrollTop` tracker drift and is **not** a layout shift.

**Existing specs (run, not modified):**
```
npx playwright test e2e/pdf-mobile-chrome-space.spec.ts e2e/pdf-mode-layout.spec.ts --project=mobile-chromium
  2 passed (47.1s)
```
`e2e/pdf-mode-layout.spec.ts:60-66` asserts `quiet.y === 0` and `before.y === 88`. `e2e/pdf-mobile-chrome-space.spec.ts:12-40` asserts `viewportTop ≈ headerBottom` and `pageTop - scrollTop <= 5` in the revealed state.

**Repo state:** `git status --short` empty at HEAD `9c2a9c0`. No production file modified during this investigation.

## CHANGE CLASS HINT

`SUBSYSTEM_LOGIC` — reader/PDF chrome geometry, not presentation-only: the `top` and `height` toggles are load-bearing and currently asserted by two passing specs. Touches `styles.mobile-reader.css` and its regression guards. Planner makes the final call.

## VERIFICATION HINT

Follow `docs/testing.md` and `docs/verification-map.md`. Relevant surface: `verify:pdf` (typecheck + `vitest run src/reader/pdf src/reader/pdf-reading src/documents/pdf`), `check:css`, and the two mobile Chromium specs above. Browser E2E is required here because the defect is only observable at ≤767 px in a live viewport — Vitest cannot see a CSS breakpoint toggle. Canonical policy: [`docs/agent-execution-rules.md` §4, §8](../agent-execution-rules.md).

## OPEN QUESTIONS / RISKS

- **Behavior change vs. bug fix — Planner decision required.** Two passing specs currently *require* the 88 px movement. Removing it will fail `pdf-mode-layout.spec.ts:60-66` by design, not by regression. The Planner must decide whether the product intent is "reclaim header space with a stable viewport" (behavior change) or "keep the current reclaim" (no change at all — the report is then a documentation of accepted behavior).
- **The Lookup path is coupled to the same defect** and will not be fixed by a scroll-direction-only change, because `controlsLocked` forces the reveal.
- **OCR queue interaction untested.** `styles.mobile-reader.css:49-51` overrides `height` on the same elements via `:has(.pdf-queue-status)`. Whether the quiet toggle misbehaves with an active OCR queue is **not verified**.
- **Real touch devices untested.** All measurements come from Chromium `mouse.wheel` + synthetic pointer events. A physical-device address-bar collapse and `visualViewport` pinch-zoom could differ. `--lookup-vv-scale` in particular was only observed at `scale: 1`.
- **Rotation / landscape untested** (`[640, 360]` appears in the chrome-space spec but was not measured here).
- **Secondary accessibility finding:** `.sheet-backdrop` and `.explain-close` both carry `aria-label="Close meaning"`, causing a Playwright strict-mode violation on `getByRole('button', { name: 'Close meaning' })`. Real but minor; out of scope for layout shift.