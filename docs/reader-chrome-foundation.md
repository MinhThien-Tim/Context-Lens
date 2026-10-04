# Reader Chrome Foundation

Purpose: the implementation-facing specification for the **ChromeFoundation** phase of the Reader
redesign — the single responsive authority and the Reader Chrome shell architecture that later phases
build on.

Authority order:

1. [reader-behavior-contract.md](reader-behavior-contract.md) — the frozen product contract. It is the
   source of truth for **what** the Reader does. This document never redefines it.
2. This document — **where** the foundation lives in code and which rule is enforced where.
3. [ui-system.md](ui-system.md) — navigation for the wider UI, including the Reader layout map.

Related decisions: [tasks/2026-10-04-reader-behavior-contract-decisions-t0e.md](tasks/2026-10-04-reader-behavior-contract-decisions-t0e.md)
(U1–U8). Behavior superseded by the contract is marked **OBSOLETE** below rather than deleted, so the
removal stays auditable.

## 1. Scope of this phase

In scope — the foundation only:

| ID | Item | Status here |
| --- | --- | --- |
| §1.1–§1.4 | 1024 px as the sole Reader responsive boundary | **ENFORCED** |
| §4.1–§4.5 | Two chrome states, visual-only quiet, Mobile-only quiet | **ENFORCED** |
| §5.0–§5.5 | Input semantics and which inputs may quiet/reveal | **ENFORCED** |
| §6.0–§6.8 | Reveal constants, hysteresis, focus escape, reveal-only control | **ENFORCED** |
| §2.1 | Simple/Advanced as disclosure modes of one architecture | **UNCHANGED, asserted** |
| §2.4 | No FAB, no Search, no Form Fill | **CONFIRMED ABSENT** |

Explicitly **out of scope** — later phases, not implemented here:

- MobileChrome: Header secondary actions (§7.2), the 768–1023 unstyled band (D5), width caps (D6),
  the single More disclosure at 320 px and ≥1024 px (§9), reveal-control placement (§6.9 — contract
  records this as OPEN).
- Responsive/Geometry: the dead `768–850 px` block in `styles.reader-base.css` (O9) is **deleted in
  that phase**, not re-targeted here.
- PDF/OCR controls: U2 OCR-next relocation, U3 direct Footer zoom, `.pdf-more` popup (D12), the
  6-vs-12 preload defect (D3), 3/6-page strings (O8), terminal OCR states.
- Lookup/Overlay, Home, Cleanup: see the handoff tables in the T0e decision record.

## 2. Responsive authority

- `useDesktop()` (`src/components/useDesktop.ts`) is the sole Reader responsive authority. It
  subscribes to exactly one query, `matchMedia('(min-width: 1024px)')`.
- `≤1023 px` = Mobile presentation. `≥1024 px` = Desktop presentation. Both bounds are inclusive.
- **No tablet band exists.** 768–1023 px is Mobile presentation. There is no 768 px Reader media
  query left in TypeScript, so 768–1023 cannot form a separate layout semantically (contract §1.4
  requires removal of the 768 assumption, not retargeting it).
- Chrome quiet is available **only** below 1024 px (§4.3). `ReaderShell` returns early from the
  observer when `desktop` is true, so a desktop reader has no quiet state at all.
- CSS is a separate concern from this authority. `styles.mobile-reader.css` still scopes to
  ≤767 px, which leaves 768–1023 without mobile presentation styling; that is defect **D5**, owned by
  MobileChrome and deliberately left unpatched here so this phase cannot be read as a redesign.

## 3. Reader architecture

- `ReaderShell` (`src/reader/ReaderShell.tsx`) is the one Reader chrome architecture for both
  presentations and both densities. Simple/Advanced are `data-interface-mode` disclosure modes of that
  single architecture, not separate trees.
- **OBSOLETE:** a separate Mobile or Desktop Reader implementation, and `ReaderFab` as an alternative
  architecture. `ReaderFab.tsx` and any Reader FAB do not exist; `Reader Search` and Form Fill do not
  exist. Do not reintroduce them.
- `ReaderShell` owns only transient chrome **visibility**. It observes existing scroll and gesture
  events; it never navigates, never writes location, and never triggers layout measurement (§2.5).
- Ownership boundaries for later phases, established here: the Header is `ReaderToolbar`'s
  `<header class="reader-header">`; the Footer is `ReaderProgress`'s
  `<footer class="reader-progress">`. Moving controls between them is MobileChrome / PDF-OCR work.

## 4. Chrome model

Two states only, `quiet: boolean` (§4.1):

- **Quiet** — `.chrome-quiet` on the shell root. Header/footer leave the reading surface.
- **Revealed** — no `.chrome-quiet`.

Rules enforced in `ReaderShell`:

| Rule | Enforcement |
| --- | --- |
| §4.2 quiet/reveal is visual only | The observer never writes geometry: no style, class or token change on the scroll surface, no `scrollTop` write, no reflow trigger |
| §4.3 quiet is Mobile-only | Early return when `desktop`; no observer, no quiet state |
| §4.4 never quiet with a blocking overlay, open panel or locked controls | Early return for `controlsLocked`, `contentsOpen`, `contextOpen`; a live selection or any `OVERLAY_OPEN` surface zeroes travel and suppresses the transition |
| §4.5 never quiet during load or restoration | Programmatic scroll contributes no travel (§5.1/§5.2) |

`OVERLAY_OPEN` lists the surfaces that block quieting: `.reader-more-menu`, `.pdf-reading-options`,
`.pdf-more-menu`, `.pdf-reading-selection-wrap`, `.pdf-reading-selection-actions`,
`.selection-actions`.

## 5. Input semantics

Only these inputs may quiet or reveal chrome (§5.1):

| Input | May quiet / reveal? |
| --- | --- |
| Real user scroll (wheel, touch drag, paging keys) | **Yes**, subject to §6 |
| Programmatic scroll, page jump, zoom, mode change, geometry reconciliation, saved-position restoration | **Never** |
| Tap, click, double-tap, long-press | **Never** (§5.3) |

- Real input is established by a `wheel`, `touchmove` or paging key over the reading surface
  (`.reader-viewport`, `.pdf-scroll`, `.pdf-reading-scroll`, `[data-reader-text]`) within the gesture
  window. Programmatic scroll therefore never accumulates travel (§5.2).
- Wheel and touch use identical thresholds (§5.4).
- Tests must not synthesize scroll events to satisfy a user-visible requirement (§5.5): use real input
  or the sanctioned real-input e2e spec.

## 6. Reveal constants and hysteresis

| Constant | Value | Meaning |
| --- | --- | --- |
| `CHROME_TRAVEL` | `32` px | Accumulated travel in **either** direction that commits a transition (§6.0/§6.1). One constant, opposite directions |
| `CONTENT_TOP` | `40` px | At or above this `scrollTop`, chrome is always revealed with no threshold (§6.0) |
| `CHROME` | `.reader-header,.reader-progress,.reader-reveal` | Real Reader chrome; focus entering it reveals (§6.4) |

- **§6.2 reset before apply.** A direction change resets both accumulators *before* the new delta is
  applied, so travel never mixes directions.
- **§6.3 accumulated total only.** Quiet requires `downTravel ≥ 32` **and** `top > CONTENT_TOP`.
  Reveal requires `upTravel ≥ 32`, or `top ≤ CONTENT_TOP`. A single-event delta of any size never
  reveals.
- **OBSOLETE:** the `delta < -8` single-event reveal threshold. T0c measured upward deltas of −4, −6
  and −8 px leaving chrome quiet while −10 px revealed it, so small upward corrections caused false
  reveals. Removed in this phase; symmetric accumulation replaces it.
- The earlier `top < 40` comparison is now `top ≤ 40`, so the content-top reveal covers the exact top.
- §6.4 focus escape: `onFocusCapture` reveals only when focus enters real Reader chrome. Focusing the
  reading surface, page content or selection handles never reveals. Leaving chrome returns to the
  prior state rather than forcing quiet.
- **OBSOLETE:** the `.pdf-page` / `.pdf-reading-scroll` reveal exemption and its pointer-event
  classifier (`TAP_MS = 450`, `TAP_SLOP = 10`, four pointer listeners). Removed; tap never reveals.
- §6.5/§6.6 escape control: `<button class="reader-reveal" aria-label="Show reading controls">`,
  rendered only while quiet, persistently reachable by keyboard and assistive technology. It is
  **reveal-only**: no `aria-haspopup`, no `aria-expanded`, not a toggle, not a FAB, not a menu, not a
  popup, and it disappears once chrome is revealed. It is not the default interaction (§6.7).
- §6.8 prohibited escapes: tap, double-tap, long-press, edge swipe, Back, idle timeout, and any
  automatic or timed reveal. Do not add them.

## 7. Load and position lifecycle (§5.0)

`open → geometry reconciliation at scrollTop=0 → settle → optional saved-position restoration`

- `scrollTop=0` is the **reconciliation reference point**, not a guaranteed final position.
- The initial `scrollTop=0` invariant is evaluated on its own: after reconciliation and settlement the
  first readable content must not be covered by the overlaid Header.
- Saved-position restoration, when a saved position exists and restoration applies, happens **after**
  settlement and is evaluated separately from the `scrollTop=0` invariant.
- **OBSOLETE:** any permanent content padding, reserved header strip, or static height workaround used
  to make the header safe. Overlay O is unchanged: the Header overlays the reading surface, and static
  top padding lives inside the scroll container.

This phase does not change the loading or restoration code paths; it records the lifecycle so the
ChromeFoundation assertions (§8) and the later Responsive/Geometry phase stay consistent.

## 8. Foundation test obligations

`src/reader/ReaderShell.test.tsx` covers the foundation. Assertions are on observable behavior —
roles, labels, accessible names and visible state — not on implementation structure.

| Test | Contract |
| --- | --- |
| `quiets mobile chrome after real accumulated travel and reveals it again without moving content` | §4.2, §6.1, §6.3, A12 |
| `keeps 1024px as the sole responsive authority and never has a tablet band` (767 / 768 / 1023 / 1024) | §1.1, §1.2, §1.4, §4.3 |
| `reveals chrome only after accumulated upward travel, not for a single small correction` | §6.2, §6.3 |
| `never reveals or quiets chrome from a tap, and exposes only a reveal-only escape control` | §5.3, §6.5, §6.6 |
| `reveals chrome when focus enters chrome and not when focus enters the reading surface` | §6.4 |
| `keeps controls visible on desktop or while controls are locked` | §4.3, §4.4 |
| `keeps reading chrome visible while a selection action surface is open` | §4.4 |
| `does not hide controls for a programmatic restore or page jump` | §5.0, §5.1, §5.2 |
| `keeps primary actions reachable and invokes existing handlers` (390 / 1024) | §2.1 |

The `1024 px authority` test asserts that the **only** media query the Reader ever issues is the
1024 px one, which is what makes a tablet band impossible rather than merely unstyled.

## 9. Migration map (this phase)

| Removed here | Replaced by | Where |
| --- | --- | --- |
| Confirmed-tap reveal (`TAP_MS`/`TAP_SLOP`, four pointer listeners) | §6.3 accumulated travel + §6.4 focus + §6.5 reveal-only control | `ReaderShell.tsx` |
| `delta < -8` single-event reveal | Symmetric 32 px accumulation | `ReaderShell.tsx` |
| `.pdf-page` / `.pdf-reading-scroll` reveal exemption | `CHROME` selector set | `ReaderShell.tsx` |
| `top < 40` | `top ≤ 40` | `ReaderShell.tsx` |
| `matchMedia` stub returning a bare boolean in tests | `stubViewport(width)` answering the real query | `ReaderShell.test.tsx` |
| Tap-reveal tests (3) and the Original-page-exemption test | §6.3/§6.4/§6.5 tests above | `ReaderShell.test.tsx` |
| `'next 6'` OCR label assertion | Ownership assertion: exactly one document-tools button performs the action | `ReaderShell.test.tsx` |
| Docs claiming confirmed-tap reveal, a tablet band, mobile footer Zoom menu, and next-six-pages copy | This document | `ui-system.md`, `reader.md` |