# DesktopReader

Presentation spec for the Reader at **≥1024px**. It owns layout, grouping and density only.

**Authority.** [`reader-behavior-contract.md`](reader-behavior-contract.md) is frozen and wins over
this document. Where this spec and the contract appear to disagree, the contract wins and this file
is wrong and must be corrected — never the contract. [`reader.md`](reader.md) owns Reader
architecture, [`mobile-chrome.md`](mobile-chrome.md) owns MobileChrome, and
[`reader-chrome-foundation.md`](reader-chrome-foundation.md) owns the shared foundation. This file
supersedes the obsolete desktop toolbar description that previously lived in
[`ui-system.md`](ui-system.md) and the `desktop zoom bar` wording in that same file.

## 1. Shape

The desktop Reader is a **single toolbar band above a dominant document canvas**:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Back │ document │ page navigation │ zoom │ mode │ highlight underline erase │ More │
└──────────────────────────────────────────────────────────────────────────────┘
│                                                              │
│                     document canvas                          │
│                                                              │
```

The canvas is the largest element on screen. The toolbar is always visible; desktop has **no quiet/reveal state** (§6 is Mobile-only). `ReaderShell` already early-returns for `desktop`, and that behavior is preserved.

There is **no tablet band** (§1.2). Desktop is ≥1024px. `useDesktop()` (`src/components/useDesktop.ts`) is the sole responsive authority.

## 2. Ownership

One toolbar band with clear functional groups. The toolbar owns all desktop reader controls.

| Group | Owner | Notes |
| --- | --- | --- |
| Document/nav (Back) | `ReaderToolbar` | Back to library |
| Page navigation (prev/next) | `ReaderToolbar` | Page stepper |
| Page/location (current/total) | `ReaderToolbar` | Page count display; **sole owner ≥1024px** of the `Current PDF page` control |
| Zoom/view (selector + stepper) | `ReaderToolbar` | Selector: Automatic / 75% / 100% / 125% / 150%; stepper: − / + |
| Original/Reading | `PdfModeSwitch` via `primaryActions` | **One** control, not two |
| Markup tools | `ReaderToolbar` | Highlight, Underline, Erase — direct access |
| Reader/document tools | `ReaderToolbar` | Contents, Notes, Markup, Print |
| More/overflow | `ReaderMore` | Secondary actions |

Every secondary action stays in **More** (§9.3): Contents, Context, Notes, Markup, Text, Languages, Document, Click lookup. Desktop does **not** gain an always-visible action rail, an L1 layer, or a second toolbar band. Simple/Advanced only changes disclosure and density (§11) — it never changes which band owns an action (§11.5). The labels are the ones fixed by [mobile-chrome.md](mobile-chrome.md) §6 (2026-10-05 rename); `Document` names the menu item, while `Document tools` remains the name of the surface it opens.

**Popup rule.** More is the **only** popup architecture (§3.6). `.pdf-more`, `.pdf-more-menu` and the `.pdf-toolbar` band are deleted, not restyled. Desktop zoom is a direct selector + stepper; it never opens a menu (§8.3).

### 2.1 Markup group ↔ the More "Markup" item (2026-10-05, owner decision)

The desktop **Markup group stays on the Header toolbar**, and the More entry labelled **Markup**
is retained at the same time. This is deliberate, and the two are not a duplicate action host:

- The toolbar group is **direct access** to the individual tools (Highlight, Underline, Erase) with
  `aria-pressed` state, per §4.1 and §5.
- The More `Markup` item is the **disclosure route to that same tools surface** — it opens the markup
  tools dialog/palette, exactly as the mobile band does at ≤1023px where no toolbar group exists.

Both routes therefore converge on one markup surface; only the *entry points* differ by band. This
satisfies §2's "no duplicate canonical action host" rule: there is one markup surface and one active
tool state, reached by two access affordances that belong to different bands. On desktop the toolbar
group is the canonical host and More is the redundant convenience route; at ≤1023px More is the only
route. A change that removes the toolbar Markup group, or that gives the toolbar group and the More
item divergent state, breaks this rule.

**Rename: `Pen` → `Underline` (2026-10-05, owner decision).** The toolbar control previously labelled
`Pen` sets `activeMarkupTool` to the literal `'underline'`, so the label misdescribed the behavior.
Renamed to `Underline` together with its icon, its `aria-label`, and the `onPen` prop (`onUnderline`).
No behavior, state, or shortcut changes — only the name and the icon. `docs/mobile-chrome.md` §6 label
changes do not apply here; this is a desktop toolbar control, not a More menu item.

### 2.2 Page navigation ownership and its accessible name (2026-10-05, owner decision)

At ≥1024px the Header `ReaderToolbar` is the **sole owner** of PDF page navigation. The
Footer does **not** render a second `PageNavigation` there; it keeps only the progress bar
and percentage (§3 applies the same single-owner rule to zoom). Below 1024px the Footer
remains the navigation host and is unchanged.

The Header page-count button therefore carries the stable accessible name
**`Current PDF page`**. This is deliberate:

- It is the single stable handle for the page/location control across both bands, so the
  Footer at ≤1023px and the Header at ≥1024px expose **the same accessible name** for the
  same product action. Tests may select it by that name at any width.
- It must not also carry `Previous page` / `Next page`, because those two labels belong to
  the sibling stepper buttons in the same group. Exactly one `Current PDF page` and exactly
  one `Next page` exist per band.
- The visible text stays `{page} / {total}`, and `title` / `aria-description` carry the full
  `Page {page} of {total}` sentence, so no information present in the old
  `Page {page} of {totalPages}` label is lost.

**Activating the Header page-count button opens `Go to location`.** Because the Footer is no
longer a navigation host at ≥1024px (§2.2 above), the Header button is the only opener of the
`Go to location` dialog in that band, so **single ownership also means single reachability**:
the `Go to location` dialog must remain reachable at ≥1024px. Activating the Footer button at
≤1023px opens the same dialog (`DocumentPosition.tsx` `PageNavigation` `onClick={onOpen}`), so
both bands present the same action with the same outcome. The Header button therefore does
**not** jump directly; it opens the dialog, matching the Footer. `Go to location` stays a
dialog at every density and is not merged into the toolbar.

## 3. Zoom ownership

`ReaderToolbar` owns the zoom selector and stepper at ≥1024px. `PdfViewer` computes `stepZoom` and `scaleFor`; it must **not** render a zoom control band of its own. The Footer no longer owns a zoom host at desktop. One selector+stepper, one owner, no duplicate control.

### 3.1 Zoom selector semantics

The zoom selector exposes exactly these choices:

- **Automatic** — connects to existing automatic/fit behavior (fit-width)
- **75%** — renders at 75% scale
- **100%** — renders at 100% scale
- **125%** — renders at 125% scale
- **150%** — renders at 150% scale

Selecting an explicit percentage switches to custom scale mode and renders at that percentage. Selecting Automatic restores the automatic/fit behavior. The displayed value always represents the actual PDF rendering scale.

## 4. CSS ownership

Desktop presentation lives in [`src/styles.desktop-reader.css`](../src/styles.desktop-reader.css), guarded by `@media (min-width: 1024px)`. Dead rules for markup that no longer renders — `.reader-primary-tools`, `.reader-header-position`, `.toolbar-button`, `.pdf-toolbar`, `.pdf-zoom-presets`, `.pdf-more-menu`, `.pdf-footer-zoom-host` — are deleted rather than left inert. The shared [`src/reader-layout.css`](../src/reader-layout.css) keeps only band-neutral rules. The `.pdf-toolbar` hide rule in [`src/styles.mobile-reader.css`](../src/styles.mobile-reader.css) goes with the element.

The legacy `@media (min-width: 768px)` block in `styles.desktop-reader.css` is **presentational** (Quick/Full inspector header rhythm) and is retained. It does not assign control ownership, so it is not the obsolete Reader breakpoint §1.4 refers to.

### 4.1 Toolbar group styles

- `.page-navigation` — page stepper + count
- `.pdf-zoom-stepper` — zoom selector dropdown + −/+ stepper buttons
- `.reader-tools` — document tools (Contents, Notes, Markup, Print)
- `.reader-markup-tools` — Highlight, Underline, Erase with active state styling
- `.reader-more` — More trigger
- `.reader-more-menu.desktop` — downward-opening popover anchored to More trigger

### 4.2 More panel styles

- `.more-group` — grouped action sections with subtle separator
- `.more-group-label` — uppercase section label
- `.more-group-items` — vertical stack of actions
- `.more-item` — icon + short label, compact hit target
- `.more-item-icon` — 20×20 icon area, consistent visual weight
- `.more-item-label` — short text, ellipsis if needed

## 5. Accessibility

Toolbar controls meet ≥36px desktop hit targets (§1.5, §8.6). The zoom selector exposes its current value accessibly. The page-count button is named `Current PDF page` and appears exactly once per band, with `Previous page` and `Next page` unique in the same group (§2.2). Markup tools have accessible names and pressed state when active. More keeps its `aria-expanded`/`aria-haspopup`, arrow-key menu navigation and focus restoration (§14.3, §14.4). Band reordering is never so aggressive that a control falls below the hit-target minimum or disappears at 1024px.

## 6. Verification

Change class `SUBSYSTEM_LOGIC`. Commands, in order: `npm run check:css` → `npm run verify:reader` → `npm run verify:pdf` → `npm run verify:ui`. `verify:full` is escalation-only. Browser E2E is narrow and conditional; never watch mode.

Behavioral tests assert semantics — accessible names, roles, ownership across bands, and behavior at 1024 / 1280 / 1366 / 1440 / 1920. No magic coordinates, no Page Objects, no direct class mutation, and no assertion against obsolete markup that is no longer rendered.

### 6.1 Required test coverage

- Header: complete desktop toolbar exists; Highlight/Underline/Erase available with accessible names; no duplicate canonical action hosts; exactly one `Current PDF page`, `Previous page` and `Next page` at ≥1024px (§2.2), and exactly one of each inside the Footer at ≤1023px
- Page navigation: at ≥1024px activating `Current PDF page` opens the `Go to location` dialog, entering a page number and confirming changes the current page (§2.2); the Footer at ≤1023px opens the same dialog
- More: opens downward by default; remains visible; not clipped/covered; opening does not alter Reader document geometry; compact action labels present; secondary actions accessible
- Zoom: selector exposes Automatic, 75%, 100%, 125%, 150%; selecting each explicit value changes actual PDF rendering scale; Automatic restores automatic behavior; current selection reflected in control; zoom does not change current page identity; rendered page geometry corresponds to selected scale
- Responsive desktop: behavioral checks at 1024px, 1280px, 1366px, 1440px, 1920px
