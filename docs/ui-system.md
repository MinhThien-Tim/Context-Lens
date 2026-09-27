# UI System

Purpose: tell future agents **where** a UI change belongs.
Related: [ARCHITECTURE.md](ARCHITECTURE.md), [reader.md](reader.md).

## Structure at a glance

```text
src/main.tsx
  └─ <App>                                  src/app/App.tsx   ← composition + state owner
       ├─ HOME  <main class="home-shell" data-interface-mode>
       │    brand-header / home-nav
       │    PasteComposer + import sources
       │    continue-reading, library grid (search + kind filter + load more)
       │    OnboardingCard / ContextLensOnboarding
       │    modals: ApiSettings, VocabularyLibrary, DataManagement
       └─ READER <ReaderShell interfaceMode surface contentsOpen contextOpen>
            ReaderToolbar (short title, Contents, Markup, Aa, menu; PDF: Original/Reading + Document tools)
            ReaderProgress (bottom location/page navigation, percent, secondary OCR status)
            reader-viewport  → TextReader | PdfViewer | PdfReadingView
            panels: ContentsPanel (Document), ContextPanel (empty), LookupBottomSheet, NotesPanel
            overlays: MarkupPalette, ReaderSettings, GoToLocation
```

`ReaderShell` exposes `data-interface-mode` and `data-reader-surface`, plus panel classes.
It owns only transient mobile chrome visibility: downward reading scroll quiets the header/footer;
tap, upward scroll or keyboard focus reveals them without changing content geometry. Open panels,
selection and settings keep controls visible. It observes existing scroll events, never navigation.

## Homepage (`home-shell`)

Rendered by the `if (!documentRecord)` branch in `src/app/App.tsx`. Sections, in render order:

- Status banners: offline notice, and a service-worker "update ready" action driven by the
  `context-lens:update-ready` / `context-lens:apply-update` window events from `src/main.tsx`.
- `brand-header`: brand lockup and Saved words, Storage, Settings (language engines), Guide,
  with the original language, density, appearance and Diagnostics controls in Simple. Advanced exposes Diagnostics directly.
- Advanced-only `home-preferences`: independent density, appearance, guide language, and Typography entry
  (reuses `ReaderSettings`; no second preference state).
- Advanced has a compact opening area with Import document, Paste text and Library anchor links; Simple retains its original introduction.
- Advanced Continue-reading appears before import/paste only when history exists. Simple retains Continue after import/paste, including its empty state and original cards. Advanced document lists reuse presentational
  `DocumentIdentity` for local title-initial covers, existing location/progress, and updated date.
  The current document model has no cover/thumbnail field; no extraction or external service is added.
- `PasteComposer` and the existing file/article import surface, with stable anchor targets. Simple retains two framed entry surfaces: Paste on the left, Import on the right at tablet/desktop widths; phones stack Paste first.
- Library: title search, kind filter, `Load more` through `queryDocumentLibrary`, and existing
  per-document transactional delete. Simple retains its original responsive card grid; Advanced uses a compact list with aligned metadata/progress. Phones retain a vertical list.
- `OnboardingCard` until dismissed, then `ContextLensOnboarding` as a modal.
- `home-note` privacy line.

Density is `AppPreferences.interfaceMode` (`simple` / `advanced`, default Simple), persisted
in `reader-preferences` and exposed as `data-interface-mode`. `loadPreferences` migrates
legacy `homepage.theme`: Calm to Simple, Bright to Advanced, preserving appearance and
typography. Explicit new density wins; normalized settings are written and the old key removed
atomically. Invalid appearance defaults to System.

## Reader layout

Desktop uses a reading canvas between independent Document and Context columns. Mobile/tablet
below 1024 px use a compact header, bottom page navigation and modal drawers/sheets.
`useDesktop()` (`src/components/useDesktop.ts`) is a single `matchMedia('(min-width: 1024px)')`
subscription and is the responsive authority.

| Area | Desktop | Mobile |
| --- | --- | --- |
| Side panel | Contents and context render as columns (`reader-shell.has-contents` / `.has-context`) | Drawers/sheets; `App.tsx` auto-closes Contents when the lookup sheet or notes open |
| Lookup result | Quick popup; explicit Full opens Context Inspector | Quick bottom sheet; Full expands the same sheet |
| Notes | Side panel | Full-height panel (`NotesPanel`) |
| Toolbar | Left: Library and bounded title; center: PDF mode and Document tools; right: Contents, Markup, OCR next, Aa, overflow; Advanced adds Context | Back, shortened title, Aa, overflow; Contents/Markup on a second row, PDF mode/tools on a third |
| Contents / Go to | Keyboard `T` and `G` (guarded by `keyboardCanNavigate`) | Visible Contents button / bottom location button |
| PDF paging | Bottom `PageNavigation` and guarded arrow keys | Bottom touch navigation / Go to page |


Simple starts with both panels closed and diagnostics hidden. Advanced desktop opens Document by
default; Context opens on an explicit toggle or Full expansion. A Simple/Advanced change resets panel
visibility but preserves document location. Location restoration runs only on document changes;
renderer/breakpoint changes reuse the current location rather than the initial record position. Document provides Contents and, for PDF, Pages; Go to
location and existing Notes remain accessible. No search engine or new highlight browser is added.
Desktop columns use bounded responsive token widths and leave the reader more than half the screen
with both open at supported desktop widths. No resize handles or width animation are introduced.
Mobile opens one panel at a time with the existing focus trap and Escape behavior.

The top PDF control contains only Original/Reading; the adjacent Document tools popover contains
existing text-source, OCR language, recognition and queue actions. OCR next is also visible in the primary actions group, reusing the same next-six-pages action and busy/completed guards. OCR behavior is unchanged.
Original keeps a centered PDF canvas with a quiet zoom toolbar (Simple uses its Zoom menu).
Reading retains the shared structured pages with comfortable margins and no card border per page.
`ReaderProgress` always reports reading progress separately from optional OCR status. PDF page
navigation is rendered once at the bottom; non-PDF location opens the existing Go to dialog.
Header/footer size variables determine PDF viewport height; quiet chrome changes opacity/transform,
not viewport size. Long text continues to use window scrolling and the existing location contract.

`LookupBottomSheet` presents the Quick/Full display mode supplied by App. New lookups use the saved
`AppPreferences.lookupViewMode` (Quick by default): a selection-anchored Quick popup on desktop
(both densities) or a modal bottom sheet on mobile, or Full when the reader last chose Show more.
Show more moves the same surface into the right Context Inspector on desktop or a taller mobile
sheet; Show less and the first Escape return to Quick, then Escape closes it. App synchronizes
panel layout and saves the chosen default through `onDisplayModeChange`; neither expansion nor
reopening invokes providers. The compact More menu offers a Default view selector for Quick/Show more.
The header stays outside the single scrolling body and contains the selection, available IPA,
pronunciation, POS/base form, a confirmed Context badge, a single language button, Show more/less, Note when
available, Save and Close. Quick shows the supported
context sense and at least one ordinary sense per available POS, plus a second sense in the primary
POS, with an inline More meanings control. Ordinary definitions longer than 180 characters use
a three-line preview; More meanings reveals the complete text and remaining senses. Examples belong to Full only.
Quick restores bilingual columns using source-linked sense pairs; aggregate entry-level Vietnamese
glosses are visible in an adjacent entry-level column when no linked pairs exist (also visible in VI mode).
With linked pairs, unmatched glosses remain visible in a separate section rather than becoming fake pairs.
Full groups all senses by POS (context first), keeping source-linked bilingual content together,
with two meanings when English is shown (four in VI-only mode) before an independent More meanings disclosure. Lower POS
groups, examples, phrases, related words and usage are independently collapsible. Entry-level VI
glosses remain explicitly separate from source-linked bilingual pairs. Long original sentences/translations use collapsed disclosures. Missing fields render no
empty sections; no word-family/etymology data is synthesized. Language controls and Show more/less
share the fixed header so changing language or expansion does not require scrolling. Note is also
promoted there when the action is available. Sources remains at the end of the scrolling body, reached by scrolling through long results and optional
Diagnostics stay inside Sources. AI and sentence translation actions remain explicit alongside the language and expansion controls in the compact Full header row, wrapping when needed.
The secondary More disclosure opens a small inline popover without another modal.
Quick and Full use one compact language button cycling EN → VI → EN+VI → EN, with a rotation icon,
updating its label and displayed content together. Note sits beside Save in the word header;
language, More and Show more/less sit beside pronunciation in one shared row. Quick has no
separate action row; Full adds a compact row for Translate and AI Explain.
Full displays unmatched Vietnamese glosses directly in a separate labeled section in VI
and bilingual modes, without assigning them to English senses. Available local dictionary glosses
remain visible when a context response omits them; aggregate quick glosses serve as an entry-level
fallback for an English-only dictionary. Bilingual sense content stacks within each Full meaning.
Sentence context, Dictionary meanings and unmatched Vietnamese glosses use distinct subtle theme
token tints. Language and the chosen Quick/Full mode persist in the existing reader preferences.

At ordinary laptop widths the Context column is approximately 360-400 px, bounded responsively.
When both columns are open, the Document column becomes narrower to preserve reading space.
Mobile Quick grows with content up to 72dvh; Full uses 88dvh with safe-area padding, an independent
scrolling body and the existing `useDialog` focus trap. Expansion does not touch document location.
Selection actions use Define, Highlight and Note first; existing copy/color and translation
capabilities remain available. `useDialog` (`src/components/useDialog.ts`) owns Escape and focus
restoration; only mobile surfaces trap focus. Focus traps include disclosure summaries and exclude
controls inside closed disclosures.

## UI state ownership

There is no global store. Ownership rules:

- `src/app/App.tsx` owns all cross-component reader state: open document, `currentLocation`,
  `contentsOpen` / `contextPanelOpen`, `lookupOpen` / `lookupDisplay` / `activeSelection`, `lookup` / `contextResult` / `loading` /
  `error`, the OCR page list and queue, PDF view mode, preferences, engine settings, AI settings,
  library/continue lists, and modal visibility flags. The abort controllers for lookup, context,
  and import live here as refs.
- `lookupService` (`src/lookup/service.ts`) is a module singleton, created once and reconfigured
  from settings.
- Feature components own only transient UI state: `MarkupPalette` tool/color, `LookupBottomSheet`
  disclosures (Quick/Full follows App's `lookupDisplay`), `ReaderToolbar` overflow menu, `ReaderShell` mobile chrome visibility, `PdfViewer` mobile zoom and page sizes,
  `usePdfOcrQueue` queue status, `VocabularyLibrary` and `DataManagement` modals.
- Data is not mirrored into component state: the reader holds a `DocumentRecord` and re-renders
  after `db.documents.update`.
- Reading typography is passed down as CSS custom properties (`--reader-size`, `--reader-leading`,
  `--reader-font`) from the `readerStyle` memo in `App.tsx`.

## Theme system

- `src/styles.css` contains shared styling and the original Simple homepage, imported once from `src/main.tsx`. `src/reader-layout.css` holds reader layout/inspector overrides and loads before opening a document. Both CSS chunks remain in the service-worker precache. `src/home-advanced.css` is loaded on demand for Advanced and scopes its rules to the Advanced home shell.
- Design tokens are CSS variables on `:root` (palette, surfaces, `--reading-surface`,
  `--elevated-surface`, `--primary-text`, `--secondary-text`, `--border`, `--selection`,
  `--danger`, `--overlay`, `--shadow`).
- Theme selection is `data-theme` on `:root` with values `light`, `dark`, `system`; `system` is
  handled by `@media (prefers-color-scheme: dark)`. `AppPreferences.theme` is persisted in
  `db.settings` under `reader-preferences` via `loadPreferences` / `savePreferences`.
- System follows the OS color scheme on all surfaces; density never overrides appearance. Home Advanced uses a subtly cooler surface mix; Simple keeps warm paper. Paste has a distinct blue accent in both modes, while Import retains green. Reader palette remains shared.
- Reader surfaces deliberately reuse the same semantic tokens in light, dark, and system. Do not
  introduce a second palette for the reader.

## Where to make a change

| Change | Location |
| --- | --- |
| New homepage section, import source, or library control | `src/app/App.tsx` home branch, plus a component in `src/components/` |
| Reader chrome, panel arrangement, keyboard shortcuts | `src/reader/ReaderShell.tsx`, `src/reader/ReaderToolbar.tsx`, `src/app/App.tsx` |
| Lookup card content or expansion behavior | `src/components/LookupBottomSheet.tsx`, `QuickExplain.tsx`, `ExpandedExplain.tsx`, `LanguageTabs.tsx` |
| Reading typography, theme tokens, responsive rules | `src/styles.css` + `src/components/ReaderSettings.tsx` |
| PDF controls, mode switch, page navigation | `src/reader/pdf/PdfViewer.tsx`, `src/reader/pdf/PdfModeSwitch.tsx`, `src/reader/DocumentPosition.tsx` |
| Notes UI | `src/notes/NotesPanel.tsx` + `src/notes/store.ts` |
| Saved words UI | `src/vocabulary/VocabularyLibrary.tsx` + `src/vocabulary/store.ts` |
| Storage dashboard / backup UI | `src/storage/DataManagement.tsx` + `src/storage/storageService.ts` |
| Engine and API-key UI | `src/settings/ApiSettings.tsx`, `EngineSettingsForm.tsx` |
| Onboarding and guide language | `src/onboarding/ContextLensOnboarding.tsx`, `src/onboarding/store.ts` |

Both densities expose Contents, Markup and PDF OCR next in the primary actions group; Markup opens the existing tools and Note.
Titles omit known file extensions and subtitles after a colon, with visual ellipsis and a full-title tooltip.
Secondary actions remain in the reader overflow menu. Advanced adds the Context toggle;
lookup content, notes and processing capabilities remain available through the existing components.
Foundation tokens cover semantic surfaces/text, spacing, radii, shadows, touch height, sidebar
width bounds and reading width. UI uses `--font-ui`; reading uses `--font-reading` by default.

Individual CSS declarations are intentionally not documented here; this file records ownership only.

## Invariants

1. `useDesktop()` (1024 px) is the single responsive authority; do not add a second breakpoint
   source inside a component.
2. New UI goes through `App.tsx` state and props; components stay presentational.
3. Styling changes stay in `src/styles.css` and reuse existing tokens.
4. Appearance state is `preferences.theme` → `data-theme`, independent of `preferences.interfaceMode`.
5. Modal surfaces keep the `useDialog` focus trap and Escape behavior.
6. Selection-anchored UI must tolerate re-anchoring when the reader scrolls.

## Important files

`src/app/App.tsx`, `src/reader/ReaderShell.tsx`, `src/reader/ReaderToolbar.tsx`,
`src/reader/ContentsPanel.tsx`, `src/reader/ContextPanel.tsx`, `src/reader/ReaderProgress.tsx`,
`src/reader/DocumentPosition.tsx`, `src/reader/MarkupPalette.tsx`,
`src/components/LookupBottomSheet.tsx`, `src/components/QuickExplain.tsx`,
`src/components/ExpandedExplain.tsx`, `src/components/LanguageTabs.tsx`,
`src/components/PasteComposer.tsx`, `src/components/ReaderSettings.tsx`,
`src/components/LookupStatistics.tsx`, `src/components/useDesktop.ts`,
`src/components/useDialog.ts`, `src/notes/NotesPanel.tsx`,
`src/vocabulary/VocabularyLibrary.tsx`, `src/storage/DataManagement.tsx`,
`src/settings/ApiSettings.tsx`, `src/settings/EngineSettingsForm.tsx`,
`src/onboarding/ContextLensOnboarding.tsx`, `src/styles.css`, `index.html`.
