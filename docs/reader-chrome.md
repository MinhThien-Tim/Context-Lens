# Reader Chrome

Implementation-facing spec for the Reader chrome at both bands. It **replaces**
three retired Reader chrome specs (their history stays in git).
Product behavior is defined only in [reader-behavior-contract.md](reader-behavior-contract.md); if this file
disagrees with it, this file is the defect. Rule IDs below (HDR-1, INP-2…) refer to that contract.

> **Status.** This spec describes the approved target. The code catches up in P2b; the File switcher is P2c, Theme is P3, OCR chrome is P4, and mobile pinch is Z2.
>
> Target passages tagged **[P2b]**, **[P2c]**, **[P3]**, **[P4]** or **[Z2]** are not yet true in code.

## 1. Ownership map

| Piece | Where | Owns |
| --- | --- | --- |
| Responsive authority | `src/components/useDesktop.ts` | One query: `matchMedia('(min-width: 1024px)')` |
| `ReaderShell` | `src/reader/ReaderShell.tsx` | Transient chrome **visibility** only. Observes scroll and gestures; never navigates, writes location or triggers layout measurement |
| Header | `ReaderToolbar` → `<header class="reader-header">` | Mobile: Back, title, `Text \| PDF`. Desktop: Library (Back), title (File-switcher trigger), `Text \| PDF`, zoom (decrease, level, increase), Contents, Markup tool group, `Aa` (Theme), More trigger |
| Footer | `ReaderProgress` → `<footer class="reader-progress">` | Mobile: one full-width bar — Contents, page number, Markup, More — with a hairline progress line, plus `.reader-reveal` while quiet. Desktop: thin single-row band — page number, progress line, OCR status while active |
| More | one shared component; list built as `readerMoreItems` in `src/app/App.tsx` | The MORE-2 inventory |
| Programmatic scroll | `src/reader/programmaticScroll.ts` | Declared (never guessed) programmatic moves |

## 2. Responsive authority

- `≤1023px` Mobile, `≥1024px` Desktop. CSS must match: `styles.mobile-reader.css` under `@media (max-width: 1023px)`, `styles.desktop-reader.css` under `@media (min-width: 1024px)`. The two bands never drift apart.
- Landscape (844×390, 915×412) is an ordinary member of its band: it changes available height only.
- Presentational width rules (for example inspector rhythm) may exist but never decide ownership. The dead `768–850px` block in `styles.reader-base.css` is deleted in P7.

## 3. Chrome state

| Constant | Value | Meaning |
| --- | --- | --- |
| `CHROME_TRAVEL` | 32px | Accumulated travel, either direction, that commits a transition (INP-2) |
| `CONTENT_TOP` | 40px | At or above this `scrollTop`, chrome is always revealed |
| `GESTURE_WINDOW` | 1200ms | How long one real gesture authorizes the deltas it produces; bounds momentum, never decides whether a move was user-driven |
| `CHROME` | `.reader-header,.reader-progress,.reader-reveal` | Focus entering these reveals (INP-3) |

`ReaderShell` rules:

- Returns early when `desktop`, `controlsLocked`, `contentsOpen` or `contextOpen` (CHR-3, CHR-4).
- A live selection or any `OVERLAY_OPEN` surface zeroes travel and suppresses the transition. `OVERLAY_OPEN` = `.reader-more-menu`, `.pdf-reading-options`, `.pdf-reading-selection-wrap`, `.pdf-reading-selection-actions`, `.selection-actions`; the Markup palette joins it in P2b.
- Quiet hides Header **and** Footer at ≤1023px (progress line included). Both overlay the reading surface; static top and bottom padding lives inside the scroll container.
- Reveal-only control: `<button class="reader-reveal" aria-label="Show reading controls">`, a fixed overlay outside the scroll flow, rendered only while quiet (INP-4). No `aria-haspopup`, no `aria-expanded`. It sits bottom-right inside the safe-area inset; P2b records the exact offset after the 320px and landscape checks.
- `onFocusCapture` reveals only when focus enters `CHROME`; focus on the reading surface, text or selection handles never does.

## 4. Programmatic scroll attribution

- Whoever moves content programmatically calls `expectProgrammaticScroll(top, target)` **before** the assignment (`usePdfScroll.navigate` for page jump, restoration, zoom re-pagination and mode switch; `jumpToOffset` for text Contents).
- `isProgrammaticScroll(target, top)` consumes that declaration once, matching strictly on target identity and within 1px. The Reader then zeroes both accumulators and does not drive a transition.
- Any real gesture calls `clearProgrammaticScroll()` first, so a gesture landing on a stale declared position still counts.
- Default is "ordinary scroll". An undeclared move is never silently credited as user travel nor silently excluded. Never infer from recency or `isTrusted`.

## 5. Composition by band

| Surface | Mobile ≤1023px | Desktop ≥1024px |
| --- | --- | --- |
| Header | Back · title · `Text \| PDF` | Library · title ⌄ (File switcher) · `Text \| PDF` (centred) · zoom − level + · Contents · Highlight Underline Erase · `Aa` · More trigger |
| Footer | One full-width single-row bar: Contents · page number · Markup · More (visible text labels); hairline progress line on its top edge; `Aa ···` overlay while quiet (Header and Footer are both hidden then) | Thin single-row band: page number · progress line · OCR status while active |
| More | Bottom sheet with backdrop, width-capped at 768–1023px, Escape closes, focus trapped | Popover from the Header trigger |
| Contents (Header icon on desktop, Footer bar on mobile) | One panel at a time (drawer/sheet) | Document column (Contents, Pages) |
| Context | Opens only from Lookup "Show more" | Context Inspector column, same trigger |

Notes on the table:

- Mobile Header at 320px: Back + `Text \| PDF` + title; the title is the only element allowed to shrink (ellipsis). Verify at 320 in both fonts.
- Mobile Footer bar: four 44px targets plus gaps fit 320px with room to spare; the page number is the flexible centre.
- Geometry: the reading viewport is full height at all times; Header and Footer overlay it, with static padding inside the scroll container (top = Header height, bottom = Footer height + safe-area inset). The reserved Footer band and the Original-PDF resize-on-quiet logic are deleted. At 844×390 and 915×412 the last line must still clear the Footer (GEO-6).
- Zoom renders once, at ≥1024px, in the Header toolbar (decrease, level, increase). Mobile has no zoom control; `.pdf-footer-zoom-host`, the mobile stepper and the mobile custom-scale code are deleted. Mobile pinch is a later task (Z1 audit, then Z2).
- Page navigation is one location button in the Footer at every band (`Current PDF page`, opens Go to location). Previous/next buttons and the Header page count are deleted.

## 6. Load and geometry

`open → geometry reconciliation at scrollTop 0 → settle → optional saved-position restoration` (GEO-3). `scrollTop 0` is the reconciliation reference, not a guaranteed end position. Header and Footer never reserve space (CHR-1); reconciliation scrolls to the true content top instead of growing padding (GEO-4), and bottom padding keeps the last line reachable (GEO-6). This file does not change loading or restoration code paths.

## 7. CSS ownership and deletions

- Mobile presentation: `src/styles.mobile-reader.css`. Desktop presentation: `src/styles.desktop-reader.css`. Band-neutral rules: `src/reader-layout.css`.
- Deleted in P2b (component, CSS, tests and docs together, no aliases): from the desktop Header the Notes, Markup-dialog and Print buttons, the previous/next page buttons and the page count; the mobile zoom host, stepper and custom-scale code; the reserved Footer band and the resize-on-quiet logic for PDF; any secondary PDF bar; `.pdf-toolbar`, `.pdf-zoom-presets`, `.pdf-more-menu`; the Context, Notes, Markup and Contents More items and, at ≥1024px, the Theme More item; the Context-panel entry. Kept: the desktop zoom stepper and `.reader-markup-tools`; `.reader-tools` keeps only Contents.
- Deleted in P2b with the density preference: `data-interface-mode` hooks, `home-advanced.css`, the Advanced-only Home sections and the density control.

## 8. Test obligations

| Group | Rules |
| --- | --- |
| Band boundary at 767 / 768 / 1023 / 1024; the only media query the Reader issues is 1024px | ARCH-1, CHR-3 |
| Real scroll quiets, Footer stays visible; upward travel reveals, a small correction does not; touch ≡ wheel | INP-1, INP-2, CHR-2 |
| Tap, programmatic jump, zoom, mode switch and scrolling inside More never drive chrome | INP-1, MODE-1 |
| Focus into chrome reveals; focus into the reading surface does not | INP-3 |
| `Aa ···` is reveal-only, keyboard operable, operable at 320 and landscape | INP-4 |
| Header contains exactly its items per band (HDR-5 order on desktop); no Search, FAB, Notes, Print, Markup dialog button, previous/next or page number | HDR-1, HDR-3, HDR-5, ARCH-5, ARCH-7, ARCH-8 |
| Contents icon (Header on desktop, Footer on mobile) opens the panel and an entry navigates; absent from More; Notes has no chrome entry | HDR-4, MORE-3, ARCH-7 |
| Footer per band: mobile bar items, desktop page number and OCR status, no percentage, hairline progress | FTR-1, FTR-4, FTR-5, MOB-2, ARCH-6 |
| Desktop zoom −/level/+ in the Header; no zoom control at ≤1023px; Markup palette (mobile) and tool group (desktop); page number is the only page control | FTR-2, FTR-3, NAV-1 |
| Mobile quiet shows text only; reveal returns Header and Footer together; tap never toggles | MOB-1, MOB-3 |
| Theme entry per band (`Aa` on desktop, More on mobile); same panel | THEME-1 |
| Text and PDF modes share chrome vocabulary | MODE-3 |
| More inventory and order, sheet vs popover, width cap, 320 behavior, focus return | MORE-1…MORE-5, A11Y-3 |
| Click lookup works in PDF under quiet chrome | MORE-6 |
| Back closes the active overlay first, then leaves; never touches chrome | BACK-1 |
| Mode switch changes nothing but presentation; unavailable state is perceivable | MODE-1, MODE-2 |
| Viewport box, page identity, first-line and last-line clearance, Header overlap | GEO-1…GEO-6 |
| Lookup glosses visible in EN, VI and EN+VI | LOOK-1 |

Unit coverage lives in `src/reader/ReaderShell.test.tsx`. Its viewport stub must answer the real query (`stubViewport(width)`), not return a bare boolean.

Helper rules:

- `expectMobileChrome(page, state)` polls header opacity and tolerates a remounting surface (an unmounted surface reports `NaN` and retries).
- `waitForReaderSurface(page)` waits for a mounted, settled surface after anything that re-paginates (mode switch, zoom). No fixed `waitForTimeout` where a settle condition exists.
- `togglePdfMode` scrolls the control into view with real input before activating it.
- Clicking an element that is legitimately gone is a defect (`click()` waits its full timeout); assert the real post-condition instead.
- Select by role and accessible name, never by class.

## 9. Known coupling

`surface` participates in the chrome effect's dependencies, so a surface change resets quiet. That is correct for a mode switch but must be revisited if a later phase restores across surface changes.

## 10. Visual design

Structure only. Colours, fonts and tokens belong to Phase 3 (APP-*) and are not specified here.

**Layout**
- The Header is one compact horizontal band; the Footer uses one stable control rhythm (same spacing between controls in both rows).
- Flat Reader chrome: no card or shadow-heavy treatment on Header or Footer.
- Desktop Header keeps its current compact toolbar rhythm, regrouped per HDR-5 (navigation, mode, tools). P2b removes controls, adds `Aa` and the File-switcher affordance and renames labels; it does not restyle.
- Immersive reading on mobile: while quiet only text is visible; chrome returns with an upward scroll as one compact Header and one full-width Footer bar. This takes its behavior from the reference readers (scroll-direction reveal, hairline progress); the floating-pill form explored in the reference image is not adopted.
- One font setting drives interface and reading typography (APP-3); the two modes look alike and differ only where their function differs (MODE-3).
- Mobile favours direct recognition (icon + accessible name) over text labels. Desktop keeps the same hierarchy with more horizontal room; it does not add controls.

**Surfaces**
- More: compact bottom sheet on mobile, compact popover on desktop, same inventory and order.
- Contents, the Markup palette and Go to location are panels, dialogs or palettes, not menus.
- Header and Footer never carry decorative controls that consume navigation space.

**Control treatment**
- Every control uses the shared hit-area token: 44px at ≤1023px, 36px at ≥1024px.
- Icon-only controls carry an accessible name; the active state of toggles (Click lookup, Markup tool) is exposed programmatically, not by colour alone.
