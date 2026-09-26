# UI System

Purpose: tell future agents **where** a UI change belongs.
Related: [ARCHITECTURE.md](ARCHITECTURE.md), [reader.md](reader.md).

## Structure at a glance

```text
src/main.tsx
  └─ <App>                                  src/app/App.tsx   ← composition + state owner
       ├─ HOME  <main class="home-shell" data-home-theme>
       │    brand-header / home-nav
       │    PasteComposer + import sources
       │    continue-reading, library grid (search + kind filter + load more)
       │    OnboardingCard / ContextLensOnboarding
       │    modals: ApiSettings, VocabularyLibrary, DataManagement
       └─ READER <ReaderShell contentsOpen contextOpen>
            ReaderToolbar  (+ PdfModeSwitch, PageNavigation | DocumentPosition)
            progress-line (reading or OCR progress)
            reader-viewport  → TextReader | PdfViewer | PdfReadingView
            panels: ContentsPanel, LookupBottomSheet, NotesPanel
            overlays: MarkupPalette, ReaderSettings, GoToLocation
```

`ReaderShell` is a thin class-toggle wrapper (`has-contents` / `has-context`); it holds no state.

## Homepage (`home-shell`)

Rendered by the `if (!documentRecord)` branch in `src/app/App.tsx`. Sections, in render order:

- Status banners: offline notice, and a service-worker "update ready" action driven by the
  `context-lens:update-ready` / `context-lens:apply-update` window events from `src/main.tsx`.
- `brand-header`: brand lockup plus `home-nav` actions — Saved words (`VocabularyLibrary`),
  Storage (`DataManagement`), Settings (`ApiSettings`), Guide (`ContextLensOnboarding`),
  `LookupStatistics`, `LanguageToggle`, and a homepage color toggle.
- `PasteComposer` — the primary text entry point, and the file / article-URL import entry.
- Continue-reading and the document library grid: title search, kind filter, `Load more` via
  `queryDocumentLibrary` with offset paging, and per-document delete in a single Dexie transaction.
- `OnboardingCard` until dismissed, then `ContextLensOnboarding` as a modal.
- `home-note` privacy line.

Home theme (`calm` / `bright`) is a homepage-only toggle stored in `db.settings` under
`homepage.theme` and exposed as the `data-home-theme` attribute.

## Reader layout

Desktop and mobile share the same component tree; only affordances differ.
`useDesktop()` (`src/components/useDesktop.ts`) is a single `matchMedia('(min-width: 1024px)')`
subscription and is the responsive authority.

| Area | Desktop | Mobile |
| --- | --- | --- |
| Side panel | Contents and context render as columns (`reader-shell.has-contents` / `.has-context`) | Drawers/sheets; `App.tsx` auto-closes Contents when the lookup sheet or notes open |
| Lookup result | `LookupBottomSheet` in `panel` mode beside the text | `popup` mode anchored to the selection (`anchor` rect) |
| Notes | Side panel | Full-height panel (`NotesPanel`) |
| Toolbar | Labelled buttons: Markup, Notes, Display, overflow icon | Icon buttons plus a `reader-more` overflow menu |
| Contents / Go to | Keyboard `T` and `G` (guarded by `keyboardCanNavigate`) | Toolbar buttons |
| PDF paging | `ArrowLeft` / `ArrowRight` outside form fields | `PageNavigation` buttons |

`LookupBottomSheet` has two stages: `QuickExplain` (selection, core meanings, one-tap Save) and
`ExpandedExplain` (language controls, notes, context, grammar, optional AI actions). Escape
collapses Expanded first, then closes Quick. `useDialog` (`src/components/useDialog.ts`) provides
the modal focus trap and Escape handling.

## UI state ownership

There is no global store. Ownership rules:

- `src/app/App.tsx` owns all cross-component reader state: open document, `currentLocation`,
  `lookupOpen` / `lookupDisplay` / `activeSelection`, `lookup` / `contextResult` / `loading` /
  `error`, the OCR page list and queue, PDF view mode, preferences, engine settings, AI settings,
  library/continue lists, and modal visibility flags. The abort controllers for lookup, context,
  and import live here as refs.
- `lookupService` (`src/lookup/service.ts`) is a module singleton, created once and reconfigured
  from settings.
- Feature components own only transient UI state: `MarkupPalette` tool/color, `LookupBottomSheet`
  expansion, `ReaderToolbar` overflow menu, `PdfViewer` mobile zoom and page sizes,
  `usePdfOcrQueue` queue status, `VocabularyLibrary` and `DataManagement` modals.
- Data is not mirrored into component state: the reader holds a `DocumentRecord` and re-renders
  after `db.documents.update`.
- Reading typography is passed down as CSS custom properties (`--reader-size`, `--reader-leading`,
  `--reader-font`) from the `readerStyle` memo in `App.tsx`.

## Theme system

- `src/styles.css` is the single stylesheet, imported once from `src/main.tsx`.
- Design tokens are CSS variables on `:root` (palette, surfaces, `--reading-surface`,
  `--elevated-surface`, `--primary-text`, `--secondary-text`, `--border`, `--selection`,
  `--danger`, `--overlay`, `--shadow`).
- Theme selection is `data-theme` on `:root` with values `light`, `dark`, `system`; `system` is
  handled by `@media (prefers-color-scheme: dark)`. `AppPreferences.theme` is persisted in
  `db.settings` under `reader-preferences` via `loadPreferences` / `savePreferences`.
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

Individual CSS declarations are intentionally not documented here; this file records ownership only.

## Invariants

1. `useDesktop()` (1024 px) is the single responsive authority; do not add a second breakpoint
   source inside a component.
2. New UI goes through `App.tsx` state and props; components stay presentational.
3. Styling changes stay in `src/styles.css` and reuse existing tokens.
4. Theme state is `preferences.theme` → `data-theme`; the homepage color toggle is separate and
   deliberate.
5. Modal surfaces keep the `useDialog` focus trap and Escape behavior.
6. Selection-anchored UI must tolerate re-anchoring when the reader scrolls.

## Important files

`src/app/App.tsx`, `src/reader/ReaderShell.tsx`, `src/reader/ReaderToolbar.tsx`,
`src/reader/ContentsPanel.tsx`, `src/reader/DocumentPosition.tsx`, `src/reader/MarkupPalette.tsx`,
`src/components/LookupBottomSheet.tsx`, `src/components/QuickExplain.tsx`,
`src/components/ExpandedExplain.tsx`, `src/components/LanguageTabs.tsx`,
`src/components/PasteComposer.tsx`, `src/components/ReaderSettings.tsx`,
`src/components/LookupStatistics.tsx`, `src/components/useDesktop.ts`,
`src/components/useDialog.ts`, `src/notes/NotesPanel.tsx`,
`src/vocabulary/VocabularyLibrary.tsx`, `src/storage/DataManagement.tsx`,
`src/settings/ApiSettings.tsx`, `src/settings/EngineSettingsForm.tsx`,
`src/onboarding/ContextLensOnboarding.tsx`, `src/styles.css`, `index.html`.
