# Fact Report — Mobile PDF: transparent hidden chrome / PDF-under-chrome overlay

**Date:** 2026-10-02
**Role:** Investigator (read-only; no production files modified)
**Status:** Investigation complete. Nothing implemented.

## Verdict

**Recommendation: B — PDF visually underneath a transparent chrome overlay**, implemented as a
**visibility-only** change on the *visible* header. The PDF reading box never moves, resizes, or
reclaims the 88px band; the chrome simply stops occluding it.

Explicitly **not** recommended: any change that makes the PDF box grow upward into the header band.
That is a geometry change and is out of contract, so it is reported here as NOT FEASIBLE rather
than proposed as a workaround.

---

## 1. Is transparent hidden chrome technically feasible?

**Yes — but only as part of B, and only for the *visible* header.** It is not feasible as a
standalone option A, because on mobile the header is `position: fixed` and the geometry contract
depends on that.

The contract in `styles.mobile-reader.css` is:

```css
.reader-shell.reader-shell[data-reader-surface="original"] .reader-viewport,
.reader-shell.reader-shell[data-reader-surface="reading"] .reader-viewport { position: relative; top: var(--reader-header-height); }
```

Because `.reader-viewport` is only `position: relative`, it does not establish a containing block
for the fixed header, so the header still resolves to the **viewport**, not the shell. That is what
makes the overlay free: the header is already layered above the content at z-index 32 and is *not*
clipping or displacing anything. Making its background transparent therefore changes only what
pixels are visible through it, never geometry.

Option A as literally posed (transparent header **only**) would produce an empty 88px band showing
the `--reading-surface` shell background with floating unbacked controls — controls on top of
nothing. That is not a useful visual result and is why B supersedes it.

Note that under `chrome-quiet` the header gets `transform: translateY(-100%); opacity: 0;
pointer-events: none` (`reader-layout.css:108`), so the *hidden* state already shows whatever is
underneath it. The header's opacity is therefore already variable without touching geometry.

## 2. Is PDF-under-chrome overlay feasible without changing viewport geometry?

**Yes, for the transparency effect. No, for real page pixels in the band.**

The 88px band contains no PDF pixels today. Showing real PDF pixels there without moving the box
would require the PDF layer to be *lifted* into a region it does not occupy. Any mechanism that does
this — `transform`, negative margin, or removing the `top:` offset — either:

- moves the **scroller's box** (changing what is visible and scrollable, i.e. a geometry change), or
- moves the scroller's contents while the box stays, which then clips or reveals content differently
  and changes the visible scroll region.

Note that `transform` does not affect layout, so it does not change `scrollTop`, page index, or `%`.
But translating the whole scroller *does* move its box, and a moved box changes the visible reading
region. There is no third mechanism.

| Approach | Geometry | Verdict |
| --- | --- | --- |
| Transparent chrome over the **existing** box | unchanged | **Feasible (B)** |
| Extend the PDF box upward into the 88px band | changed | **NOT FEASIBLE** — report only, no workaround proposed |

**Correction to the framing of the task:** the premise that the 88px area "can visually show the PDF
without changing the PDF reading box geometry" is **false under this contract**. Real PDF pixels in
that band require the reading box to occupy that band. The only contract-preserving result is the
transparency in B, which shows the surface behind the chrome (page edges, shadows, page margins)
rather than advancing the reading box.

## 3. Exact DOM / layer relationship causing or preventing it

```text
.reader-shell                      min-height:100dvh; background:var(--reading-surface)
├─ .reader-header                  position:fixed; inset:0 0 auto; z-index:32
│                                  height/min-height:var(--reader-header-height)
│                                  background:var(--reading-surface)   ← opaque, blocks view
│                                  border-bottom:1px solid var(--border) ← opaque 1px line
│                                  box-shadow:none; backdrop-filter:none
├─ .reader-progress  (footer)      (transforms out under chrome-quiet)
└─ .reader-viewport                position:relative; top:var(--reader-header-height)  ← OFFSET
   ├─ [surface="original"] .pdf-viewer-wrap   height:calc(100dvh - var(--reader-header-height))
   │  └─ .pdf-scroll                           flex:1; overflow:auto; overflow-anchor:none
   │     └─ .pdf-pages > .pdf-page-slot       background:#fff; box-shadow:0 3px 16px rgba(0,0,0,.38)
   └─ [surface="reading"]  .pdf-reading-view   height:100dvh
      └─ .pdf-reading-scroll                  flex:1; overflow:auto
         └─ .pdf-reading-page
```

Two rules fully determine the outcome:

1. **`styles.mobile-reader.css:41-46`** — `.pdf-viewer-wrap`/`.pdf-reading-view` are `100dvh` tall,
   and `.reader-viewport` is pushed down by `top: var(--reader-header-height)`. For `original` the
   wrap is additionally shortened by the header height so the box still fits. **The 88px band is
   therefore empty of PDF pixels; it shows `.reader-viewport`'s `--reading-surface` background.**
2. **`reader-layout.css:16-22`** — the header paints an opaque `--reading-surface` background plus
   an opaque `border-bottom` over that band.

Cascade note (resolved): `--reader-header-height` at ≤767px is
`calc(88px + env(safe-area-inset-top))` from `styles.mobile-reader.css:5`, whose doubled
`.reader-shell.reader-shell` specificity deliberately overrides the `max-width:1023px` values in
`reader-layout.css:93-94` (56px/108px) and `:226-227` (100px/152px). This matches the
`headerBottom <= 88` assertion in `e2e/pdf-mode-layout.spec.ts:39`.

### Confirmed non-blockers

- **No clipping ancestor.** `.reader-shell`, `.reader-viewport`, `.pdf-viewer-wrap` and
  `.pdf-reading-view` declare no `overflow: hidden|clip` on mobile. The only mobile
  `overflow: hidden` is `.reader-header-leading` (line 16), which clips its *own* children, not the PDF.
- **No `contain`/`filter`/`transform` ancestor** that would turn `.reader-shell` into a containing
  block and trap the fixed header.
- **No progress bar inside the header** — `.reader-progress` is a sibling of `.reader-viewport`,
  not a child of `.reader-header`. It does not need to change.
- **No mask/gradient** on the header or shell on mobile.
- **`.pdf-toolbar` is `display: none` for `original`** (`styles.mobile-reader.css:53`) and is an
  absolutely-positioned overlay otherwise; it is a sibling of `.pdf-scroll` inside `.pdf-viewer-wrap`,
  so it stays put under a transparent header.
- **`PdfReadingNavigation` is never mounted** — no `import` / `<PdfReadingNavigation` exists anywhere
  in `src/`. The `backdrop-filter: blur(8px)` nav is dead code on both surfaces, so it is not a blocker.

## 4. Smallest CSS-only change required (the B implementation)

The minimum is **one rule in one place**, scoped so nothing else moves:

```css
/* Inside the existing @media (max-width: 767px) block in styles.mobile-reader.css.
   Visibility-only: removes the chrome's opaque paint so the surface behind it shows through
   the 88px band. Does not alter position, inset, z-index, height, or any scroll input. */
.reader-shell.reader-shell .reader-header {
  background: color-mix(in srgb, var(--reading-surface) 72%, transparent);
  border-bottom-color: transparent;
  backdrop-filter: blur(6px);
}
```

Why this is the smallest sufficient change, and why it is contract-safe:

- It touches **paint only**. `position: fixed`, `inset: 0 0 auto`, `z-index: 32`, `height` and
  `min-height` are all untouched, so the header still reserves exactly the same 88px and still
  occludes hit-testing identically.
- `.reader-viewport`'s `top:` offset is **not** removed, so no viewport height change, no
  `scrollTop` change, no page/% change, and no document-coordinate shift occur.
- Because `.reader-viewport` is only `position: relative`, the fixed header is not trapped by the
  viewport, so the transparent region genuinely reveals whatever sits behind it in document flow.
- It applies to **both** surfaces at once — both `.pdf-viewer-wrap` and `.pdf-reading-view` are
  descendants of the same `.reader-viewport`.

Partial alpha plus `backdrop-filter` (rather than bare `transparent`) is specified deliberately: a
fully transparent header would put bare white PDF pages behind 12px text, and in light theme
(`--reading-surface: #fff`, `--subtle-surface: #fafafa`) the band would become indistinguishable
from the page. `backdrop-filter` does not affect layout, and the base rule already sets
`backdrop-filter: none` at `reader-layout.css:21` with no mobile override, so re-enabling it on
mobile introduces no new stacking behaviour.

## 5. Does it work for both PDF Original and PDF Reading?

**Yes, for the transparency effect.**

| | Original | Reading |
| --- | --- | --- |
| Header descendant of same `.reader-viewport` | yes (`App.tsx:603-609`) | yes (`App.tsx:603-609`) |
| `chrome-quiet` engages | yes — `.pdf-scroll` is the scroller; taps on `.pdf-page` | yes — `.pdf-reading-scroll` |
| Mobile `top:` offset present | yes (line 44) | yes (line 44) |
| Mobile chrome compensation padding | yes — `.pdf-scroll` (lines 51, 54) | yes — `.pdf-reading-scroll` (line 50) |
| Transparency rule applies | yes | yes |

Both surfaces share `.reader-header` inside `.reader-shell`, so a single selector covers them. The
only per-surface differences are the chrome-compensation padding and the `original`-specific
`min-height: 0` / shortened wrap height — none of which the change touches.

## 6. Must any existing background / stacking / overflow rule also change?

| Rule | Location | Must change? | Reason |
| --- | --- | --- | --- |
| `.reader-header { background }` | `reader-layout.css:17` | **Yes** | Opaque `--reading-surface`; the blocker. |
| `.reader-header { border-bottom }` | `reader-layout.css:18` | **Yes** | Opaque 1px rule across the band. |
| `.reader-header { box-shadow }` | `reader-layout.css:18` | No | Already `none` on the reader header. |
| `.reader-header { backdrop-filter }` | `reader-layout.css:21` | No | Already `none`; re-enabling is part of the chosen rule, not a separate edit. |
| `.reader-viewport { background }` | `reader-layout.css:35` | No | This is the surface *revealed* by the change, not an occluder. |
| `.reader-shell { background }` | `reader-layout.css:13` | No | Same — revealed, not occluding. |
| `.pdf-viewer-wrap { background }` | `reader-layout.css:43` | No | Revealed surface; `--subtle-surface` is what shows through. |
| `body:has(...){overflow:hidden}` | `styles.reader-base.css:110` | No | Only suppresses document scroll; no clipping of the fixed header. |
| `.reader-header-leading{overflow:hidden}` | `styles.mobile-reader.css:16` | No | Clips its own children only. |
| `.pdf-page-slot` shadow | `styles.reader-base.css:36` | No | Cosmetic; see risks. |
| `.pdf-toolbar` | `styles.mobile-reader.css:52-53` | No | Sibling of `.pdf-scroll`; `display:none` for `original`. |
| `chrome-quiet` transforms | `reader-layout.css:108-109` | No | Header opacity is already animated; must **not** be touched. |
| `.reader-progress` | sibling of viewport | No | Not in the header; never occludes the band. |

No stacking-context or overflow change is required — no `z-index` edits, no new stacking contexts,
no `isolation`, no `overflow` edits.

## 7. Visual and regression risks

**Visual**

1. **Legibility is the primary risk.** A fully transparent header places white PDF pages directly
   behind 12px title/label text. Mitigated by the frosted variant in §4; a *bare*
   `background: transparent` is likely unusable in light theme.
2. **`--reading-surface` is `#fff` in light theme and `#141516` in dark** (`styles.css:24`,
   `styles.css:18`). A fully transparent header over a white page is nearly indistinguishable in
   light theme in the band where a white page sits behind it — the "chrome disappears" effect will
   look like a bug. Partial alpha is the safer target.
3. **`.pdf-page-slot` shadow** (`0 3px 16px rgba(0,0,0,.38)`) may now show at the band's lower edge
   where the page stack begins, producing a hard shadow line at y=88px. Likely the most visible artifact.
4. **`--subtle-surface` vs `--reading-surface` seam.** `.pdf-viewer-wrap` uses `--subtle-surface`
   (`#fafafa`) while the shell/viewport use `--reading-surface` (`#fff`). With the header
   translucent, any offset between those in the band reads as a faint horizontal seam.

**Regression**

5. `e2e/pdf-mobile-chrome-space.spec.ts` asserts `viewportTop`, `scrollTop`, page, percent and
   `footerTop` invariance across the `chrome-quiet` transition. Paint-only change → all still hold.
6. `e2e/pdf-mode-layout.spec.ts:39` asserts `headerBottom <= 88`. Header height untouched → holds.
7. **`npm run check:css`** must still pass.
8. Contrast-axe tests, if any exist, may fail on a fully transparent header; not enumerated in this report.
9. The `.reader-reveal` "Aa ···" button appears at
   `bottom: max(8px, env(safe-area-inset-bottom))` (`styles.mobile-reader.css:68`) — bottom-anchored,
   unrelated to the header band.

## 8. Minimal Implementer task (only if B is chosen)

```text
ROLE: Implementer
SPEC: docs/tasks/2026-10-02-mobile-pdf-transparent-chrome-investigation.md

Goal: on mobile (<=767px) only, make the reader header non-occluding so the surface behind it shows
through the 88px band. Visibility-only.

Change exactly one rule inside the existing @media (max-width: 767px) block in
src/styles.mobile-reader.css:

  .reader-shell.reader-shell .reader-header {
    background: color-mix(in srgb, var(--reading-surface) 72%, transparent);
    border-bottom-color: transparent;
    backdrop-filter: blur(6px);
  }

Do NOT touch: position/inset/z-index/height/min-height on .reader-header; the
`top: var(--reader-header-height)` offset on .reader-viewport; the chrome-compensation padding on
.pdf-scroll / .pdf-reading-scroll; any chrome-quiet rule; any --reader-header-height value; any
height/min-height/dvh value; any JS/TSX file.

Acceptance:
1. No `top: 0` transition, viewport height change, scrollTop change, page/% change, or
   document-coordinate shift on chrome-quiet.
2. Works on both data-reader-surface="original" and ="reading".
3. Header text stays legible in light and dark theme.

Verify (change class LOCAL_UI, per docs/testing.md):
  npm run check:css
  npx playwright test e2e/pdf-mobile-chrome-space.spec.ts e2e/pdf-mode-layout.spec.ts
```

---

## Explicitly NOT FEASIBLE (reported, not worked around)

Making the PDF **reading box** extend into the 88px band — i.e. real, additional page content
visible above the current reading box top — cannot be done under the stable-viewport contract. It
requires removing the `.reader-viewport` mobile `top:` offset and the scroller chrome-compensation
padding, which changes viewport height, visible content, and the scrollable range. Per the task
scope, this is reported as NOT FEASIBLE rather than proposed as a geometry workaround.

## Files referenced

- `src/styles.mobile-reader.css` — lines 3-15 (fixed header + 88px var), 40-54 (Task A stable
  viewport), 64-65 (chrome-quiet toolbar/progress), 16 (`overflow:hidden` on leading only)
- `src/reader-layout.css` — 6-13 (shell), 16-22 (header paint), 35 (viewport bg), 43 (wrap bg),
  93-94 / 226-227 (superseded header-height values), 108-109 (chrome-quiet)
- `src/styles.reader-base.css` — 29 (`.pdf-scroll`), 36 (`.pdf-page-slot` shadow), 48
  (`.pdf-reading-view`), 108 (`overflow-anchor:none`), 110 (`body{overflow:hidden}`)
- `src/styles.css` — 18/24 (`--reading-surface` `#141516` / `#fff`), 25 (`--subtle-surface` `#fafafa`)
- `src/reader/ReaderShell.tsx` — 20-22 (scroller selectors), 71-77 (quiet trigger), 90 (class)
- `src/app/App.tsx` — 603-609 (viewport + surface selection)
- `src/reader/pdf/PdfViewer.tsx` — 137-150 (DOM chain)
- `src/reader/pdf-reading/PdfReadingView.tsx` — 73-87 (DOM chain)
- `e2e/pdf-mobile-chrome-space.spec.ts` — executable stable-viewport contract
- `e2e/pdf-mode-layout.spec.ts` — 38-43 (88px cap), 55-76 (reading stability)