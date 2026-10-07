# Reader Behavior Contract — v2

Status: **DRAFT → FROZEN when Phase 2b merges** · Supersedes v1 (2026-10-04) and its 2026-10-05 label amendments.
Authority: owner decision 2026-10-06 and the approved desktop/mobile mockup (it fixes direction, not pixels).

This file fixes **observable behavior** only. Where code lives and which constant is enforced where:
[reader-chrome.md](reader-chrome.md). Phase order and gates: [reader-redesign-phases.md](reader-redesign-phases.md).

**MUST / MUST NOT** are binding. Every rule has an ID, and that ID is the `@tag` of its test.
A rule marked **[P2c]**, **[P3]**, **[P4]**, **[P5]** or **[Z2]** becomes true in that phase and is not tested earlier.
Unmarked rules are true after Phase 2b.

## 1. Responsive and architecture

| ID | Rule |
| --- | --- |
| ARCH-1 | `≤1023px` = Mobile Chrome, `≥1024px` = Desktop Chrome, both bounds inclusive. `useDesktop()` is the sole semantic responsive authority. No tablet variant; no other Reader width condition decides ownership or behavior. |
| ARCH-2 | One Reader shell, one state model. There is **no** Simple/Advanced: `interfaceMode` is removed and stored values migrate without error. |
| ARCH-3 | `Text \| PDF` is one presentation control, PDF documents only. Persisted `viewMode` values (`original` / `reading`) do not change; only labels, accessible names, tests and docs do. |
| ARCH-4 | PDF presentation and PDF processing (extraction, OCR, page tools) stay separate models even when adjacent in More. |
| ARCH-5 | No Reader FAB, Search, Form Fill or Context-panel entry. No scroll listener changes layout in a way that re-triggers itself. Chrome makes no network call, quota reservation or Worker request. |
| ARCH-6 | Hit targets ≥44px at ≤1023px and ≥36px at ≥1024px. Every control is reachable at 320px without horizontal scrolling of the chrome. |
| ARCH-7 | Notes is not a Reader chrome action: no entry in More, Header or Footer. Its implementation, its data and the selection-bar Note action are untouched; deleting the feature is a separate task that traces its dependencies first. |
| ARCH-8 | Print is not a Reader chrome action: its Header button, handler, CSS and tests are deleted, and it has no other entry. |

## 2. Chrome model and input

| ID | Rule |
| --- | --- |
| CHR-1 | Header and Footer overlay the reading surface; chrome never pushes content. Static top and bottom padding live inside the scroll container, sized to the chrome, so the first and last readable lines can always scroll clear of it. No reserved status strip (the old `.pdf-queue-status` model is not reintroduced). |
| CHR-2 | Two states only: visible and quiet. Quiet is visual (opacity/transform) and never changes content height, `scrollTop`, page identity, location or any geometry. |
| CHR-3 | Quiet exists only at ≤1023px. Desktop chrome is always visible. |
| CHR-4 | Never quiet while More, Lookup, a selection surface, Contents, the Markup palette or any menu is open, nor during load or restoration. A document opens with chrome visible. |
| INP-1 | Only real wheel, touch drag or paging keys over the reading surface may quiet or reveal. Programmatic scroll, page jump, zoom, mode change, geometry reconciliation, restoration, tap, click, double-tap, long-press, edge swipe, Back and idle timers never do. |
| INP-2 | Quiet = accumulated downward travel ≥32px and `scrollTop` >40px. Reveal = accumulated upward travel ≥32px, or `scrollTop` ≤40px. One shared constant in opposite directions; the accumulator resets on a direction change; a single event of any size never reveals. Wheel and touch are identical. |
| INP-3 | Focus entering chrome reveals it and keeps it revealed; leaving chrome restores the prior state. Focus anywhere else never reveals. |
| INP-4 | `Aa ···` (accessible name "Show reading controls") is the reveal-only escape: mobile and quiet only, keyboard operable, never quiets, not a toggle, menu, popup or FAB, removed once chrome is visible, never the primary path. It sits at the bottom-right inside the safe-area inset. It is not the desktop `Aa` Theme button. |
| MOB-1 | At ≤1023px, while quiet, only the reading text is visible (plus the OS bars): Header, Footer and its progress line are all hidden. Text runs edge to edge between its side margins. |
| MOB-2 | The mobile Footer is one full-width single-row bar — Contents · page number · Markup · More, with visible text labels — and a hairline progress line on its top edge. It shows no percentage and no zoom control. |
| MOB-3 | Mobile reveal follows scroll direction: scrolling down quiets Header and Footer together; scrolling up (INP-2) reveals both together; the top of the document always reveals. Tap never toggles chrome, because tap belongs to lookup and selection. |

## 3. Header, Footer, More

| ID | Rule |
| --- | --- |
| HDR-1 | The mobile Header owns exactly: Back, document title, `Text \| PDF` (PDF only). The desktop Header owns exactly: Library (Back), the title (File switcher trigger), `Text \| PDF`, zoom (decrease, level, increase), Contents, the Markup tool group (Highlight, Underline, Erase), `Aa` (Theme) and More. |
| HDR-2 | The title identifies the document (extension and `: subtitle` trimmed, ellipsized, full title in `title`). It is not interactive on mobile; at ≥1024px it is the File switcher trigger (FILE-1). |
| HDR-3 | Never in the Header at any band: Search, FAB, OCR actions, Notes, Context, Print, a Markup dialog button, previous/next page buttons, a page number, a second mode bar. At ≤1023px also never: zoom, Contents, Markup tools, `Aa`. |
| HDR-4 | The Contents icon lives in the Header at ≥1024px and in the Footer bar at ≤1023px; never both, never in More. It opens the Contents panel; tapping an entry navigates; there is no "Go to location" button inside Contents. The panel offers Contents and, for PDF, Pages; there is no Outline tab. |
| HDR-5 | The desktop Header is grouped, left to right: **navigation** (Library · title ⌄), **mode** (`Text \| PDF`, centred), **tools** (zoom · Contents · Highlight Underline Erase · `Aa` · More), groups divided by separators and tools kept in that order. |
| FILE-1 [P2c] | At ≥1024px, activating the title opens the File switcher: a panel (never a menu) with title search, a kind filter (All, PDF, Text), the paged document list and Load more. Choosing a document opens it in place after the current location is saved, with no return to Home. Back closes the panel first. Not available at ≤1023px. |
| FTR-1 | At ≤1023px the Footer is one full-width single-row bar owning: Contents; the page number (the location button, opens Go to location); Markup; More; with a hairline progress line on its top edge. At ≥1024px the Footer is a thin single-row band owning the page number (location button), a thin progress line and OCR status while active. Neither band shows a percentage or previous/next page buttons. A document without pages shows a Go-to icon in place of the number. |
| FTR-2 | PDF scale applies to Original mode only (Text mode scales through Theme typography). At ≥1024px the Header owns the direct control — decrease, level, increase (the level may be the Automatic / 75 / 100 / 125 / 150 select, plus one dynamic option for the current actual scale). At ≤1023px there is no zoom control. Never a menu or sheet, never in More. |
| ZOOM-2 [Z2] | Mobile pinch changes the actual scale. During the gesture the surface scales visually only and PDF.js does not re-render per gesture event. After the gesture settles, the visible pages re-render first (neighbours, then the rest lazily) at the actual scale, not snapped to a preset; in-flight renders are cancelled or replaced; page identity, scroll position and mode are unchanged. Z2 starts only after the Z1 audit and benchmark pass. |
| FTR-3 | Markup is one tool state (Highlight, Underline, Erase, colour). At ≤1023px the Footer Markup action opens a compact palette above the bar; at ≥1024px the Header tool group is the direct control and there is no dialog button. No second Markup entry in any band. |
| FTR-4 | Header- and Footer-opened surfaces are panels, dialogs and the Markup palette — never menus. More is the only menu architecture. |
| FTR-5 | The Footer never overflows horizontally at any width in its band. |
| NAV-1 | Page navigation is one location button in the Footer at every band, accessible name `Current PDF page`; it opens Go to location. There are no previous/next buttons; scrolling and keyboard paging remain. |
| MORE-1 | One More disclosure: bottom sheet at ≤1023px (width-capped at 768–1023px), popover at ≥1024px. One dismissal and focus implementation per form. |
| MORE-2 | Inventory, in order. At ≤1023px: **Document · Theme · Languages · OCR [P4] · Click lookup**. At ≥1024px: **Document · Languages · OCR [P4] · Click lookup** (Theme is the `Aa` Header button). Each exactly once, nothing else. Until P4 the OCR controls live inside Document. |
| MORE-3 | Removed from More and not replaced: Context, Notes, Markup, Contents, separate Appearance and Fonts rows (they live inside Theme), Simple/Advanced. |
| THEME-1 | Theme has one entry per band: the `Aa` Header button at ≥1024px and the More → Theme item at ≤1023px. Both open the same panel: the current reading settings until P3, then Appearance, Colours and Font. |
| MORE-4 | No action is reachable from two places. Nested expansion is allowed on mobile; a second navigation layer is not. |
| MORE-5 | At 320px the sheet fits with 8px insets, stays ≤70dvh, scrolls inside itself, never scrolls horizontally and is fully dismissible. |
| MORE-6 | `Click lookup` is a session-local toggle (default on), behavior unchanged, and works in PDF under quiet chrome. |
| BACK-1 | One Back resolver: active overlay or surface first, then leave the document. Browser and hardware Back use the same resolver. Back never quiets or reveals chrome. |
| MODE-1 | Changing Text ⇄ PDF never alters content, extraction, OCR state, page identity, geometry or chrome state. |
| MODE-2 | When readable text is unavailable the mode control is hidden or disabled with a programmatically perceivable state — never an enabled no-op. |
| MODE-3 | Text and PDF modes share one chrome vocabulary, order and spacing. They differ only where the function differs: PDF has page-based location and (desktop) scale; Text mode scales through Theme typography. A control that exists in both modes looks and behaves the same; a control is never added to one mode just to mirror the other. |

## 4. Appearance and typography [P3]

| ID | Rule |
| --- | --- |
| APP-1 | Appearance = Light \| Dark. A stored `system` value is resolved to Light or Dark once, at migration. One reader palette; Home reuses the same semantic tokens. |
| APP-2 | Reader tokens: **Heading/Title**, **Body**, **Accent**, **Page background**. Light: `#A24B31` · `#22211D` · `#C88E69` · `#F7F4EB`. Dark: `#C88E69` · `#FFFFFF` · `#C88E69` · `#121110`. The six colour swatches follow the mockup; their remaining hex values are recorded in the P3 task before coding. |
| APP-3 | Fonts = Sans \| Serif, bundled locally (woff2 in the repo, no CDN) with generic fallbacks. **One font setting drives both the reading text and the interface typography** (chrome, panels, Home), so the interface never mixes an unrelated UI font with the reading font; page numbers use tabular figures. Chrome layouts are verified at 320px in both fonts. The two chosen families and their licences are recorded in docs. |
| APP-4 | The Theme panel has a bounded height and scrolls inside itself: no page scroll chaining, no horizontal overflow, same contract on both bands. |
| APP-5 | The Lookup popup accent is its own token, independent of the Reader Heading token. |
| APP-6 | The Theme panel groups Appearance, Colours and Font. Reading defaults (body size, line height, side margins, paragraph gap) are recorded in P3; reference screenshots suggest about 20px, 1.5, 5% of the width and 0.3 line, to be verified on a phone before they become values. |

## 5. OCR [P4] and Lookup

| ID | Rule |
| --- | --- |
| OCR-1 | Preload the first 12 candidate pages (local only). An explicit run processes 12-page windows from the first unprocessed page. |
| OCR-2 | A run starts only from an explicit user action; the first-12 preload never starts one. Once started it continues to exhaustion on its own. There is no "OCR next" or "continue" control. |
| OCR-3 | "Active" = preparing, running or paused, decided on queue state and never on localized text. The Footer status exists only while active (paused counts) and is a non-interactive indicator. |
| OCR-4 | Pause, resume and cancel live in OCR (More). Cancel ends the run and leaves the document readable. |
| OCR-5 | Terminal success, terminal error and "nothing to OCR" are explicit observable states, distinct from idle. Error keeps earlier results and offers retry. |
| OCR-6 | Transitions into and out of active are programmatically announced. |
| LOOK-1 | The Lookup sheet shows entry glosses (EN, VI, EN+VI) when they exist. |
| LOOK-2 [P5] | When the POS is ambiguous the header reads `Multiple possible meanings · <pos>`. "chưa xác định" appears only when the POS is truly unknown. No explanatory paragraph. |
| LOOK-3 [P5] | Lookup engine, data and persistence are unchanged. |

## 6. Geometry, load and accessibility

| ID | Rule |
| --- | --- |
| GEO-1 | The reading viewport box top and height are unchanged across quiet/reveal, mode change, zoom, and Lookup or More open/close. |
| GEO-2 | Page identity and reported location are stable across the same transitions. |
| GEO-3 | Open order: `scrollTop` 0 → geometry reconciliation (never past the injected padding) → settle → optional saved-position restoration. Restoration is position-only and evaluated separately. |
| GEO-4 | At the settled `scrollTop` 0 the first readable line sits at or below the Header's bottom edge — reached by reconciliation, never by a reserved strip. |
| GEO-5 | A revealed Header overlaps no more than its own height and causes no reflow. |
| GEO-6 | At the document end the last readable line can scroll clear of the Footer (bottom padding inside the scroll container). |
| A11Y-1 | Every control is keyboard reachable and operable, in an order that needs no pointer and traps no focus (More and panels trap only while open). |
| A11Y-2 | Every control has an accessible name that does not rely on icon, position or colour. More exposes expanded/collapsed. |
| A11Y-3 | Dismissing More, Contents, Markup or Lookup returns focus to its opener. |
| A11Y-4 | No function depends on a visual-only gesture, hover or drag. |

## 7. Test rules

- Assert semantics: roles, accessible names, expanded state, visible state. No Page Objects; no class assertions unless the class is the contract; no state mutation to simulate a user; no synthetic scroll for chrome behavior; no magic coordinates; no `test.fixme` as a migration strategy (migrate, or delete with a recorded reason).
- Every rule ID has a test tagged with it. A changed test keeps or updates its tag; no stale tag survives.
- Matrix: 320, 390, 767, 768, 1023, 1024, 844×390, 915×412, 1280×800.
- Assert geometry only where geometry is the requirement (GEO-*).

## 8. Open items and closed decisions

Open:

| # | Item | Owner | Decide before |
| --- | --- | --- | --- |
| 1 | Back history ownership (`pushState` / `popstate` / router). Start with a read-only audit of every existing handler. | P5 | P5 |
| 2 | Shape of the terminal-success OCR state; announcement wording. | P4 | P4 |
| 3 | Z1 audit and benchmark results (where PDF scale lives, whether text/annotation geometry must be synchronized, render cost on a mid-range Android) decide whether ZOOM-2 ships. | Z1 | Z2 |
| 4 | Fate of the Book / News / Academic presets in `ReaderSettings` once the Theme panel groups Appearance, Colours and Font. | owner | P3 |

Closed (owner decisions; an agent never reopens these):

| Date | Decision | Rule |
| --- | --- | --- |
| 2026-10-06 | Notes is not a chrome action; implementation, data and the selection Note action are untouched. Saved notes have no Reader entry until a separate task decides. | ARCH-7 |
| 2026-10-07 | OCR never starts on its own beyond the first-12 local preload: a run starts only from an explicit user action, then continues through 12-page windows to exhaustion. | OCR-1, OCR-2 |
| 2026-10-07 | The Contents panel offers Contents and (PDF) Pages. No Outline tab; no clock icon in the Footer. | HDR-4 |
| 2026-10-07 | The reveal-only `Aa ···` sits bottom-right inside the safe-area inset; P2b records the exact offset after the 320px and landscape checks. | INP-4 |
| 2026-10-07 | Mobile Footer items carry visible text labels; revisit icons only if the 320px check fails. | MOB-2 |
| 2026-10-07 | One font setting drives reading and interface (APP-3 stands). Reference visuals must comply; chrome legibility at small sizes in Serif is verified in P3. | APP-3 |
| 2026-10-07 | Review-board directions A (warm paper) and C (ink and amber) are the Light and Dark presentation of APP-2. Direction B is not adopted. | APP-2 |

## 9. Design ownership

| Document | Owns |
| --- | --- |
| This contract | **WHAT**: observable behavior and which surface owns each action |
| [reader-chrome.md](reader-chrome.md) | **HOW**: component ownership, composition per band, visual structure, CSS ownership, test obligations. It cites rule IDs and never restates a rule |
| Phase 3 (APP-*) | Colours, fonts and tokens |

## 10. Change control

Any change to this contract needs a decision-record entry (evidence, decision, rationale, rejected alternatives) and is labeled as changing a **FROZEN** rule by ID.
