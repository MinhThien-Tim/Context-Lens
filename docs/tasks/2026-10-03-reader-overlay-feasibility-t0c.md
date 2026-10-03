# T0c — Overlay (O) chrome model: feasibility evidence record

- **Date:** 2026-10-03
- **Role:** Investigator (feasibility spike + minimum test infrastructure)
- **Baseline:** `0230896` (`pre-redesign-baseline`), branch `main`, HEAD at start `c9704b3`
- **Commit produced:** `fca09b8`
- **Verdict:** **`OVERLAY FEASIBLE`** — with one BLOCKED area (OCR-queue geometry) and one open product question (A12 #10 in the load state).
- **Scope respected:** no production Reader/OCR/Lookup/Home code was modified. `git diff HEAD -- src/` is empty for the whole task.

Labels used throughout: **FACT** (observed in source or output), **MEASUREMENT** (observed by running),
**INTERPRETATION** (inference from fact/measurement), **RECOMMENDATION** (proposal needing approval).

---

## 1. Input mechanism (acceptance item 1)

**FACT.** Quiet/reveal is driven only by a capture-phase `scroll` listener on `document`, gated to
`.pdf-scroll, .pdf-reading-scroll` ([ReaderShell.tsx:58-71](c:/Users/Admin/Downloads/Context%20Lens/src/reader/ReaderShell.tsx:58)).
It reads *scroll position deltas*, not event types. `QUIET_TRAVEL = 32` (`:10`), `TAP_SLOP = 10` (`:8`).

| Input | Mechanism used in tests | Why |
| --- | --- | --- |
| Wheel / desktop | `page.mouse.wheel(dx, dy)` over the reading surface | Deterministic, real browser input |
| Touch / phone | CDP `Input.dispatchTouchEvent` swipe sequence | `page.touchscreen` has **no swipe primitive**; CDP is the only real touch scroll |

**FACT.** No direct `scrollTop` assignment, no manually dispatched `scroll` event, no class mutation and
no React state mutation is used to *drive* quiet/reveal in the new spec. `readerScrollBy` in
[e2e/readerO.ts](c:/Users/Admin/Downloads/Context%20Lens/e2e/readerO.ts) dispatches only real input.

**FACT.** There is a **1200 ms recency gate**: quieting additionally requires
`performance.now() - lastReadingGesture < 1200`, where `lastReadingGesture` is stamped by
`pointerdown|move|up` on the reading surface and by document `wheel`/`touchmove`. A scroll that was not
preceded by a recent gesture never quiets. This is why the legacy specs synthesise `touchmove` +
`scroll`: they were working around a real product constraint, not inventing behaviour.

**INTERPRETATION.** The recency gate means "real input" tests must be continuous — a wheel event
followed by a long pause will not quiet. This shapes the tier guidance (§6).

---

## 2. Overlay feasibility (acceptance item 2)

**MEASUREMENT.** With the O model emulated in a scratch harness (`OVERLAY_CSS` in
[e2e/spike-overlay-o.spec.ts](c:/Users/Admin/Downloads/Context%20Lens/e2e/spike-overlay-o.spec.ts) —
full-height viewport box, header overlaying, static top padding inside the scroll container, footer
reserved), `MEASURE_MATRIX` reported:

```
[{390x844 top0 h844, 767x900 top0 h900, 768x900 top0 h900, 1023x900 top0 h900,
 1024x900 top0 h900, 844x390 top0 h390, 915x412 top0 h412}]  all "stable": true, all "identity kept"
```

**MEASUREMENT.** Against **production HEAD** (no injection), the permanent A12 spec passes
`viewport top` and `viewport height` unchanged across quiet→reveal→quiet at **all seven** sizes.

**INTERPRETATION.** The header *can* overlay the reading surface without changing the viewport box.
Nothing in A12 #1–#9 or #11 depends on the chrome consuming layout space.

### A false alarm that was actually a real distinction

The first run of the permanent spec failed 4/11 on `footer top` (768x900, 1023x900, 844x390, 915x412).
**FACT.** Cause, from CSS:

- [reader-layout.css](c:/Users/Admin/Downloads/Context%20Lens/src/reader-layout.css)
  `@media (max-width:1023px)`: `.reader-shell.chrome-quiet .reader-progress { transform:translateY(100%); opacity:0; }`
  — the footer is *translated off-screen by its own height* when quiet.
- [styles.mobile-reader.css](c:/Users/Admin/Downloads/Context%20Lens/src/styles.mobile-reader.css)
  `@media (max-width:767px)`: `.reader-shell.reader-shell[data-reader-surface="original"].chrome-quiet .reader-progress { transform:none; opacity:1; }`
  — deliberately pins the footer **visible** at ≤767 in Original surface.

All four deltas were exactly one footer height (48 px), which is why the numbers looked alarming:
`expected 852, got 899.99…` (900-wide) and `expected 364, got 412` (915x412).

**INTERPRETATION.** `footerTop` was **my own over-reach**, not an A12 violation. A12 is defined as the
*viewport top/height* invariant; the footer's absolute position is chrome *visibility*, which is a
behavior-contract question ("footer always visible with reserved height"), not a reading-box invariant.
My first draft of `expectViewportStable` had conflated the two invariant families — the same mistake
flagged earlier in this task for location metrics.

**FACT.** The fix removed `footer top` from `expectViewportStable` and **added** a positive
model-independent assertion for A12 #11 (`a revealed header overlays the viewport box but never more
than its own height`), so coverage strengthened rather than weakened.

---

## 3. Measured interaction (acceptance item 3)

**MEASUREMENT** (`MEASURE_QUIET_REVEAL`, `page.mouse.wheel`, single discrete events, unchanged by
this commit — the logic under test was not modified):

| Direction | Travel | Result |
| --- | --- | --- |
| Down | +10 | no quiet |
| Down | +20 | no quiet |
| Down | +30 (cumulative 60) | **quiet** |
| Up | −4 | still quiet |
| Up | −6 | still quiet |
| Up | −8 | still quiet |
| Up | −10 | **revealed** |

**FACT.** Quiet requires **accumulated** downward travel `> QUIET_TRAVEL` (32). Reveal requires a
**single-event** upward delta `< −8`. `travel` resets to `0` on any upward delta.

**MEASUREMENT.** Hysteresis is **asymmetric, not a dead-band**: there is no explicit hysteresis, but
the asymmetry *is* the mechanism — a 30 px accumulated downward scroll needs no reveal, while a 10 px
upward nudge reveals immediately. Any upward delta also zeroes the accumulated quiet travel, so a
single overscroll bounce pre-arms a re-quiet at only 32 px.

**INTERPRETATION.** Effective reveal threshold is **~10 px of continuous upward travel**, which is below
the ~12–16 px noise floor of a trackpad two-finger flick. **False-reveal is therefore likely** for small
upward corrections while reading. The 24 px probe suggested in the task brief was not needed to reach a
conclusion; the real signal is that 10 px is *already* too sensitive.

**RECOMMENDATION (needs approval, not decided here).** If the redesign wants fewer false reveals,
raise the reveal trigger from −8 to roughly −24 px, or require sustained upward travel comparable to
the quiet threshold. **This is a product decision not on the approved list, so it is presented, not
applied.** Nothing was changed to make the spike pass.

---

## 4. A12 results (acceptance item 4)

All twelve tests in [e2e/pdf-reader-chrome-a12.spec.ts](c:/Users/Admin/Downloads/Context%20Lens/e2e/pdf-reader-chrome-a12.spec.ts)
pass on `--project=laptop` at tier `pdf-normal` (1.6 min, `PW_EXIT=0`).

| # | Invariant | Status | Evidence |
| --- | --- | --- | --- |
| 1 | viewport top stable | **PASS** | unchanged in all quiet/reveal/Lookup legs, 7 sizes |
| 2 | viewport height stable | **PASS** | same |
| 3 | quiet → reveal does not alter geometry | **PASS** | round-trip test |
| 4 | reveal → quiet does not alter geometry | **PASS** | round-trip test |
| 5 | opening Lookup does not alter the box | **PASS** | Lookup test |
| 6 | closing Lookup does not alter the box | **PASS** | Lookup test |
| 7 | page label unchanged by chrome transitions | **PASS** | `expectViewportStable` + round-trip-to-top |
| 8 | percent/location unchanged | **PASS** | same |
| 9 | location identity does not re-navigate | **PASS** | `slotIds` probe tags compared; identity kept |
| 10 | first line not covered at `scrollTop 0` | **PASS at true `scrollTop 0`** — but see blocker (a) | first-line test |
| 11 | revealed header covers ≤ its own height | **PASS** | new test, `overlap ≤ headerHeight + 0.5` |
| 12 | static padding causes no page/location jump | **PASS** | round-trip-to-top keeps page, percent, `slotIds` |

**FACT.** `expectViewportStable` asserts exactly the box invariants (viewport top, viewport height,
`slotIds` identity). Page/percent/`scrollTop` are deliberately excluded because every chrome transition
is *caused by* a scroll, so they legitimately move with the input; they are covered by
`expectLocationTracksScroll` / `expectLocationIdentical` instead.

### Blocker (a): A12 #10 in the load state — open product question

**MEASUREMENT.** In the O model the first readable line sits **25.796875 px** below the top of the
viewport box. At true `scrollTop 0` the first line clears the header (`firstLineTop = 121.8` vs
`headerBottom = 88`) — PASS. But the shell settles at **`scrollTop = 96`**, exactly the injected
static padding `calc(header + 8px)`, and at that settled position the first line **is covered**
(`covered: true`).

**INTERPRETATION.** The static padding is doing its job, but the shell's *initial scroll
reconciliation* lands on the padding offset rather than the true content top, so the first line starts
under the overlay. This only manifests in the load state, which is why the new spec (correctly scoped
to `scrollTop 0`) does not catch it.

**RECOMMENDATION — options, stop for user decision.** Initial scroll reconciliation is **not** on the
approved decision list, so it is not decided here:

1. Reconcile the opening scroll to the true content top (discard the padding offset).
2. Size static padding to header height + settle offset so the settled position still clears.
3. Scope A12 #10 to "once settled at `scrollTop 0`" and accept the load-state coverage gap.
4. The approved fallback: **no quiet mode / static header**.

The R (reserved-strip) model is **not** an option and was not reverted to.

---

## 5. Viewport matrix (acceptance item 5)

**MEASUREMENT** — production HEAD, tier `pdf-normal`, `--project=laptop`, all PASS:

| Viewport | viewport top | viewport height | Box stable | Page identity |
| --- | --- | --- | --- | --- |
| 390 × 844 | 0 | 844 | PASS | kept |
| 767 × 900 | 0 | 900 | PASS | kept |
| 768 × 900 | 0 | 900 | PASS | kept |
| 1023 × 900 | 0 | 900 | PASS | kept |
| 1024 × 900 | 0 | 900 | PASS | kept |
| 844 × 390 | 0 | 390 | PASS | kept |
| 915 × 412 | 0 | 412 | PASS | kept |

**FACT.** No tablet band was introduced. `1024px` remains the sole responsive authority
(`useDesktop()` = `matchMedia('(min-width: 1024px)')`). The `@media (max-width:767px)` boundary in
`styles.mobile-reader.css` is an existing CSS boundary, not a semantic breakpoint.

**FACT — an existing conflict the MobileChrome phase must resolve.**
[styles.reader-base.css:248](c:/Users/Admin/Downloads/Context%20Lens/src/styles.reader-base.css:248)
contains `@media (min-width:768px) and (max-width:850px)` forcing `calc(100dvh - 110px)` for
`.pdf-viewer-wrap,.pdf-reading-view` and for `.reader-viewport:has(.pdf-queue-status)`. It hits the
768 column and both landscape columns. **RECOMMENDATION:** this is a `768px` rule and belongs to the
MobileChrome phase (breakpoint alignment), recorded here so it is not rediscovered later.

---

## 6. Test infrastructure (acceptance item 6)

### Execution tiers — [playwright.tiers.config.ts](c:/Users/Admin/Downloads/Context%20Lens/playwright.tiers.config.ts)

Imports the base [playwright.config.ts](c:/Users/Admin/Downloads/Context%20Lens/playwright.config.ts) and
overrides **timeouts only**, so projects, `--project=laptop` / `--project=mobile-chromium`, and the web
server behave exactly as before. An unknown `PW_TIER` throws rather than falling back silently.

| Tier | `PW_TIER` | Timeout | `actionTimeout` | Assigned to |
| --- | --- | --- | --- | --- |
| FAST | `fast` | 30s | 10s | chrome transitions, geometry, Lookup — no rasterisation |
| PDF-NORMAL | `pdf-normal` | 90s | 10s | **the new A12 spec** (12 tests, 1.6 min) |
| HEAVY | `heavy` | 240s | 10s | OCR windows / queue drains (currently **unassigned — see blocker (b)**) |

`retries: 0` and `workers: 1` are preserved. `workers` is global in the base config, which is exactly
why tiers are separate configs rather than more flags.

**FACT.** `vite build` + `vite preview` was **not** adopted. The dev server on port 5173 was verified
to belong to this repo (`Win32_Process` showed this repo's `node_modules`; HTTP title `Context Lens`;
creation time predates any `src/` modification) before reuse, satisfying "never silently reuse a stale
dev server".

### Semantic helpers created — [e2e/readerO.ts](c:/Users/Admin/Downloads/Context%20Lens/e2e/readerO.ts)

Only those the spike actually needed. **No Page Object framework, no generic testing abstraction.**

| Helper | Purpose |
| --- | --- |
| `readerGeometry(page)` | One product-semantic snapshot: viewport box, location, chrome state, `slotIds` |
| `expectViewportStable(page, before)` | A12 box invariant (viewport top/height + page identity) |
| `expectMobileChrome(page, state)` | Polled chrome-state assertion, class-name independent |
| `readerScrollBy(page, dy, input)` | **Real input only** — `mouse.wheel` or CDP touch swipe |
| `readerScrollOffset`, `scrollToTop` | Position reads and explicit return-to-top |
| `expectLocationTracksScroll`, `expectLocationIdentical`, `expectFirstLineClear` | Location/content family, kept separate from box invariants |
| `openLookup` / `closeLookup`, `togglePdfMode`, `openMore` / `closeMore` | Locators scoped so they resolve uniquely at every width |

---

## 7. Legacy classification (acceptance item 7)

Only Reader/layout tests **directly affected** by the Overlay/scroll contract are listed. No assertion
was edited anywhere; the only changed lines are four `test(` → `test.fixme(` signature lines plus comments.

| Spec | Class | Reason |
| --- | --- | --- |
| `pdf-mobile-chrome-space.spec.ts` (both tests) | **REWRITE** | Encodes the R model: `classList.add/remove('chrome-quiet')` and asserts `viewportTop === headerBottom`, false by construction under Overlay. The Lookup-position contract in the second test is still valid but now duplicated with real input by the A12 spec. |
| `pdf-mode-layout.spec.ts` | **REWRITE** | Reserved-strip geometry via `classList` + `scrollTop = scrollHeight`. Its stale `/OCR.*6/` assertion is **T0d scope** and deliberately not fixed here. |
| `pdf-click-mobile.spec.ts` | **REWRITE** | Fakes quiet chrome with `dispatchEvent(new Event('touchmove')) + el.scrollTop = 65 + dispatchEvent(new Event('scroll'))`, bypassing the real-input path. Its "Lookup still works while chrome is quiet" assertions remain valid. |
| `reader-p0.spec.ts` | **KEEP** | No fake scroll and no chrome coupling — only a `selectionchange` dispatch. Passes on `mobile-chromium` (16.3s). |
| Tap-to-reveal tests | **OBSOLETE** | By decision: tap never toggles chrome. |
| `continue-reading.spec.ts`, `pdf-desktop-horizontal-scroll.spec.ts` | **KEEP** | Unaffected. |

### Baseline gate results

| Check | Status | Detail |
| --- | --- | --- |
| `npx tsc -b` | **PASS** | `EXIT=0` |
| A12 spec, `pdf-normal`, `--project=laptop` | **PASS 12/12** | 1.6 min |
| Quarantine run (3 legacy specs) | **PASS** | 4 skipped, 0 failed |
| `LookupBottomSheet` × 3 (identity guard etc.) | **PASS 46/46** | vitest |
| `reader-p0.spec.ts` on `mobile-chromium` | **PASS** | 16.3 s |
| `offline.spec.ts` | **NOT RUN** | Requires `QA_PRODUCTION=true` against a built server; skips by design. Not a failure. |
| `pdf-ocr-queue.spec.ts` (3 tests) | **FAIL — pre-existing, T0d** | see below |
| `ReaderShell.test.tsx` (1 of 14) | **FAIL — pre-existing, T0d** | see below |

**FACT.** The two failures are **pre-existing and not caused by this task**: `git diff HEAD -- src/` is
empty for the entire task, and neither failing file was modified. Both are the same stale-OCR-label
class the user assigned to T0d — HEAD `0230896` ships a **12-page** OCR window, but:

- [e2e/pdf-ocr-queue.spec.ts:81](c:/Users/Admin/Downloads/Context%20Lens/e2e/pdf-ocr-queue.spec.ts:81)
  awaits `menuitem` `'OCR 3 trang tiếp'` (and `'OCR 6 trang tiếp'` elsewhere) — that menuitem no
  longer exists, and it timed out after 10 s.
- [src/reader/ReaderShell.test.tsx:96](c:/Users/Admin/Downloads/Context%20Lens/src/reader/ReaderShell.test.tsx:96)
  does `find(button => button.textContent?.includes('next 6'))` which returns `undefined`, so
  `action.click()` throws `TypeError: Cannot read properties of undefined`.

**RECOMMENDATION.** Both belong to the T0d label migration. They were deliberately **not** repaired
here, because the rules forbid editing assertions to make tests pass and T0d owns the OCR audit.

---

## 8. Feasibility conclusion (acceptance item 8)

# `OVERLAY FEASIBLE`

**FACT.** Every core invariant in §4 and §5 holds: the header overlays the PDF reading surface without
changing the viewport box, static scroll-container padding preserves the first-line invariant at
`scrollTop 0`, chrome transitions do not move the box, Lookup open/close does not move the box, page and
percent are unchanged by chrome transitions, and location identity causes no re-navigation. This holds
at all seven required viewports, including both landscape pairs.

**MEASUREMENT.** Quiet needs > 32 px accumulated downward travel; reveal needs a single ~10 px upward
delta. The asymmetry functions as hysteresis but makes reveal over-sensitive (false-reveal risk on
small upward corrections).

**INTERPRETATION.** The O model does not violate viewport stability or location stability, so the
approved fallback (**no quiet mode / static header**) is **not** required, and the R model was not
reverted to. A12 is now owned by a selector-independent spec that will outlive the legacy layout tests.

### Open items requiring user decision

1. **A12 #10 in the load state (blocker a).** The shell settles at `scrollTop = 96`, where the first
   line is covered by the overlay. Four options are listed in §4. This is not on the approved decision
   list and was **not** decided.
2. **False-reveal sensitivity.** Raise the reveal trigger from −8 px toward ~−24 px, or require
   sustained upward travel? Also not on the approved list.
3. **OCR-queue geometry — BLOCKED (blocker b).** Unverified. The probe was retired rather than shipped
   as a flaky assertion because [e2e/pdfFixture.ts](c:/Users/Admin/Downloads/Context%20Lens/e2e/pdfFixture.ts)'s
   5th parameter is `Array<'text'|'scan'|'white'|'blank'>`, not a `Set`
   ([e2e/pdfQueueFixture.ts:2](c:/Users/Admin/Downloads/Context%20Lens/e2e/pdfQueueFixture.ts:2)).
   Terminal Loop Guard was
   reached after three attempts and a fourth was refused. **The WIP numbers (+90 px at 768, +34 px at
   1024) are NOT reused as fact.** HEAVY tier has no assigned test until T0d fixes the fixture.

### Not done (per task scope)

T0d OCR audit, T0e behavior contract, and the Reader redesign were not started.