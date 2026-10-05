# MobileChrome — implementation spec

Authoritative implementation-facing spec for the mobile (≤1023 px) Reader Chrome.

- **Product source of truth:** [reader-behavior-contract.md](reader-behavior-contract.md) (frozen).
  This file derives from it and never redefines product behavior.
- **Foundation:** [reader-chrome-foundation.md](reader-chrome-foundation.md) owns the responsive
  authority, the chrome state machine and the reveal constants. This file owns the mobile
  composition, action ownership and presentation rules layered on top of them.

Where this file and the contract appear to disagree, the contract wins and this file is a defect.

## 1. Scope

| ID | Item | Status |
| --- | --- | --- |
| §1.1–§1.4 | 1024 px sole responsive boundary | Foundation, asserted here at ≤1023 px |
| §3.x | Overlay O, Header overlay, Footer reserved | **ENFORCED** |
| §4.x | Two chrome states, visual-only quiet, Mobile-only quiet | Foundation, exercised here |
| §5.x | Input semantics and attribution | Foundation (§5 attribution), exercised here |
| §6.x | Reveal constants, hysteresis, escapes | Foundation, plus §6.9 placement below |
| §7.x | Header ownership | **ENFORCED** |
| §8.x | Footer ownership incl. direct PDF zoom | **ENFORCED** |
| §9.x | One More disclosure, bottom sheet ≤1023 px | **ENFORCED** |
| §10.x | Single PDF-only Original/Reading control | **ENFORCED** |
| §12.x | OCR status only while an OCR run is active | **ENFORCED** for the Footer strip |

Out of scope here: Home, Lookup/Overlay architecture, OCR queue semantics, the PDF/OCR controls phase
(U6 preload defect, terminal OCR states). See §16.

## 2. Presentation band

- `src/styles.mobile-reader.css` scopes to **`@media (max-width: 1023px)`**. There is no inner
  `min-width: 768px` branch that carves out a separate presentation.
- The legacy `min-width: 768px and max-width: 850px` block in `styles.reader-base.css` still
  declares its own `.pdf-viewer-wrap`/`.pdf-reading-view` heights, but the mobile sheet wins on
  specificity (`.reader-shell.reader-shell …`), so at 768–850 px the mobile geometry applies and the
  block is functionally dead. It is inert, not a tablet variant; removing it is deferred cleanup
  (see §12), not a MobileChrome requirement.
- 768–1023 px therefore receives the same mobile composition, interaction model and constants as
  320 px and 390 px. Wider mobile widths only gain the approved max-width/centering treatment of
  the More sheet; they never gain a different control layout.
- 1024 px is Desktop. The two bands are set by `useDesktop()` in TypeScript and by the
  `max-width: 1023px` / `min-width: 1024px` pair in CSS. These must not drift apart.
- Landscape (844×390, 915×412) is an ordinary member of the same band. It changes available height
  only; it never changes ownership, the reveal model, or hit targets.

## 3. Chrome composition

- **O = overlay.** The Header overlays the reading surface. There is no permanent reserved header
  strip, and quiet never changes content geometry (A12).
- Static top padding that protects content lives **inside the scroll container** and is not the
  Header's safety mechanism; the Header's safety comes from overlay position plus the U1
  reconciliation invariant.
- The Footer stays visible and reserved in **both** chrome states. Quiet hides the Header only.
- The reading viewport is never resized by a chrome transition.

## 4. Header (≤1023 px)

Owns exactly three things, and nothing else:

1. **Back** — returns to the library.
2. **Document title** — bounded, ellipsized, full title in `title`.
3. **Original / Reading** — PDF only, the single mode control (§10).

Absent from the mobile Header: Search, a FAB, a secondary action row, Markup, Text, Notes,
Languages, Document, Click lookup, and any per-action overflow. Every one of those
is reached through More instead. Do not reintroduce an L1 action layer in the Header.

## 5. Footer (≤1023 px)

| Slot | Owner |
| --- | --- |
| Reading progress + location | Footer (percentage retained where it was retained) |
| PDF zoom | Footer, as a **direct** stepper: decrease / level / increase |
| More trigger | Footer |
| OCR status | Footer, **only while an OCR run is active** (§5 below) |

- Zoom is a direct control. It is not a popup, not a menu, and not inside More. The mobile
  `.pdf-more` zoom popup is deleted.
- This table describes the **mobile band only** (≤1023 px). At ≥1024 px the Footer does not render a
  zoom control at all: `.pdf-footer-zoom-host` is gated on `!desktop`, and the zoom stepper lives in
  the Header toolbar per [desktop-reader.md](desktop-reader.md) §3. Ownership is singular in both
  bands, but the band that owns it differs — see §12 for the reconciled split.
- At 320 px the Footer keeps progress, the zoom stepper, More and — only when active — OCR status.
  Click lookup is **not** an independent Footer action there; it lives in More. The Footer must
  not overflow horizontally at any width in the band.
- Every Footer control meets the 44 px hit target.

### 5.1 OCR status is a state, not a label

"Active" is decided over state, never over localized text:

| Class | States | Footer status |
| --- | --- | --- |
| Active / resumable | `preparing`, `running`, `paused` | shown |
| Terminal success | run finished | hidden |
| Terminal error | run failed | hidden |
| Cancelled / cleared | user cancelled or cleared | hidden |

`paused` **is** active: a paused queue is still a run the reader can resume, so its status stays
visible. OCR status is an ambient progress strip, never a permanent navigation or control element,
and it is never reachable as a destination in More. Document tools, opened from More, are the
canonical OCR status surface.

## 6. More — the single secondary disclosure

There is exactly one conceptual More disclosure, rendered by one shared component:

| Band | Presentation |
| --- | --- |
| ≤1023 px | bottom sheet with a backdrop |
| ≥1024 px | popover |

At wider mobile widths the sheet is centered and max-width constrained; it does not become a popover
and it does not gain a second action layer. Escape closes it (§9.5); focus is trapped while open.

Exactly the eight approved items of contract §9.3, in this order: **Contents**, **Context**, **Notes**,
**Markup**, **Text**, **Languages**, **Document**, **Click lookup**. `Document` is the one entry that
also carries the OCR controls (§9.7) — OCR is never a separate More entry, and no duplicate OCR entry
may exist anywhere in the inventory. Nothing else is added, and each is present exactly once in the
Reader. `src/app/App.tsx` builds this list as `readerMoreItems`.

**Label change, 2026-10-05 (owner decision).** Four labels were shortened for a narrow sheet and a
desktop popover; the underlying actions are unchanged. Each replaced an older, longer label:

| New label | Replaces |
| --- | --- |
| `Document` | `Document tools` |
| `Text` | `Text and theme` |
| `Languages` | `Language engines` |
| `Click lookup` | `Click word lookup` |

The eight-item count, the order and the ownership of every action are unchanged by this rename; only
the visible strings change. `Document tools` remains the correct name of the **surface** (dialog) and
must not be renamed for consistency — only the More menu item label changed.

## 7. Action ownership (canonical host per action)

| Action | Canonical host |
| --- | --- |
| Back | Header |
| Original / Reading | Header (PDF) |
| Progress / location | Footer |
| PDF zoom | Footer (direct stepper) |
| More | Footer |
| Active OCR status | Footer, only while active |
| Contents, Context, Markup, Text, Notes, Languages, Document, Click lookup | More |

After migration no action may be duplicated merely to satisfy an older test.

## 8. Quiet / reveal on mobile

Built on the Foundation accumulation model — not re-specified here:

- Real **upward** travel reveals; real accumulated downward travel quiets.
- `CHROME_TRAVEL` (32 px) is the single threshold in both directions; `top ≤ 40` always reveals.
- Programmatic movement is **attributed, not guessed**. Whoever moves the content declares the
  position it produces via `src/reader/programmaticScroll.ts`; the Reader consumes that
  declaration once and neither accumulates nor transitions. A real gesture cancels a stale
  declaration first, so a gesture landing near a stale value is still counted.
- Never drive the Chrome: tap/click/long-press (§5.3), a programmatic page jump or restoration, a
  zoom change, a mode switch, geometry reconciliation, scrolling inside More or a Lookup surface.
- Wheel and touch are equivalent (§5.4).
- An open blocking overlay or a live text selection keeps chrome revealed and drops travel (§4.4).
- Keyboard/screen-reader focus entering real chrome reveals it; focus in the reading surface does
  not (§6.4).

### 8.1 §6.9 placement of the reveal control — RESOLVED

§6.9 was recorded as OPEN. It is settled here as the **least disruptive placement that satisfies
every frozen requirement**: the existing dedicated reveal-only control,
`<button class="reader-reveal" aria-label="Show reading controls">`, rendered in the Reader shell and
positioned as a fixed overlay that does not participate in the scroll container's flow.

Why this and not an alternative:

- It is the only already-frozen option that stays reachable after a large upward scroll stops
  (§6.7 requires an escape that does not depend on further scrolling).
- It is the only one that keeps every Footer and Header control reachable while quiet — which is what
  makes "Footer remains visible during quiet" meaningful.
- It introduces no second action layer, no popup, and no menu, so §6.5/§6.6 are satisfied without a
  new product decision.

It remains **reveal-only**: no `aria-haspopup`, no `aria-expanded`, not a toggle, not a FAB, not a
menu, not a popup, and it is removed once chrome is revealed. It stays operable at 320 px and in both
landscape pairs. Tap-to-toggle chrome remains prohibited (§6.7/§6.8) and is not reintroduced here.

## 9. Load lifecycle

`open → geometry reconciliation at scrollTop=0 → settle → optional saved-position restoration`

MobileChrome does not change this. The observable invariant: at the reconciliation reference state,
after settlement, the first readable content is not covered by the overlaid Header. Any restored
position is evaluated separately and must not introduce an unintended geometry jump (A12).

## 10. Test obligations

`e2e/mobile-chrome.spec.ts` is the mobile behavioral suite. It uses real input and semantic
roles/labels; it does not mutate classes, synthesize scroll events, or use magic coordinates.

| Test group | Contract |
| --- | --- |
| Presentation band: 320, 390, 767, 768, 1023, 844×390, 915×412 | §1.x, §2 |
| 1024 px remains a Desktop overlay band | §1.2, §4.3, §9.2 |
| Real scroll quiets; Footer stays visible | §4.1, §8.4 |
| Upward travel reveals; small correction does not | §6.0, §6.1, §6.3 |
| Touch ≡ wheel | §5.4 |
| Tap does not toggle or reveal | §5.3, §6.7 |
| Reveal control is one-way and non-toggling; operable at 320 px and landscape | §6.5–§6.7, §6.9 |
| Focus into chrome reveals; focus into the reading surface does not | §6.4 |
| Contents jump does not drive chrome | §4.4, §5.1, §5.2 |
| Mode switch does not drive chrome | §5.1, §10.2 |
| Zoom change does not drive chrome | §5.1, §8.2 |
| Scrolling inside More does not drive chrome | §4.4, §9.8 |
| First readable line clear of the Header at the reference state | U1, §13 G4–G5 |
| Quiet/reveal change no geometry, height or position | §4.2, A12 G1–G3 |
| Footer band reserved in both chrome states | §3.4 |
| Footer owns a direct zoom stepper, never a zoom menu | §8.2, §8.3 |
| Every Footer control meets 44 px | §7.5, §8.6 |
| OCR next lives only in Document tools via More | §9.7, §12.11 |
| More exposes exactly the eight §9.3 items, in order, with the §6 labels | §9.3, §6 |
| Progress/location owned by the Footer at every mobile width | §8.1, §8.5 |

### 10.1 Helper rules

- `expectMobileChrome(page, state)` polls header opacity and must tolerate a remounting surface: an
  unmounted surface reports `NaN`, which retries instead of throwing and aborting the assertion.
- `waitForReaderSurface(page)` waits for a mounted, settled surface and is called after any
  operation that re-paginates (mode switch, zoom). Do not reintroduce fixed `waitForTimeout` sleeps
  where a real settle condition exists.
- `togglePdfMode` scrolls the control into view with real input before activating it.
- A cleanup click on an element that is legitimately gone is a defect: `locator.click()` waits its
  own full timeout, so `.catch()` cannot rescue it. Assert the real post-condition instead.

## 11. Deferred to the PDF/OCR controls phase

These are deliberately **not** implemented here and must not be invented in MobileChrome work:

- U6: `preloadFirstTwelve()` recognizes 6 hard-coded candidates instead of the intended first 12,
  while the explicit OCR window stays 12 pages.
- Terminal OCR state strings and their coupling to `PdfDocumentTools` localization.
- Any change to OCR queue semantics.

## 12. Known implementation dependencies

- `surface` participates in the Reader chrome effect's dependencies. A surface identity change
  resets quiet, which is correct for a mode switch but is a coupling worth revisiting if a
  future phase restores across surface changes.
- More has one trigger per density band, matching the band that already owns the surrounding chrome:
  the Footer at ≤1023px (§8.1/§9.4) and the Header toolbar at ≥1024px ([desktop-reader.md](desktop-reader.md)
  §2). This supersedes the earlier §5 wording that permitted a desktop-only More popover.
- Zoom is a **direct** control at every density — decrease, level readout, increase — and it is never
  a popup or a menu at any width. The former desktop preset popover (`.pdf-more-menu`) and the mobile
  zoom menu are both deleted; see [desktop-reader.md](desktop-reader.md) §3.
- Zoom ownership follows the density split rather than being uniform in *location*: the Footer renders
  the `.pdf-footer-zoom-host` only at ≤1023px, and [desktop-reader.md](desktop-reader.md) §3 keeps a
  zoom control in the desktop Header toolbar (a preset `<select>` flanked by the decrease/increase
  buttons — the same direct-control shape, not a menu). App.tsx therefore gates the Footer zoom host
  on `!desktop` and gates the Footer More trigger on `!desktop`, so no band renders two zoom
  controls or two More triggers. This supersedes the earlier §5 wording that described the Footer
  stepper without qualifying it to the mobile band. Approved as a rollback of `40e807d`
  (DesktopReader Toolbar) in the PDF/OCR Controls phase, reconciling `40e807d`'s own
  `desktop-reader.md` §3 against the Footer zoom host it left rendering unconditionally.