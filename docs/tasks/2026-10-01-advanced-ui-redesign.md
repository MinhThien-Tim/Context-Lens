# Advanced UI redesign — Planner handoff

Date: 2026-10-01 · Role: Planner (read-only) · Status: implementation-ready spec, nothing implemented.

> **Revisited 2026-10-02.** Four additional product requirements were added: **Advanced is the
> first-launch default**, homepage/interface choices persist, explicit `false` states persist, and
> **major Advanced blocks must be sharp rectangles**. The revision lives in **§13–19** and
> **supersedes decision D4** (radius). Where the two disagree, §13–19 win.

---

## TASK

Redesign the **Advanced** interface of Context Lens onto a monochrome, light, editorial design
system (colors, type scale, spacing, radius, component rules) without changing any reader / PDF /
lookup behavior, and without touching Simple mode's presentation. Advanced-only presentation changes;
Simple keeps today's visuals.

---

## 1. Current Advanced UI architecture

### Entry points

| Surface | Entry | Evidence |
| --- | --- | --- |
| Advanced home | `preferences.interfaceMode === 'advanced'` → second JSX branch of the home shell | [App.tsx](../../src/app/App.tsx) `502–586` (Simple `506–542`, Advanced `543–583`) |
| Advanced stylesheet | lazy `void import('../home-advanced.css')` in an effect gated on `interfaceMode === 'advanced'` | [App.tsx](../../src/app/App.tsx) `491–493` |
| Reader | single shell element carrying `data-interface-mode` | [ReaderShell.tsx](../../src/reader/ReaderShell.tsx) `90` |
| Quick Card (Advanced) | `data-quick-mode="standard"` on the lookup sheet | [LookupBottomSheet.tsx](../../src/components/LookupBottomSheet.tsx) `177`, `55` |
| Advanced-only reader control | desktop Context button | [ReaderToolbar.tsx](../../src/reader/ReaderToolbar.tsx) `44` |

### Relevant files (current state)

- Home composition: [App.tsx](../../src/app/App.tsx) — `readerStyle` memo `238–243`, preference-reset effects
  `245–257`, `continueReadingSection` `495–500`, home shell `502–586`, reader return `589–618`.
- Advanced home presentation: [home-advanced.css](../../src/home-advanced.css) — 204 lines, **two passes**:
  editorial structure `1–152`, then a `/* Color only */` recolor pass `141–207` that re-binds
  `--bg/--surface/--line/--muted/--border/--secondary-text/--muted-text` inside the Advanced scope.
- Global tokens + Advanced semantic palette: [styles.css](../../src/styles.css) — `:root` `1–14`, dark `18`,
  System Reading Mode `:has()` palette `20–33`, semantic aliases `104`, 2026 refresh block `239–254`
  (`--space-1..7` = 4/8/12/16/24/32/48, `--radius-sm/md/lg` = 8/12/16), shared home-function colors
  `440–450`, and the **Advanced-only block `613–722`**: `--advanced-orange #a95032`,
  `--advanced-green #657744`, `--advanced-gold #98702d`, `--advanced-blue #526f88` (+ `-soft`),
  `--advanced-paper #fbf8f1`, dark variants `697–706`, system variants `710–722`.
- Reader presentation: [reader-layout.css](../../src/reader-layout.css) (import chain `1–3`, shell header grid
  `15–24`), [styles.reader-base.css](../../src/styles.reader-base.css), [styles.desktop-reader.css](../../src/styles.desktop-reader.css),
  [styles.mobile-reader.css](../../src/styles.mobile-reader.css).
- Presentational components advanced touches: [DocumentIdentity.tsx](../../src/components/DocumentIdentity.tsx),
  [ContinueReading.tsx](../../src/components/ContinueReading.tsx), [PasteComposer.tsx](../../src/components/PasteComposer.tsx),
  [ReaderSettings.tsx](../../src/components/ReaderSettings.tsx), [LookupBottomSheet.tsx](../../src/components/LookupBottomSheet.tsx),
  [QuickExplain.tsx](../../src/components/QuickExplain.tsx), [ExpandedExplain.tsx](../../src/components/ExpandedExplain.tsx).
- Responsive authority: [useDesktop.ts](../../src/components/useDesktop.ts) — single `matchMedia('(min-width: 1024px)')`.

### Current styling/token architecture (facts)

- **Isolation already exists structurally.** Advanced and Simple are two separate JSX trees; the shell
  element carries `data-interface-mode` (`App.tsx:503`, `ReaderShell.tsx:90`). Every Advanced rule in
  `home-advanced.css` is scoped `.home-shell[data-interface-mode="advanced"]`.
- **Three-layer token model.** `:root` base palette (`--bg #f8f7f3`, `--surface #fffefa`, `--text #1d2623`,
  `--muted #6c7470`, `--line #deded8`, `--accent #165c50`, `--accent-soft #e2efeb`) → semantic aliases
  (`--primary-text`, `--secondary-text`, `--border`, `--elevated-surface`, `--reading-surface`, `--shadow`,
  `--danger`, `--selection`) → functional accents (`--context #27689a`, `--language #765ca1`,
  `--notes #956500`, `--vocabulary #28774e`, `--home-function`).
- **Advanced scope already re-binds tokens** inside `home-advanced.css:91–105`; the pattern is established.
- **Radius vocabulary is multi-valued**: `--radius-control:6px`, `--radius-surface:8px`, `--radius-sm:8px`,
  `--radius-md:12px`, `--radius-lg:16px`, plus literals 2/3/4/5/6/7/9/10/11/12/14/17/18px/50%/999px.
  Declaration counts: styles.css 92, reader-layout.css 49, styles.reader-base.css 29, home-advanced.css 9,
  styles.mobile-reader.css 7, styles.desktop-reader.css 4.
- **Shadow usage is pervasive** (`box-shadow:` — styles.css 18, styles.reader-base.css 13, reader-layout.css 12,
  home-advanced.css 7, mobile 3, desktop 2).
- **Spacing is mostly literal**: `var(--space-*)` appears 29× in reader-layout.css, 5× in styles.css and 0×
  in the other three; the rest are raw px (~140 in styles.css, ~65 in reader-layout.css, ~34 in reader-base).
- **No font infrastructure.** `--font-ui` is a system sans stack, `--font-display`/`--font-reading` are
  Georgia/serif; there is no `@font-face`, no font file in `public/`, and no font `<link>` in `index.html`.
- **Reader typography is user-controlled**: `readerStyle` (`App.tsx:238–243`) emits `--reader-size`,
  `--reader-leading`, `--reader-font`, `--reader-gutter-total`, `--reader-page-padding` as inline style.

---

## 2. Current → Target mapping

| Area | Current | Verdict | Reason |
| --- | --- | --- | --- |
| `data-interface-mode` shell contract | attribute on `.home-shell` / `.reader-shell` | **KEEP** | It is the isolation mechanism and an e2e contract. |
| Advanced JSX branch in `App.tsx` | second tree, own sections + `DocumentIdentity` | **KEEP** | Structure is already Advanced-specific; redesign is CSS-side. |
| Lazy `home-advanced.css` import | effect gated on mode | **KEEP** | Bundle/precache contract; Advanced-only presentation already isolated. |
| `--advanced-*` chromatic palette (styles.css `613–722`) | orange/green/gold/blue + paper | **REPLACE** | Directly contradicts monochrome rule; drives the "multi-colored" Advanced look. Keep the *selector*, replace the *values* with the monochrome set. |
| Standard-Quick recolor (`styles.css:624–722`) | tuned to the 4 chromatic hues | **RESTYLE** | Keeps the `standard` presentation but must adopt the new monochrome interaction/state colors. |
| Advanced home shell background/border | `--bg` + `border-top:3px solid var(--advanced-orange)` | **RESTYLE** | Becomes `--canvas` surface with a `--soft-border` hairline; the 3px colored top rule is removed. |
| Brand header / `home-nav` / nav buttons | flex-wrap row, `--advanced-blue` text | **RESTYLE** | Monochrome nav, spacing from the new scale, 44px targets preserved. |
| `home-preferences` bar | inline row, 12px text, `--muted` | **RESTYLE** | Editorial secondary row; keep every control and the `appearance-control` `margin-left:auto`. |
| `home-intro` (eyebrow + h2 + p) | `clamp(30px,3vw,40px)` serif, orange eyebrow | **RESTYLE** | Adopts the JetBrains display scale (adapted, see §4); eyebrow becomes monochrome. |
| `home-entry-actions` anchors | text/primary buttons colored blue/orange | **RESTYLE** | One primary (black), rest quiet. Anchors `#paste-text/#import-document/#library` preserved. |
| `primary-actions` grid + action cards | two transparent top-bordered cards, hue per card | **REFACTOR** (light) | Cards become tokens-driven surfaces (`--panel-tint`) instead of hue-coded `--home-function` per card; the shared `.action-card` / `.action-card-icon` / `.document-drop` selectors in `styles.css:440–450` must be re-bound inside the Advanced scope or they leak hue. |
| PasteComposer | shared component, Advanced variant via `.paste-card` | **KEEP** + **RESTYLE** | Behavior and element structure frozen; only Advanced-scoped tokens change. |
| Import card (`#import-document`, `#article-url`, drop zone, `Import URL`) | hue-coded, 154px drop | **RESTYLE** | Drop zone becomes `--panel-tint` + 1px `--soft-border`; 44px `Import URL` minimum preserved. |
| Continue Reading (`continue-section`, `continue-card`) | green left rule, tinted surface, cover 40px | **RESTYLE** | Monochrome surface with a `--foreground` accent rule; **geometry frozen** (≤104px height, cover present). |
| Library (`library-section`, `library-tools`, `library-grid`, `library-open`, `library-card`, `library-delete`) | gold accents, 2-col ≥768/1-col mobile, 3-row copy grid | **RESTYLE** | Monochrome; layout metrics kept because the e2e asserts card/cover presence and scrollWidth. |
| `document-cover` (spine + radius 2/5/5/2) | gold/green tinted, `border-left:4px` | **RESTYLE** | Becomes `--panel-tint` with `--foreground` spine; keep aspect `2/3` and the `>span`/`b`/`i` children. |
| `section-heading`, `section-empty`, `eyebrow`, `home-note` | mixed 20/26px, hue-tinted | **RESTYLE** | Pure type/spacing change. |
| `home-advanced` `<details>` Tools popover | Advanced: `position:relative`, 190px popover | **KEEP** | Simple-only disclosure; Advanced already renders diagnostics directly. |
| `home-diagnostics` (LookupStatistics) | 44px min-height wrapper | **RESTYLE** | Surface/tone only. |
| `OnboardingCard`, `ContextLensOnboarding`, `ApiSettings`, `VocabularyLibrary`, `ReaderSettings` dialogs | shared modals, `--shadow` | **KEEP** | Out of the Advanced redesign surface; shared with Simple. Revisit only if they consume a token the redesign changes. |
| Reader shell / toolbar / panels geometry | grid, 44px rows, mobile `--reader-header-height` | **KEEP** | Behavior-critical; see §4/§5 open questions. |
| Reader chrome *visual tone* | cool base palette | **RESTYLE (optional phase)** | Only if Advanced reader chrome is accepted into scope; must not alter geometry. |
| `LookupBottomSheet` structure + `data-quick-mode` semantics | simple/standard/full | **KEEP** | Behavior + e2e contract (`Use Standard/Simple Quick card`). |
| `--space-1..7`, `--radius-*` global tokens | 4/8/12/16/24/32/48, 8/12/16 | **KEEP (add aliases)** | Reader/panel geometry depends on them; Advanced gets its own scoped aliases instead of renumbering. |
| `--font-display` Georgia serif | editorial serif | **REPLACE (Advanced scope only)** | The requested scale is a sans (JetBrains); scoped so Simple keeps the serif. |
| `.brand-mark`, `--advanced-on-color` | inverted black-on-color | **RESTYLE** | Becomes `--foreground` on `--background` (pure monochrome). |
| Focus-visible ring (`home-advanced.css` last rules) | hue-specific ring per control | **RESTYLE** | Single monochrome ring token for Advanced. |

---

## 3. Target Advanced information architecture

The Advanced home keeps **one scrolling surface** with named anchors (the existing structure is
already a coherent IA; the redesign tightens hierarchy rather than re-architecting routes).

```
Advanced home shell (data-interface-mode="advanced")
├─ brand-header ── home-nav (Documentation · Tools · Continue · Paste · Import · Library)
├─ home-preferences  (Reading/Typography · LanguageToggle · Interface density[Simple|Advanced] · Appearance)
├─ home-intro        (eyebrow · display H1-ish statement · one supporting line)
├─ continue-section  (#continue)  →  continue-grid / continue-card ×N
├─ primary-actions   (#paste-text · #import-document)
│   ├─ paste-card    → composer title · mode toggle · textarea · primary action
│   └─ import-card   → heading + icon · document-drop · #article-url + Import URL · progress/error
├─ library-section   (#library)  → section-heading · library-tools (search · type filter) · library-grid · Load more
├─ home-diagnostics  (LookupStatistics; Advanced renders inline, no <details>)
└─ home-note + conditional overlays (ReaderSettings, Onboarding, ApiSettings, VocabularyLibrary…)

Reader (unchanged IA)  reader-shell[data-interface-mode="advanced"]
├─ ReaderToolbar (back · title · Contents · Advanced-only Context) ── chrome-quiet gestures
├─ reader viewport (.reader-text / PDF host)
└─ lookup surfaces: quick[data-quick-mode="simple"|"standard"] · deep/panel (full, .expanded)
```

Hierarchy rules applied to this IA:

1. **One primary action per view region.** Entry region: the paste composer's submit is the only solid
   black control; `Import URL` becomes an outline secondary. Continue region: cards are fully clickable,
   no button. Library region: `Load more` is the only secondary here.
2. **Position encodes priority.** Continue Reading stays above entry actions (current Advanced order);
   the redesign reinforces that with size (`H2`-level section heading) rather than hue.
3. **Section rhythm replaces color coding.** Sections are separated by `--soft-border` hairlines and the
   Advanced section gap, not by per-section hues.
4. **Metadata is appended, never competing**: `.eyebrow`, `.document-badge`, `small`, `.document-last-opened`
   are all `--subtle`/11–13px.
5. Anchors `#paste-text`, `#import-document`, `#library`, id `article-url` and all control labels are
   IA contracts and do not move.

---

## 4. Target design-token specification

### Token location (decision)

**One scoped block, no new token file.** Extend the existing shared Advanced selector in
[styles.css](../../src/styles.css) — the block currently at `613–722` — because that selector is already the
single place both Advanced consumers read from:

```css
.home-shell[data-interface-mode="advanced"],
.reader-shell.reader-shell .lookup-sheet.quick[data-quick-mode="standard"] { … }
```

Rationale: `home-advanced.css` is **lazy-loaded** but Standard Quick is rendered in the reader without
it, so Advanced tokens must live in the eagerly-loaded `styles.css`. Adding a new
`advanced-tokens.css` would split one concern across two files for no functional gain.

### Color

```css
--a-canvas:        #F2F1EC;
--a-background:    #FFFFFF;
--a-foreground:    #000000;
--a-muted:         #555555;
--a-subtle:        #686868;
--a-soft-border:   #AAAAAA;
--a-panel-tint:    #F7F6F2;
```

Scoped semantic re-binding so existing Advanced components keep consuming generic names (this is the
mechanism that keeps Simple untouched):

```css
--bg: var(--a-canvas);
--surface: var(--a-background);
--elevated-surface: var(--a-background);
--reading-surface: var(--a-background);
--text: var(--a-foreground);
--primary-text: var(--a-foreground);
--muted: var(--a-muted);
--secondary-text: var(--a-muted);
--muted-text: var(--a-subtle);
--line: var(--a-soft-border);
--border: var(--a-soft-border);
--accent: var(--a-foreground);
--accent-soft: var(--a-panel-tint);
--selection: var(--a-panel-tint);
--home-function: var(--a-foreground);
--home-function-soft: var(--a-panel-tint);
--shadow: none;
```

Rules:
- Black is accent/primary only: `.brand-mark`, one primary button per region, `.document-cover` spine,
  active tab indicators, `aria-pressed="true"` fills.
- `--a-panel-tint` carries card/drop-zone/secondary-row layering; `--a-canvas` is the page level;
  `--a-background` is every text-bearing surface.
- `--a-soft-border` is the only border color in Advanced; `1px` hairlines, plus `3px` left rules on
  cards when an accent rule is needed.
- **Slate/functional tokens retained** (and only these, in Advanced scope):
  `--danger` (destructive `.library-delete`, import error), `--error` (`.import-error`),
  `--context`/`--language`/`--notes`/`--vocabulary` for the lookup surfaces' *semantic* signal inside
  Standard Quick only. Everything else `--advanced-*` (orange/green/gold/blue/paper and their `-soft`)
  is **deleted**, including the dark/system variants.
- Distinguishing Paste vs Import: by **form and hierarchy**, not hue — Paste = inline composer with a
  solid primary; Import = tinted drop zone + outline secondary. This is a deliberate deviation from the
  current "Paste blue / Import green" rule in [ui-system.md](../ui-system.md).

### Typography

```css
--a-font-display: 'JetBrains Sans', 'JetBrains Mono', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
--a-font-body:    var(--a-font-display);
--a-font-mono:    ui-monospace, 'JetBrains Mono', 'Cascadia Mono', Consolas, monospace;
```

| Role | Size | Weight | Line-height | Tracking | Applied to |
| --- | --- | --- | --- | --- | --- |
| Display / H1 | `clamp(34px, 4.2vw, 52px)` | 650 | 0.95 | -0.065em (≈ -3.38px @52) | `home-intro h2` only (the single hero statement) |
| H2 section | `28px` | 700 | 1.15 | -0.04em (≈ -1.12px) | `continue-section h2`, `library-section h2`, `action-card-heading h2` |
| H3 / card title | `18px` | 600 | 1.25 | -0.01em | `.document-copy strong`, `.composer-title` |
| Body | `16px` | 400 | 1.55 | 0 | intro paragraph, textarea, empty states |
| Meta | `13px` | 400/500 | 1.4 | 0.01em | badges, `small`, `.document-last-opened` |
| Micro / eyebrow | `11px` | 500 | 1.2 | 0.08em, uppercase | `.eyebrow`, `.document-resume`, letter-spaced labels |

Adaptation notes (not applied mechanically):
- The reference `52px` H1 is clamped down because the Advanced home is a working surface, not a landing
  page; `52px` is reached only at ≥1280px.
- The reference has no H3/meta step; `18px` and `11px` are added, and `13px` covers existing
  badge/metadata roles so no existing element loses its step.
- **Reader text is excluded**: `--reader-font` / `--reader-size` / `--reader-leading` come from user
  preferences via the inline `readerStyle`. The Advanced reader scope must not set `--font-reading`
  such that it overrides those (inline style wins, but do not introduce a competing rule).
- `--font-display` (Georgia serif) is **not rebound globally**; Advanced rebinds it only inside the
  Advanced scope so Simple keeps the serif.

### Spacing

Advanced scale, scoped, because the shared `--space-1..7` is load-bearing for reader geometry and
cannot be renumbered (`--space-5` is already 24px used 29× in reader-layout):

```css
--a-space-1: 4px; --a-space-2: 8px; --a-space-3: 12px; --a-space-4: 16px;
--a-space-5: 20px; --a-space-6: 24px; --a-space-7: 28px;
```

- New/rewritten Advanced rules use **only** `--a-space-*`.
- Existing Advanced literals migrate: `18px → 16px`, `14px → 16px`, `10px → 12px`, `6px → 8px`,
  `32px gap → 28px`, `190px` popover width and `150px/120px/100px/80px` min-heights are **kept**
  (layout constraints asserted by e2e or required by 44px touch targets).
- Exceptions that stay off-scale and must be justified in-file: `44px` control height (touch contract),
  `--cover-width` values, `min-height` on drop zones, `calc()` safe-area expressions.

### Radius

> **SUPERSEDED by D4′ (§16).** The `--a-radius: 8px` decision below is **void**. Major Advanced
> blocks take `border-radius: 0`; the only permitted values in the Advanced scope are `0`, `50%`
> (circular icon buttons) and the existing `--radius-control: 6px` (compact controls). The
> implementation target is [§16.2](#162-target-geometry); the notes below are retained only to show
> what changed.

```css
--a-radius: 8px;              /* VOID */
--radius-control: 8px; --radius-surface: 8px; --radius-sm: 8px; --radius-md: 8px; --radius-lg: 8px;
```

- ~~Every Advanced rule uses `var(--a-radius)`; no second radius value.~~
- ~~Two documented exceptions, both shape-bearing not stylistic: `.document-cover` keeps its spine shape
  (reduced to `0 4px 4px 0` with an 8px-compatible read), and pills/circular controls keep `999px`/`50%`.~~
- Advanced literals to migrate: `2px 5px 5px 2px`, `3px`, `4px`, `5px`, `10px`, `17px`, `18px` → `0`
  for structural blocks, or `--radius-control` for compact controls per §16.2.

### Borders, surfaces, interaction states

| Concern | Spec |
| --- | --- |
| Surfaces | page `--a-canvas`; content cards `--a-background`; tinted blocks (drop zone, continue card, secondary rows, paste-mode switcher) `--a-panel-tint` |
| Borders | `1px solid var(--a-soft-border)`; section dividers `1px solid var(--a-panel-tint)`; accent rule `3px solid var(--a-foreground)` on the leading edge of continue cards |
| Elevation | shadow-free in Advanced (`--shadow:none`); popovers/dialogs use a `1px --a-soft-border` + opaque `--a-background` instead of `box-shadow` |
| Hover | surface shift `--a-background → --a-panel-tint` (never a hue shift); text stays `--a-foreground` |
| Pressed/active | `aria-pressed="true"` / `.active` = `--a-foreground` background + `--a-background` text |
| Focus | single ring: `outline: 2px solid var(--a-foreground); outline-offset: 2px`; replaces the current per-hue `box-shadow` rings |
| Disabled | `--a-subtle` text, `--a-panel-tint` background, `cursor:not-allowed`, no border change |
| Selected/nav current | `--a-foreground` 2px underline or solid fill; no third color |
| Destructive | `--danger` text on transparent; hover `color-mix(--danger 8%, --a-background)` |
| Empty / loading / error | empty = `--a-subtle` 13px centered in a `--a-panel-tint` block; loading = text `role="status"` unchanged; error = `.import-error` keeps `role="alert"` + `--error`, now on `--a-background` |
| Transitions | reuse existing `--ui-transition:180ms`; extend to `--a-transition: 180ms ease` for Advanced; `prefers-reduced-motion` respected as today |

---

## 5. Component-level design specification

**Shell** — `.home-shell[data-interface-mode="advanced"]`: `background: var(--a-canvas)`; no colored
top rule; sections separated by `--a-space-7`; content column keeps its current max-width and centering
(existing `.home-shell` container rule is a KEEP).

**Navigation** — `.home-nav`: horizontal row, 44px min height per item, 13px/500, `--a-muted` at rest,
`--a-foreground` on hover with a 2px underline; the current-item style is the same underline, not a fill.
`Tools` popover keeps `position:absolute; right:0` and becomes `--a-background` + `1px --a-soft-border`,
no shadow.

**Buttons**
- Primary: `--a-foreground` background, `--a-background` text, weight 400, padding `8px 10px` scaled to
  the scale (`--a-space-2 --a-space-3` ≈ 8/12), `--a-radius`, min-height 44px where the control is a
  primary entry action.
- Secondary: transparent background, `1px --a-soft-border` border, `--a-foreground` text.
- Quiet/text: no border, `--a-muted` → `--a-foreground` on hover, `--a-panel-tint` hover background.
- Icon: 44px square, `--a-panel-tint` hover.
- One filled primary per region; `Load more`, `Import URL`, `Retry`, `Guide` stay secondary/quiet.

**Cards** — `.action-card`, `.continue-card`, `.library-card`: `--a-background` or `--a-panel-tint`,
`1px --a-soft-border` or hairline top border, `--a-radius`, **no shadow**. Internal padding takes the
scale (`--a-space-6` = 24px for roomy cards; existing 20px/18px/14px literals normalize to
`--a-space-5`/`--a-space-4`). The reference's 26px is not adopted literally because Advanced cards are
list rows inside a 2-column grid, not standalone marketing cards; 24px is the nearest scale step.

**Inputs** — white (`--a-background`), `1px solid var(--a-soft-border)` (1px, not 0.8px — sub-pixel
borders blur on non-retina Windows and are not used anywhere in the repo), `--a-radius`,
`--a-space-3` padding, 16px body text; focus = the single monochrome ring; placeholder `--a-subtle`.
Textarea/drop-zone heights are frozen (`.paste-editor` 140px in Advanced, `.document-drop` min-height).

**Reader** — visual-only migration only, in a separate phase and only if accepted into scope. Elements
must keep: the shell attribute/class contract (`ReaderShell.tsx:90`), `--reader-header-height` mobile
two-row math, chrome-quiet gesture classes, `.pdf-mobile-zoom-host` (queried imperatively by
`PdfViewer`), `--lookup-vv-*` positioning, the desktop 440px `.word-popup` and its
`@container (min-width:390px)` grid, and the toolbar grid
(`auto minmax(0,1fr) auto auto`) with its 44px targets. **Structural UI change is required only if**
the design wants a different reader header composition; nothing in the brief mandates it, so the
default is visual-only.

**Quick Card** — `data-quick-mode` semantics, the `simple` derivation (`LookupBottomSheet.tsx:55`), the
deep-open switch (`:177`) and the mode-toggle button `aria-label`s are frozen. Visual changes for
Advanced apply to the `standard` and `full` presentations only, through the shared Advanced token
selector: monochrome surfaces, `--a-soft-border` dividers, `--a-radius`, no shadow, `--a-foreground`
titles, `--a-panel-tint` chips — while **keeping** `--context`/`--language`/`--notes`/`--vocabulary`
as the semantic signal in `.inspector-*`, `.entry-glosses`, `.sense-pos`, `.pos-chip`. The Simple
presentation must produce byte-identical computed styles before and after.

**Panels / sheets** — `.lookup-sheet`, `.expanded`, `.settings-popover`, `.home-advanced-tools`:
surfaces become opaque `--a-background` with a `1px --a-soft-border` edge; shadows replaced. Positioning,
`env(safe-area-inset-*)`, `transform: scale()` and `z-index` layers are **KEEP** (behavioral).

**Controls** — density toggle: 44px, `aria-pressed` fill = `--a-foreground`; language cycle:
quiet text button; appearance control: 3-state quiet group; library search + type filter: inputs per the
input rule at 44px min height; `mini-progress`: `--a-foreground` at 12% track; `document-resume` 11px
`--a-subtle`/`--a-foreground` on the active continue card.

**States** — see §4 interaction-state table; all Advanced states are tone/weight changes only, so
`aria-*` semantics and existing `role="status"` / `role="alert"` usage are untouched.

---

## 6. Desktop / mobile strategy

Single implementation, three rule tiers, no second UI. Authoritative breakpoints are the ones the code
already uses: **desktop ≥1024px** (`useDesktop()`, `styles.desktop-reader.css`), **phone ≤767px**
(`styles.mobile-reader.css`, `home-advanced.css` media blocks), plus the existing **≤1023px**
intermediate block in `home-advanced.css:69`.

| Tier | Advanced home | Advanced reader / Quick |
| --- | --- | --- |
| Desktop ≥1024px | 2-col `primary-actions` (gap `--a-space-7`), 2-col continue/library grids, hero at 52px, display type largest | unchanged geometry; visual tokens only |
| Tablet 768–1023px | same 2-col entry actions, grids keep 2 columns, hero clamps to ~40px | unchanged |
| Phone ≤767px | `primary-actions` 1 column, library grid 1 column, hero clamp floor 34px, continue cards keep ≤104px, all targets 44px | unchanged; Quick/Full grids come from `styles.mobile-reader.css` |

Fixes for the crowding problems named in the brief:
- **Header/control crowding**: `home-preferences` becomes a wrapping row with `--a-space-6` row gap and
  `Appearance` pushed right by the existing `margin-left:auto`; below 767px it becomes a 2-row layout
  (Settings/Language on row 1, density + Appearance right-aligned on row 2).
- **Quick Card mobile density**: no structural change — density is addressed only by border/space
  normalization; any attempt to change the phone Full-card grid is out of scope because it is asserted
  by `ui-interactions.spec.ts`.
- **Toolbar interaction / reader viewport / zoom controls / panel behavior**: untouched in the default
  (visual-only) plan; the 44px contract and safe-area math are preserved.

---

## 7. Simple isolation strategy

Mechanism, in order of strength:

1. **Attribute scoping (primary).** Every Advanced token and rule is scoped to
   `.home-shell[data-interface-mode="advanced"]` or `.reader-shell[data-interface-mode="advanced"]`, or
   the Standard-Quick selector. Simple's `data-interface-mode="simple"` never matches.
2. **No global `:root` redefinition.** The redesign must not change any `:root` value that Simple
   consumes. `--space-1..7`, `--radius-sm/md/lg`, `--bg`, `--surface`, `--text`, `--muted`, `--line`,
   `--accent`, `--accent-soft`, `--danger`, `--error`, `--context`, `--language`, `--notes`,
   `--vocabulary`, `--font-ui`, `--font-display`, `--font-reading` stay **exactly** as they are at
   `:root`. The single permitted `:root` edit is **deleting** the `--advanced-*` declarations, which
   only the Advanced scope reads.
3. **Shared components consume scoped tokens, not new props.** `PasteComposer`, `DocumentIdentity`,
   `ContinueReading`, `LookupStatistics` etc. keep their markup and props; their Advanced look comes
   from tokens inherited inside the Advanced scope. This is why the token layer re-binds *generic*
   names (`--bg`, `--surface`, `--accent`, `--home-function`) instead of introducing parallel
   `--a-*` names everywhere: shared CSS in `styles.css:440–450` (`--home-function`, `.document-drop`,
   `.paste-mode`) is already token-driven, so re-binding it inside the Advanced scope makes shared
   selectors render monochrome in Advanced and unchanged in Simple.
4. **`--advanced-*` is not a Simple token.** Grep-verified consumers are the Advanced home shell and
   the Standard-Quick sheet only.
5. **No `Advanced*` React components are required.** The isolation is already carried by
   `data-interface-mode`; adding wrapper components would duplicate JSX for no behavioral gain and is
   explicitly rejected.
6. **Regression guard for isolation**: after each phase, assert that a Simple-mode page produces the
   same computed styles for a fixed selector list before/after (see §10 step 4). Cheapest reliable
   check available in this repo.

---

## 8. Implementation sequence

| Phase | Work | Files | Depends on | Verify |
| --- | --- | --- | --- | --- |
| **1. Token foundation** | Add `--a-*` color/space/radius/type tokens; re-bind the generic names in Advanced scope; delete `--advanced-orange/green/gold/blue/paper` (+`-soft`) and their dark/system variants; rewrite the Standard-Quick recolor to the monochrome set while keeping `--context/language/notes/vocabulary` semantics | [styles.css](../../src/styles.css) `613–722` | — | `npm run check:css`, `npm run verify:lookup` |
| **2. Home shell, nav, intro, preferences** | Shell background/hairlines, `brand-header`, `home-nav`, `home-preferences`, `home-intro` type scale, `home-entry-actions`, `home-diagnostics`, `home-note` | [home-advanced.css](../../src/home-advanced.css) `1–30`, `90–135` | 1 | `check:css`, `verify:ui`, browser `laptop` |
| **3. Entry actions + list surfaces** | `primary-actions`, `.action-card` hue removal, `.action-card-icon`, `document-drop`, `paste-card`, `import-form`, `continue-*`, `library-*`, `document-cover`, `document-copy`, `mini-progress`, `section-empty`, `library-tools` | [home-advanced.css](../../src/home-advanced.css) `24–152`, `141–207`; any shared hue leak in [styles.css](../../src/styles.css) `440–450` handled by scoped re-binding (no edit to the shared rule itself) | 1, 2 | `check:css`, `verify:ui`, `verify:import`, `verify:storage`, browser `homepage.spec.ts` |
| **4. Responsive pass** | Normalize the ≤1023px and ≤767px blocks to the scale; 2-row preferences at ≤767px; confirm 44px targets and no horizontal overflow at 320/390/768/844/1024/1366 | [home-advanced.css](../../src/home-advanced.css) media blocks `69–79`, `100–152` | 2, 3 | `check:css`, browser `mobile-chromium` + `laptop` (`homepage.spec.ts` width×theme loop) |
| **5. Advanced reader chrome (conditional)** | Visual-token adoption only, scoped `.reader-shell[data-interface-mode="advanced"]`; geometry untouched | [reader-layout.css](../../src/reader-layout.css), [styles.reader-base.css](../../src/styles.reader-base.css), [styles.desktop-reader.css](../../src/styles.desktop-reader.css), [styles.mobile-reader.css](../../src/styles.mobile-reader.css) | 1 | `check:css`, `verify:reader`, `verify:pdf`, browser `reader-p0.spec.ts` |
| **6. Typography asset (conditional)** | Bundle JetBrains `woff2` (`public/fonts/`), `@font-face` + `font-display:swap`, tighten `--a-font-*`; verify precache/budget impact | `public/fonts/*`, [styles.css](../../src/styles.css), possibly `index.html` | 1 | `check:css`, bundle budget script, `verify:offline` |
| **7. Doc truth** | Update the palette/theme description in [ui-system.md](../ui-system.md) (the "Paste blue / Import green" and Advanced-palette statements become false) | [ui-system.md](../ui-system.md) | 1–3 | review only |

Documentation impact: only phase 7. Per `AGENTS.md` §3 no architecture doc changes are required for
phases 1–6 because no subsystem boundary, ownership, control flow, data flow or persistence changes.

---

## 9. Regression risks

| Risk | Area | Why | Mitigation |
| --- | --- | --- | --- |
| Simple mode visual drift | Simple | Accidental `:root` or shared-selector edit | Advanced-only selectors; §10 step 4 computed-style diff; forbid `:root` value edits |
| Reader typography overwritten | Reader | Rebinding `--font-reading`/`--font-display` in reader scope could fight the user preference inline style | Do not set reader font tokens in the Advanced reader scope; assert `--reader-font` unchanged in a probe |
| Mobile reader chrome geometry | Reader/mobile | `--reader-header-height` math, `.pdf-mobile-zoom-host`, `--lookup-vv-*` positioning | Phase 5 default is visual-only; never rename those classes/vars |
| PDF Original toggle / zoom controls | PDF | Toolbar grid and 44px targets are asserted | Keep toolbar grid + min-heights; `verify:pdf` |
| Quick Card mode semantics | Lookup | `data-quick-mode` drives three presentations and e2e labels | Freeze `LookupBottomSheet.tsx` logic; only token-driven CSS changes |
| Standard Quick loses semantic readability | Lookup | Deleting the 4 chromatic hues could flatten POS/sense chips into noise | Keep `--context/language/notes/vocabulary` in the Standard-Quick scope; `verify:lookup` |
| Continue/library card geometry | Advanced home | `continue-card` ≤104px and `.document-cover` presence asserted | Do not change min-height/padding beyond scale normalization; run `homepage.spec.ts` |
| Horizontal overflow | All widths | New spacing/tracking at 320px | The existing `scrollWidth <= innerWidth` assertion across 6 widths × 3 themes |
| 44px touch targets | Advanced | `Keep formatting`, `Plain text`, `Import URL`, `Advanced` asserted at 44px | Never reduce min-height; §4 spacing exceptions list |
| Bundle/precache growth | Build | New font file, CSS additions | Phase 6 gated behind budget script; keep Advanced CSS in the existing lazy chunk |
| Off-scale spacing creeping back | All Advanced | 20/28 are new steps | Only `--a-space-*` in Advanced rules; exceptions documented in-file |

---

## 10. Verification plan

Change class: **PRESENTATION_ONLY** for phases 1–4 and 6 (stop point `npm run check:css`, plus targeted
browser checks because Advanced visuals are the deliverable); **LOCAL_UI** for phase 5 (adds
`typecheck`); no phase reaches `SUBSYSTEM_LOGIC`/`SHARED_CONTRACT` because no handler, state, data flow
or shared contract changes.

1. **Static**: `npm run check:css` after every phase (PostCSS syntax + `@import` chain over all `src/**/*.css`).
2. **Types**: `npm run typecheck` once per phase that could touch TS (expected: no TS file changes at all;
   any `App.tsx` edit triggers it).
3. **Subsystem (only where the phase reaches it)**:
   - `npm run verify:ui` (home/page behavior),
   - `npm run verify:lookup` (Standard/Simple Quick),
   - `npm run verify:reader`, `npm run verify:pdf` (phase 5),
   - `npm run verify:import`, `npm run verify:storage` (phase 3, changed entry/library styling),
   - `npm run verify:offline` (phase 6, precache/fonts).
   `verify:full` is escalation-only and is not expected to be needed.
4. **Simple isolation probe** (new, cheap, no new framework): a Playwright assertion in the existing
   spec style that loads the home in Simple mode, reads `getComputedStyle` for a fixed selector list
   (`.home-shell`, `.action-card`, `.document-cover`, `.primary-button`, `.brand-mark`, `.document-drop`),
   and compares against the values captured before phase 1. Store the baseline under `tmp/`, not in the
   repo.
5. **Browser verification (conditional, narrow)**: `npm run test:browser` with the existing
   `laptop` (1366×900) and `mobile-chromium` (Pixel 7) projects. The relevant existing specs are
   `homepage.spec.ts` (already loops widths 1366/1024/768/390/320/844 × themes
   light/dark/system, asserts `scrollWidth <= innerWidth`, 44px targets and Advanced-only selectors),
   `ui-interactions.spec.ts` (density/appearance persistence, reading controls, reader shell per mode),
   `reader-p0.spec.ts`, `quick-*.spec.ts`, `continue-reading.spec.ts`, `pdf-desktop-zoom-toolbar.spec.ts`.
   Advanced desktop + mobile visual checks reuse the screenshots `homepage.spec.ts` already writes to
   `tmp/phase4/modes-<width>-<theme>-<mode>.png`; **no new visual-regression system is created** because
   none exists in this repo.
6. **Accessibility**: rely on the existing `role`/`aria-*` and focus semantics — assert focus visibility
   is present (the single monochrome ring) and that no control loses its accessible name; do not add a
   new a11y toolchain.
7. **Interaction/state checks**: hover/active/disabled/focus for primary, secondary, quiet, icon
   buttons, inputs, density toggle, nav current item; empty/loading/error for library and import.
   Existing specs cover the functional half.
8. **Guardrail statement**: this is a pure presentation redesign — **zero** network calls, caching or
   quota impact; no change to Worker behavior, cost surfaces or offline fallbacks (except phase 6
   font precache, which stays inside the existing `woff2` glob and budget script).

## Acceptance criteria

- Advanced home renders monochrome (`--a-*` set) on desktop, tablet and phone with no horizontal
  overflow at 320/390/768/844/1024/1366 in light, dark and system themes.
- Only the single Advanced radius value and the `--a-space-*` scale appear in new Advanced rules
  (documented exceptions: 44px targets, cover widths, drop-zone min-heights, safe-area `calc()`).
- Simple home and Simple Quick are visually unchanged (isolation probe passes).
- All existing browser specs pass unmodified; reader/PDF/lookup behavior untouched.
- `check:css` PASS in every phase; `verify:lookup` PASS after phase 1; `verify:reader`/`verify:pdf`
  PASS after phase 5.

---

## 11. FACTS / DESIGN DECISIONS / OPEN QUESTIONS

### FACTS (what the codebase currently is)

- Advanced and Simple are two separate JSX trees; the shell carries `data-interface-mode`
  (`App.tsx:503`, `ReaderShell.tsx:90`).
- `home-advanced.css` (204 lines) is lazy-loaded only in Advanced and is a two-pass file (structure
  `1–152`, "Color only" recolor `141–207`).
- `--advanced-orange #a95032`, `--advanced-green #657744`, `--advanced-gold #98702d`,
  `--advanced-blue #526f88` (+`-soft`), `--advanced-paper #fbf8f1` are declared at `styles.css:613–640`
  for the shared selector Advanced home + Standard Quick, with dark variants `697–706` and system
  variants `710–722`.
- `--space-1..7` = 4/8/12/16/24/32/48 (`styles.css:241`); 20 and 28 do not exist. Radius vocabulary is
  6/8/12/16 plus many literals. Shadows are used 55 times across the six stylesheets.
- There is no font asset, `@font-face`, or font `<link>`; `--font-display` and `--font-reading` are
  Georgia/serif and `--font-ui` is a system sans stack.
- Reader typography is user-controlled through the `readerStyle` inline style (`App.tsx:238–243`).
- There are three Quick presentations: `simple`, `standard` (Advanced), and `full`/`.expanded`;
  `LookupBottomSheet.tsx:177` sets `data-quick-mode`, `:55` derives `simple`.
- Reader behavior contracts: chrome-quiet gesture thresholds (`ReaderShell.tsx`), mobile
  `--reader-header-height: calc(88px + safe-area-inset-top)`, `.pdf-mobile-zoom-host` queried
  imperatively by `PdfViewer`, `--lookup-vv-*` positioning with `transform: scale()`, desktop
  `.word-popup` 440px with `@container (min-width:390px)`.
- Existing browser specs assert, among others: `.home-shell[data-interface-mode]`, the `Advanced`/`Simple`
  buttons, `Interface density` group with `aria-pressed`, `.continue-card` height ≤104px,
  `.document-cover` count (0 Simple / ≥1 Advanced), 44px min height on `Keep formatting`/`Plain text`/
  `Import URL`/`Advanced`, `#article-url`, `Search library`, `Filter document type`, `Appearance`,
  `.lookup-sheet.quick/.expanded`, `.inspector-*`, and `scrollWidth <= innerWidth` at
  1366/1024/768/390/320/844 × light/dark/system.
- There is **no** visual-regression/screenshot-diff infrastructure; `homepage.spec.ts` writes
  screenshots to `tmp/phase4/`.
- `@media` tiers in use: `min-width:1024px` (`useDesktop()`, desktop reader CSS), `max-width:767px`
  (mobile reader CSS, home-advanced), `max-width:1023px` (home-advanced).
- `docs/ui-system.md` currently documents the Advanced surface-entry hue rule ("Paste … blue accent in
  both modes, Import retains green").

### DESIGN DECISIONS (Planner proposals — not current state)

- **D1** Advanced tokens live in the **existing** shared Advanced selector block in `styles.css`
  (eager load required by Standard Quick); no new token file.
- **D2** Isolation is achieved by **re-binding generic token names inside the Advanced scope**
  (`--bg/--surface/--text/--muted/--line/--accent/--accent-soft/--border/--elevated-surface/--shadow/
  --home-function`), not by introducing parallel `--a-*` names for components; `--a-*` names exist only
  as the literal palette/scale definitions.
- **D3** A scoped Advanced spacing scale `--a-space-1..7` = 4/8/12/16/20/24/28 is added instead of
  renumbering the global `--space-*` (which reader geometry depends on).
- ~~**D4** One radius value, `--a-radius: 8px`; inherited radius tokens are overridden to 8px inside
  the Advanced scope only.~~ **SUPERSEDED 2026-10-02 by D4′ (§16, §19).** Sharp rectangular geometry is
  required for Advanced major blocks; `8px` is retained only for small functional controls.
- **D5** The chromatic `--advanced-*` palette is **deleted**, including dark/system variants; Paste vs
  Import differentiation moves from hue to form/hierarchy. This supersedes the current statement in
  `docs/ui-system.md`.
- **D6** Semantic lookup colors (`--context/--language/--notes/--vocabulary`) are **retained** in the
  Standard-Quick scope because they carry functional meaning; everything else in Advanced is monochrome.
- **D7** Advanced is shadow-free; elevation is expressed with `1px --a-soft-border` + opaque surfaces.
- **D8** Display type is clamped (`clamp(34px, 4.2vw, 52px)`) rather than a fixed 52px, and an added
  18px/13px step covers existing card/meta roles the reference scale lacks.
- **D9** Reference card padding 26px becomes 24px (`--a-space-6`) because Advanced cards are grid rows,
  not standalone cards; reference input border 0.8px becomes 1px for rendering reasons.
- **D10** No `Advanced*` React components are introduced; no JSX restructuring is planned.
- **D11** Advanced reader chrome is **visual-only** by default; structural reader change is not part of
  the plan unless an open question is answered otherwise.
- **D12** Mobile reader stability is the priority: no change to reader geometry, gesture logic, PDF host
  contract, or Quick/Full grid definitions.

### OPEN QUESTIONS (need a decision before/during implementation; each has a default so work can proceed)

1. **JetBrains font delivery.** No font infrastructure exists. Default: ship phase 6 as optional and
   keep the `'JetBrains Sans'`-first fallback stack so nothing depends on it; alternative is bundling a
   subset `woff2` under `public/fonts/` (precache glob already covers `woff2`, budget script applies).
2. **Dark mode and System Reading Mode.** The brief says light/monochrome, but dark tokens and the
   `:has()` editorial reader palette exist and are asserted by the theme loop. Default: redesign light
   Advanced fully; for dark, invert the monochrome set (canvas ↔ near-black surfaces) and keep the
   existing dark/system assertions green — do not drop dark support.
3. **Is Advanced reader chrome in scope?** Default: yes but phase 5, visual-only; if the answer is "no",
   phases 1–4 are unaffected and phase 5 is dropped.
4. **Delete or keep `--advanced-*`?** Default (D5): delete. If any consumer outside the two known
   selectors exists, keep and neutralize the values instead.
5. **Where is the deliverable consumed?** Default: this file, plus an inline summary in the same turn.
6. **Is the 3px `--advanced-orange` top rule on the Advanced shell intentionally removed?** Default:
   removed; replaced by `--a-canvas` + `--a-soft-border` hairline.

---

## 12. Implementation-ready file scope

**Change**

| File | What changes |
| --- | --- |
| [src/styles.css](../../src/styles.css) | Block `613–722`: replace the chromatic `--advanced-*` palette with the `--a-*` token set, scoped generic re-binding, `--a-space-*`, `--a-radius`, `--a-font-*`, monochrome `--shadow:none`, single focus ring; rewrite the Standard-Quick recolor to the monochrome set keeping `--context/--language/--notes/--vocabulary`; delete dark `697–706` and system `710–722` chromatic variants (replace with monochrome dark values if OQ2 = keep dark). No `:root` value changes. |
| [src/home-advanced.css](../../src/home-advanced.css) | All 204 lines: structure rules `1–152` normalized to `--a-space-*`/`--a-radius`, hue-coded rules `141–207` replaced, media blocks `69–79`/`100–152` re-scaled; `.action-card`/`.action-card-icon`/`.document-drop`/`.paste-mode` hue removal; focus rings unified. |
| [docs/ui-system.md](../../docs/ui-system.md) | Phase 7: update the Advanced palette / surface-entry hue statements. Only required doc change. |

**Create**

| File | Why |
| --- | --- |
| `public/fonts/*.woff2` | Only if OPEN QUESTION 1 resolves to bundling JetBrains. |

> **REVISED 2026-10-02 (§13–19).** `src/db/database.ts`, `src/db/database.test.ts`,
> `src/settings/engines.test.ts` and `e2e/**` moved **out** of this list into "Change" — the
> Advanced-first-launch default and the sharp-geometry change both require them.

**Change** (added by revision §16)

| File | What changes |
| --- | --- |
| [src/db/database.ts](../../src/db/database.ts) | **Two tokens.** `defaultPreferences.interfaceMode` (line 270) `'simple'` → `'advanced'`; `loadPreferences()` terminal fallback (line 291) `: 'simple'` → `: 'advanced'`. Nothing else. No schema bump, no new field, no new store. See §13. |
| [src/db/database.test.ts](../../src/db/database.test.ts) | New cases for first-launch default, Simple/Advanced round-trip, default-flush non-destruction. §18 tests 1, 2, 3, 6, 7. |
| [src/settings/engines.test.ts](../../src/settings/engines.test.ts) | Characterisation tests for `false`-vs-missing on `EngineSettings`. No product change. §18 tests 4, 5. |
| [e2e/homepage.spec.ts](../../e2e/homepage.spec.ts) | Stop assuming Simple is initial; assert sharp geometry; no-overflow sweep. §18 tests 2, 3, 9, 10. |
| [e2e/continue-reading.spec.ts](../../e2e/continue-reading.spec.ts) | Stop assuming Simple is initial. §18 test 2. |
| [e2e/ui-interactions.spec.ts](../../e2e/ui-interactions.spec.ts) | Stop assuming Simple is initial; add reload-persistence checks. §18 tests 2, 3, 8. |
| [playwright.config.ts](../../playwright.config.ts) | No change required — the absence of `storageState` is what makes the first-launch test natural. Listed here only to record that it is deliberately untouched. |

**Explicitly NOT changed** (evidence-backed)

`src/app/App.tsx` (JSX/state/structure stays; only if a phase needs a new class hook, which the plan
avoids), `src/reader/ReaderShell.tsx`, `src/reader/ReaderToolbar.tsx`, `src/components/LookupBottomSheet.tsx`,
`src/components/DocumentIdentity.tsx`, `src/components/ContinueReading.tsx`, `src/components/PasteComposer.tsx`,
`src/components/ReaderSettings.tsx`, `src/components/useDesktop.ts`, `src/settings/engines.ts` (the
migration at 53–55 is already `false`-safe and already tested — §15), `src/settings/store.ts`,
`src/onboarding/store.ts`, `src/app/continueReading.ts`,
`src/reader-layout.css` and `src/styles.*-reader.css` (phase 5 exceptions only),
`vite.config.ts`, `scripts/**`, `docs/data-storage.md` (no storage system is added), and everything under
`docs/archive/`.

---

# REVISION 2026-10-02 — advanced-first-launch, persistence, sharp geometry

This revision adds product requirements #1–#4 and **supersedes decision D4**. Sections 13–18 are
additive to parts 1–12; where they conflict, they win.

## 13. (A) Preference initialization flow

### 13.1 Current flow — FACTS

```text
IndexedDB (Dexie) table `settings`
  ├─ row key 'reader-preferences'  → stored: Partial<AppPreferences>
  └─ row key 'homepage.theme'      → legacy: theme name doubled as the interface mode
        │
        ▼
loadPreferences()                          src/db/database.ts:286
  rawMode = stored.interfaceMode            :290
  interfaceMode =
      rawMode === 'simple' | 'advanced' ? rawMode
    : (rawMode ?? legacy?.value) === 'bright' ? 'advanced'
    : 'simple'                              :291   ← terminal fallback
        │                                    (per-field explicit normalization follows;
        │                                     every other key uses typeof / includes() checks,
        │                                     never || or ??)
        ▼
normalizedChanged = any key of defaultPreferences where stored[k] !== preferences[k]   :305
legacy present?                                                                             :306
        │ (either true)
        ▼
rw transaction: savePreferences(preferences); db.settings.delete('homepage.theme')          :307-310
        │
        ▼
App.tsx:156  Promise.all([ loadPreferences(), loadAiSettings(), db.vocabulary.count()… ])
        │
        ▼
setPreferences(prefs); setPreferencesLoaded(true)                                             :157-158
        │
        ▼
effect [preferences, preferencesLoaded]                                                      :234
  document.documentElement.dataset.theme = preferences.theme
  if (preferencesLoaded) void savePreferences(preferences)   ← the single write path
        │
        ▼
App.tsx:491  if (interfaceMode === 'advanced') void import('../home-advanced.css')
App.tsx:503  <main class="home-shell" data-interface-mode={preferences.interfaceMode}>
App.tsx:506  {preferences.interfaceMode === 'simple' ? <>…Simple…</> : <>…Advanced…</>}
App.tsx:517  Simple branch writes interfaceMode   App.tsx:553  Advanced branch writes interfaceMode
```

**Key FACTS.**

- The only storage is Dexie/IndexedDB table `settings`; `localStorage` is not used anywhere, and
  `sessionStorage` holds only `context-lens-ai-session` (see [docs/data-storage.md](../../docs/data-storage.md)).
- `loadPreferences` **already distinguishes all three required states** — absent, `'simple'`, and
  `'advanced'` — at [src/db/database.ts:290](../../src/db/database.ts:290). No new field is needed.
- The theme is persisted in the same row and applied to `documentElement.dataset.theme` by the same
  effect, so `theme` and `interfaceMode` already share one owner and one write path.
- `preferencesLoaded` gates the auto-save effect, which is what prevents a first render with
  `defaultPreferences` from being flushed over a real stored row.

### 13.2 Target flow — Advanced as the first-launch default

```text
no 'reader-preferences' row  (or interfaceMode key absent)
        → normalize falls through to terminal default  →  'advanced'   ← ONLY change (:291)
        → normalizedChanged is true (stored.interfaceMode undefined !== 'advanced')
        → explicit write materialises interfaceMode: 'advanced'
        → App renders the Advanced branch; home-advanced.css imported

stored 'simple'
        → 'simple' verbatim; normalizedChanged is FALSE (stored === loaded)
        → no write; App renders the Simple branch.   ← requirement: never reset

stored 'advanced'
        → 'advanced' verbatim; normalizedChanged is FALSE
        → no write; App renders the Advanced branch.

legacy 'homepage.theme' === 'bright'  (pre-interfaceMode user)
        → 'advanced'  ← mapping preserved verbatim; old Advanced users are not reset
        → row deleted after the rewrite
```

**The change is two tokens.** Both live in [src/db/database.ts](../../src/db/database.ts):

| Line | Current | Target |
| --- | --- | --- |
| 270 | `interfaceMode: 'simple'` in `defaultPreferences` | `interfaceMode: 'advanced'` |
| 291 | terminal `: 'simple'` | terminal `: 'advanced'` |

No Dexie schema version bump. No new table. No new field. No migration step. The legacy
`'bright' → 'advanced'` branch at line 291 is **preserved exactly**; removing it would reset
existing Advanced users to Advanced (harmless) but would also lose the only record that those rows
were already migrated.

---

## 14. (B) Preference persistence matrix

| Preference | Current storage | Current default | Current persistence | Target default | Persist? | Persist OFF? |
| --- | --- | --- | --- | --- | --- | --- |
| `interfaceMode` | `settings` row `reader-preferences` | `'simple'` (270) | Persists; toggled at [App.tsx:517](../../src/app/App.tsx:517) / [:553](../../src/app/App.tsx:553), saved by the single auto-save effect (234–237) | **`'advanced'`** | **Yes** | n/a — enum, both values persist |
| `theme` | same row | current `:root` theme | Persists; drives `documentElement.dataset.theme` (234–236) | unchanged | Yes | n/a — enum |
| `languageMode` | same row | enum | Persists | unchanged | Yes | n/a |
| `lookupViewMode` | same row | enum | Persists | unchanged | Yes | n/a |
| `lookupQuickMode` | same row | enum | Persists | unchanged | Yes | n/a |
| `lookupPopupPlacement` | same row | enum | Persists | unchanged | Yes | n/a |
| `fontSize`, `lineHeight`, `fontFamily`, `readingMargin` | same row | numbers / enum | Persists (explicit `typeof … === 'number'` checks) | unchanged | Yes | n/a |
| `pdfViewMode`, `pdfMobileViewMode`, `pdfZoomMode`, `pdfCustomScale` | same row | enum / number | Persists | unchanged | Yes | n/a |
| `guideLanguage` | same row, via `saveGuideLanguage` (App.tsx:488) | `'en'` | Persists | unchanged | Yes | n/a |
| `publicTranslation` | `settings` row via [src/settings/engines.ts](../../src/settings/engines.ts) | `true` (pre-migration rows are *forced* to `true`) | Persists, but a pre-migration row's stored `false` is overwritten by the `webLookupDefaultsVersion === undefined` branch (53–55) | unchanged | Yes | **Yes** — and already correct; the version stamp is the "was this configured" marker (§15) |
| `debugMode` | same row | `false` | Persists; spread-merge preserves `false` | unchanged | Yes | Yes |
| other 13 `EngineSettings` booleans | same row | mixed | Persists; `{ ...default, ...stored }` preserves `false` | unchanged | Yes | Yes |
| `keyStorage` (AI keys) | [src/settings/store.ts](../../src/settings/store.ts) session-vs-persistent split | `'persistent'` | Persists; `'session'` deliberately writes `context-lens-ai-session` in `sessionStorage` | unchanged | Yes (as chosen) | n/a — enum |
| `continueReadingDismissed` | `documents` row field, **not** preferences | never-true; read as `!doc.continueReadingDismissed` | Persists per document | unchanged | **Yes — do not change** | n/a — single-direction latch |
| `hasSeenContextLensOnboarding` | onboarding store | `false` | Persists; read with `=== true` ([src/onboarding/store.ts](../../src/onboarding/store.ts)) | unchanged | Yes | Yes |

### Must **not** be persisted (session / derived / ephemeral)

`contentsOpen`, `contextPanelOpen`, `lookupOpen`, `lookupDisplay`, `showOnboardingCard`, `online`,
`updateReady`, `importing`, `articleUrl`, `sharedDraft`, `libraryQuery`, `libraryKind`,
`showVocabulary`, `showDataManagement`, `showNotes`, `showReaderSettings`, `showApiSettings`,
`highlightToolsOpen`, `activeMarkupTool`, `activeMarkupColor`, `goToOpen`, `currentLocation`,
`progress`.

`contentsOpen` is force-reset by an effect keyed on `[preferences.interfaceMode]`
([App.tsx:245](../../src/app/App.tsx:245)) — it is *derived* from the mode, not a user choice, and
staying unpersisted is correct.

**Persistence owners.** Every row of the table above except `keyStorage`,
`continueReadingDismissed` and `hasSeenContextLensOnboarding` is owned by
[src/db/database.ts](../../src/db/database.ts) through one row and one write path — the
`AppPreferences` interface is deliberately free of booleans, which is why §15 finds no defect there.
The three exceptions each already have a dedicated owner; the plan adds none.

---

## 15. (C) False-vs-missing audit

**Result: no defect. No correction is required, and adding one would be a regression.**

Every boolean preference in the repo is already `false`-distinguishable:

| Site | Mechanism | `false` preserved? |
| --- | --- | --- |
| `AppPreferences` ([database.ts:252](../../src/db/database.ts:252)–266) | Contains **no boolean fields** — all enum / number / object. `loadPreferences` validates with explicit `typeof … === 'number'` and `['a','b'].includes(…)` | n/a — nothing to lose |
| `EngineSettings` load ([engines.ts](../../src/settings/engines.ts)) | `{ ...defaultEngineSettings, ...migrated }` — object spread assigns the stored property whenever the key is present | **Yes** |
| `hasSeenContextLensOnboarding()` ([src/onboarding/store.ts](../../src/onboarding/store.ts)) | `=== true` | **Yes** |
| `queryContinueReading` ([src/app/continueReading.ts](../../src/app/continueReading.ts)) | `!doc.continueReadingDismissed` — `false` and `undefined` are intentionally equivalent | Yes (by design) |
| Pre-migration web-lookup rows ([engines.ts:53](../../src/settings/engines.ts)–55) | `webLookupDefaultsVersion === undefined ? { ...stored, publicTranslation: true, webLookupDefaultsVersion: 1 } : stored` | **No — deliberately** |

The single truthiness-shaped write in the codebase is the `webLookupDefaultsVersion` migration, and
it is the **correct minimal pattern for the opposite problem**: the version stamp is an explicit
"was this ever configured" marker, so a row that predates the default is upgraded once, while any
row stamped `1` is trusted forever. A row that stamped `1` and stored `publicTranslation: false`
keeps that `false` — this is already locked by
[src/settings/engines.test.ts:35](../../src/settings/engines.test.ts:35) *"preserves a web lookup
opt-out saved after the defaults migration"*, alongside
[:26](../../src/settings/engines.test.ts:26) *"merges missing provider ids when loading older settings"*.

A repo-wide search for `value || default` and `?? true|false` shapes over persisted preferences
returns only [src/components/useDesktop.ts](../../src/components/useDesktop.ts) (`matchMedia(…) ?? false`),
[src/app/context-router.ts](../../src/app/context-router.ts) (`aiRequested ?? false`) and
[src/documents/import/sanitize.ts](../../src/documents/import/sanitize.ts) (`allowExternalImages ?? true`). **None of these is a persisted
preference**, so none exhibits the reload-flip defect.

**Minimal correction: none.** The change specified in §13 does not introduce a boolean, so it cannot
introduce the defect. The only work in this area is adding the characterisation tests of §18 (4, 5)
that lock the current correct behaviour so a future refactor to `||` fails loudly.

---

## 16. (D) Sharp-geometry component map

**D4 is void.** The Advanced scope permits exactly **three** radius values — `0`, `50%`, and the
already-existing `--radius-control: 6px` — and introduces no new literal.

### 16.1 Current state (FACTS)

Already `border-radius: 0` inside [src/home-advanced.css](../../src/home-advanced.css):
`.action-card` (24), `.action-card-icon` (25), `.continue-card` / `.library-card` (30),
`.section-empty` (62), `.stats-section` (63).

**The real work is smaller than it looks.** Two groups matter:

**(a) Needs an edit inside the Advanced stylesheet** — these currently *win* in the Advanced scope:

| Selector | Current value | Source | Action |
| --- | --- | --- | --- |
| `.continue-card` | `var(--radius-surface)` = 8px — **overrides its own line-30 `border-radius: 0`** | home-advanced.css:40 | delete the declaration |
| `.document-drop` | `var(--radius-surface)` = 8px | home-advanced.css:26 | set to `0` |
| `.home-advanced-tools` | `var(--radius-surface)` = 8px | home-advanced.css:7 | set to `0` |
| `.document-cover` | `2px 5px 5px 2px` (spine) | home-advanced.css:46 | set to `0`, spine becomes a `4px` left border |

**(b) Needs no edit but must be confirmed** — already-zeroed Advanced rules outrank these base values,
so they are listed to prove they were checked, not to be changed:

`.action-card` 18px (styles.css:162) · `.continue-card` / `.library-card` 14px (styles.css:190, 217) ·
`.settings-card` 14px (:561) · `.onboarding-card` 12px · `.url-panel` 12px · `.library-search` 10px ·
`.primary-button` / `.secondary-button` 9px · `.home-theme-toggle` 8px (:506–509) ·
`.icon-button` 8px (:46) · `.brand-mark` 10px (:44) · `.nav-button` `var(--radius-sm)` ·
`.provider-order` / `.engine-status` 8px · `.sheet-handle` 4px.

Two of these still need an Advanced-scoped rule because they are *not* covered by a zeroed parent
and are not themselves in the zeroed list: `.primary-button` / `.secondary-button` (they are
*children* of `.action-card`, and `border-radius` does not inherit), and `.brand-mark`.
`.home-theme-toggle` likewise sits outside the Advanced home blocks.

The `.continue-card` conflict is the one to resolve first: line 30 sets `0` and line 40 sets 8px, so
the later rule wins today. Delete the line-40 declaration rather than adding a third.

### 16.2 Target geometry

| Component | Target geometry | Rationale |
| --- | --- | --- |
| **Paste block** (`.paste-card`, `.paste-editor`) | `border-radius: 0` — already achieved, since `.paste-card` also carries `.action-card`, which the Advanced scope already zeroes (line 24) and which outranks the 18px base | Primary entry surface; reads as an editorial text column, not a card |
| **Import block** (`.import-card`, `.document-drop`) | `.import-card` → `0` via `.action-card`; `.document-drop` needs a **new** `border-radius: 0` at line 26, which currently re-introduces 8px | A drop target is a frame, not a chip. The thin border is the affordance; radius would soften it |
| **Continue Reading** (`.continue-card`) | `border-radius: 0` — **delete the line-40 `var(--radius-surface)`** so the line-30 `0` survives; the 14px base at styles.css:190 is then outranked | Repeated grid cells; sharp edges make the grid read as a table |
| **Library card** (`.library-card`) | `border-radius: 0` — already achieved at line 30; the 14px base at styles.css:217 is outranked | Same grid rationale; keeps Continue and Library consistent |
| **Major panels** (`.stats-section`, `.section-empty`, `.home-advanced-tools`, and the settings surfaces `.settings-card` / `.quick-card` / `.url-panel` / `.onboarding-card`) | `border-radius: 0` | Full-width structural regions; these are the surfaces the canvas colour frames. `.settings-card` is not on the homepage, so it needs its own Advanced-scoped rule rather than inheriting from `.action-card` |
| **Large content containers** (`.reader-*` shells, `.sheet-*` bodies) | `border-radius: 0` | Continuous surfaces; a rounded container implies a card |
| **Primary rectangular action surfaces** (`.primary-button`, `.secondary-button`, `.nav-button`, `.home-theme-toggle`) | `border-radius: 0` | Buttons that span a column inherit the column's geometry |
| **Inputs** (`.paste-editor`, `.document-drop` file affordance, `.library-search`, selects) | `border-radius: 0` — they sit inside sharp frames, and a rounded field inside a square frame is the clearest remaining "rounded card" tell | Fields and their frames must agree or the frame reads as chrome |
| **Compact controls** (`.paste-mode` segmented group, `.provider-order`, `.engine-status`) | `6px` (`--radius-control`, existing) — the one permitted small radius | A compact hit target with a tight label loses clickability at `0`; this is the usability exception the brief allows |
| **Icon buttons** (`.icon-button`, `.library-delete`, `.action-card-icon`) | `50%` where the control is a single glyph in a round affordance; `0` where it is a rectangular row in a panel | Shape follows role, not a blanket rule |
| **`.brand-mark`** | `0` | Identity block, not a control |
| **`.document-cover`** | `0`; the spine is conveyed by the existing `4px` left border, not by asymmetric radius | Keeps the artifact that the radius encoded while obeying sharp geometry |
| **`.sheet-handle`** | `4px` (unchanged) | A handle reads as a grab affordance; it is not a structural block |

### 16.3 How hierarchy is created without shadow

D7 holds and is reinforced: no `box-shadow` substitutes for geometry. Hierarchy comes from
**borders + surface contrast + whitespace** — a `--a-canvas` field with white `--a-surface` blocks
separated by a 1px `--a-soft-border`, laid out on the existing 4px-derived `--a-space-*` scale.
Radius is the *last* thing that should carry structure; if a block still reads as a card after its
radius is zeroed, the problem is surface contrast or spacing, and that is what should be fixed.

### 16.4 Scoping

Every rule above is applied inside the Advanced subtree only
(`[data-interface-mode="advanced"]` / the `.home-advanced.css` scope). **Simple presentation is not
touched** — the base `styles.css` radius values keep overriding Simple, which is what makes §18
test 8 a meaningful assertion rather than a tautology.

---

## 17. (E) Revised implementation sequence

Persistence is isolated in **Phase 0** so the CSS phases stay `PRESENTATION_ONLY` and each can be
verified on its own. Classification and commands follow
[docs/verification-map.md](../../docs/verification-map.md) and [docs/testing.md](../../docs/testing.md).

### Phase 0 — Persistence (new) · `SUBSYSTEM_LOGIC`

| Item | Value |
| --- | --- |
| **Files** | [src/db/database.ts](../../src/db/database.ts) (270, 291); tests in [src/db/database.test.ts](../../src/db/database.test.ts) and [src/settings/engines.test.ts](../../src/settings/engines.test.ts) |
| **Owner** | `loadPreferences` / `savePreferences` in `src/db/database.ts` — unchanged as an owner, only its terminal default changes |
| **Init behavior** | Absent `interfaceMode` → `'advanced'`; `'simple'` / `'advanced'` → verbatim; legacy `'bright'` → `'advanced'` |
| **Write behavior** | Unchanged — the single auto-save effect at App.tsx:234–237; both toggles already write through it |
| **Migration** | None. No Dexie version bump, no new row, no new field. The existing legacy-row delete is untouched |
| **Default flush** | `normalizedChanged` (:305) materialises `interfaceMode: 'advanced'` for first-launch users; for a stored `'simple'` it compares equal and writes nothing, so the user is **not** reset |
| **Verification** | `npm run verify:storage` (authoritative — covers `src/db`) and `npm run verify:translation` (covers `src/settings`, i.e. `engines.test.ts`) |

### Phase 1–7 — Visual redesign (unchanged sequence, renumbered as in part 1 §8)

Phases 1–7 of the previous report stand. Each remains `PRESENTATION_ONLY` or `LOCAL_UI`; none gains
a persistence concern. Within Phase 2 (Advanced structure) apply the §16.2 map and **delete** the
line-40 `.continue-card` radius so it does not re-override line 30.

### Phase 8 — End-to-end spec update (new) · `SUBSYSTEM_LOGIC`

| Item | Value |
| --- | --- |
| **Files** | [e2e/homepage.spec.ts](../../e2e/homepage.spec.ts) (:17, 42, 70, 156, 170, 172), [e2e/continue-reading.spec.ts](../../e2e/continue-reading.spec.ts) (:6, 20), [e2e/ui-interactions.spec.ts](../../e2e/ui-interactions.spec.ts) (:188–192) |
| **Why** | `playwright.config.ts` sets **no `storageState`**, so every spec starts from a clean profile and every spec currently assumes the initial mode is Simple and clicks the `Advanced` toggle. With Advanced as the default those clicks toggle *back to Simple*. |
| **Fix** | Either branch on `main[data-interface-mode]`, or seed `reader-preferences` with `interfaceMode: 'simple'` via `page.evaluate` + IndexedDB before the toggle click. Branching is preferred — it keeps the specs honest about the real default. |
| **Verification** | `npm run test:browser` (both projects: `laptop` 1366×900, `mobile-chromium` Pixel 7) |

Phase 8 is last so the unit suite in Phase 0 is the first signal that the default flip is correct,
before the slower browser layer is touched.

---

## 18. (F) Regression verification

| # | Test | Where |
| --- | --- | --- |
| 1 | No saved preference → `loadPreferences()` yields `interfaceMode === 'advanced'` | unit, [src/db/database.test.ts](../../src/db/database.test.ts) |
| 2 | Select Simple → reload → still Simple | unit (round-trip through `savePreferences`) **and** e2e [ui-interactions.spec.ts](../../e2e/ui-interactions.spec.ts) |
| 3 | Select Advanced → reload → still Advanced | unit **and** e2e [ui-interactions.spec.ts](../../e2e/ui-interactions.spec.ts) |
| 4 | `publicTranslation` toggled ON → reload → ON | unit, [src/settings/engines.test.ts](../../src/settings/engines.test.ts) (extends the existing :26/:35 pair) |
| 5 | `publicTranslation` toggled OFF → reload → **OFF** (not flipped back to the `true` default) | same file — the regression this whole requirement exists to prevent |
| 6 | No saved value still receives the intended default (absent key *and* empty `{}` row both → `'advanced'`) | unit, `src/db/database.test.ts` |
| 7 | An existing persisted `'simple'` is **not** overwritten by the new default — assert `normalizedChanged` is `false` and no `savePreferences` write occurs | unit, `src/db/database.test.ts` |
| 8 | Simple presentation unchanged — computed-style baseline diff of the Simple subtree before/after, and both `primary-button` / `action-card` / `settings-card` radii still 9px / 18px / 14px | e2e [homepage.spec.ts](../../e2e/homepage.spec.ts) |
| 9 | Advanced major blocks are sharp — `toHaveCSS('border-radius', '0px')` on `.paste-card` / `.import-card` (both carry `.action-card`), `.document-drop`, `.continue-card`, `.library-card`, `.stats-section` | e2e [homepage.spec.ts](../../e2e/homepage.spec.ts) |
| 10 | No horizontal overflow — existing `scrollWidth <= innerWidth` sweep across 320 / 360 / 390 / 430 / 768 / 1280 × 3 themes × both modes, re-run after the geometry change | e2e [homepage.spec.ts](../../e2e/homepage.spec.ts) |

Commands, in escalation order:

```powershell
npm run verify:storage      # Phase 0
npm run verify:translation  # Phase 0 (engines.test.ts)
npm run check:css           # CSS phases only
npm run verify:ui           # CSS/geometry phases
npm run test:browser        # Phase 8
npm run verify:full         # escalation only, if the blast radius demands it
```

---

## 19. FACTS · DESIGN DECISIONS · PERSISTENCE DECISIONS · OPEN QUESTIONS

### FACTS

- The only persistence mechanism is Dexie/IndexedDB table `settings`; `localStorage` is unused and
  `sessionStorage` holds only the AI session keys.
- `loadPreferences` ([database.ts:290](../../src/db/database.ts:290)) **already** distinguishes absent /
  `'simple'` / `'advanced'`, and already maps legacy `'bright'` → `'advanced'`.
- The default lives in exactly two places: `defaultPreferences.interfaceMode` (:270) and the
  terminal fallback in `loadPreferences` (:291).
- One write path serves all persisted preferences: the `preferencesLoaded`-gated auto-save effect at
  [App.tsx:234](../../src/app/App.tsx:234)–237.
- `AppPreferences` has **no boolean fields**; `EngineSettings` has 15 and is loaded by a
  `false`-preserving spread; `hasSeenContextLensOnboarding` uses `=== true`.
- The only truthiness-shaped write over a persisted boolean is the `webLookupDefaultsVersion`
  migration in [engines.ts:53](../../src/settings/engines.ts)–55, and it is intentional, version-stamped
  and already covered by two tests.
- `playwright.config.ts` sets no `storageState`, so each e2e test starts from a clean IndexedDB — which
  is what makes test 1 natural and which is also why the Simple-first specs in
  `e2e/homepage.spec.ts`, `e2e/continue-reading.spec.ts` and `e2e/ui-interactions.spec.ts` break.
- `.continue-card` currently has two conflicting radius declarations in `home-advanced.css`
  (line 30 = `0`, line 40 = 8px); the later one wins.
- `--radius-control: 6px` and `--radius-surface: 8px` are the only radius tokens in
  [src/styles.css:5](../../src/styles.css).

### NEW DESIGN DECISIONS

- **D4′ (§16) — Sharp rectangular geometry.** Major Advanced blocks use `border-radius: 0`. Permitted
  values in the Advanced scope: `0`, `50%` for circular icon buttons, and the existing
  `--radius-control: 6px` for compact controls where usability requires it. **No new radius literal
  is introduced.** Scope is the Advanced subtree only; Simple presentation is untouched.
- **D13 — Advanced is the first-launch default.** Implemented as a two-token default flip, not a
  migration.
- **D7 (reconfirmed)** — no shadow as a hierarchy substitute; borders, surface contrast and the
  existing 4px-derived spacing carry the structure.

### PERSISTENCE DECISIONS

- **P1 — No new persistence system.** The existing `settings` row and `savePreferences` are
  sufficient; requirement #1 needs no field, no table and no schema version.
- **P2 — Never reset an existing choice.** The default applies only when `interfaceMode` is absent.
  A stored `'simple'` compares equal to its own loaded value, so `normalizedChanged` stays `false`
  and no write happens.
- **P3 — Persist user-level choices only.** Mode, theme, language, lookup mode/placement,
  typography, PDF view, guide language, engine toggles, onboarding-seen, per-document
  continue-reading dismissal. The session/derived list in §14 stays ephemeral.
- **P4 — Keep the version-stamp pattern.** `webLookupDefaultsVersion` is the model for "was this
  ever configured"; no new boolean preference should be added without an equivalent marker.
- **P5 — `false` is a first-class value.** No new `||`-default logic may be introduced; §15's three
  existing `false`-safe patterns are the reference implementations.

### OPEN QUESTIONS

1. **Bundling JetBrains Mono** — still unresolved from part 1; only affects the font phase.
2. **Dark mode** — keep the dark variant with monochrome values, or drop dark? Still unresolved;
   §16.4 assumes neither choice blocks the radius work.
3. **`.document-cover` spine** — the plan converts the asymmetric `2px 5px 5px 2px` radius to `0` plus
   a `4px` left border. If the spine is judged too subtle, the fallback is a `2px` left border, not a
   return to rounded covers.
