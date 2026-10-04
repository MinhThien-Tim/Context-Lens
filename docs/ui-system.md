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
            ReaderToolbar (Back, document title; PDF: Original/Reading — exactly and only, §7.1)
                        ReaderProgress (bottom location/page navigation, percent, direct zoom stepper,
                                       secondary OCR status, Reader menu/More trigger)
                        reader-viewport  → TextReader | PdfViewer | PdfReadingView
                        panels: ContentsPanel (Document), ContextPanel (empty), LookupBottomSheet, NotesPanel
                        overlays: MarkupPalette, ReaderSettings, GoToLocation, Document tools (via More)
```

`ReaderShell` exposes `data-interface-mode` and `data-reader-surface`, plus panel classes.
It owns only transient mobile chrome visibility, and it is specified by
[reader-behavior-contract.md](reader-behavior-contract.md) §4–§6 and
[reader-chrome-foundation.md](reader-chrome-foundation.md). In short: accumulated **downward** reading
scroll quiets the header/footer and accumulated **upward** travel reveals them, using one shared
threshold; taps never change chrome state; only focus entering real Reader chrome reveals it. Quiet is
visual only — it never changes content height, scrollTop, page identity or layout geometry. Open
panels, selection, settings and any open reading overlay (including the OCR
`.pdf-reading-selection-actions` bar) keep controls visible. It observes existing scroll events, never
navigation. The full rules, thresholds and the obsolete tap-reveal rule that was removed in
ChromeFoundation are recorded in the ChromeFoundation spec.

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
  Both densities use the default-closed `ContinueReading` disclosure with a bounded scrolling list.
  Its sibling dismiss controls call `src/app/continueReading.ts`; App owns the displayed documents.
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

Desktop uses a reading canvas between independent Document and Context columns. Mobile below
1024 px uses a compact header, bottom page navigation and modal drawers/sheets. There is no tablet
band: 768–1023 px is Mobile presentation. `useDesktop()` (`src/components/useDesktop.ts`) is a single
`matchMedia('(min-width: 1024px)')` subscription and is the sole Reader responsive authority; the
obsolete 768 px Reader breakpoint has been removed rather than re-targeted. See
[reader-chrome-foundation.md](reader-chrome-foundation.md) for the foundation rules and for which
Mobile presentation gaps belong to the MobileChrome phase.

| Area | Desktop | Mobile |
| --- | --- | --- |
| Side panel | Contents and context render as columns (`reader-shell.has-contents` / `.has-context`) | Drawers/sheets; `App.tsx` auto-closes Contents when the lookup sheet or notes open |
| Lookup result | Quick popup; explicit Full opens Context Inspector | Quick bottom sheet; Full expands the same sheet |
| Notes | Side panel | Full-height panel (`NotesPanel`) |
| Toolbar | Back, bounded document title and Original–Reading in the Header band; page/location, progress, percentage, direct PDF zoom stepper, OCR status and the single **More** disclosure in the Footer band. Every secondary action (Contents, Context, Markup, Text and theme, Notes, Language engines, Document tools, Click-to-lookup) is reached once through **More**, presented as a popover ≥1024 px. See [desktop-reader.md](desktop-reader.md) | Back/title/Original–Reading in the overlay Header; every secondary action is reached once through the Footer **More** disclosure, presented as a bottom sheet ≤1023 px and a popover ≥1024 px |
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
existing text-source, OCR language, recognition and queue actions. Under the frozen contract OCR next
is retired as a Header/L1 action and is a document-tools action meaning "run OCR on remaining
unprocessed pages"; OCR queue semantics are unchanged. Original keeps a centered PDF canvas with a
zoom control in both densities: zoom out, current level, zoom in. Under the frozen contract the
footer Zoom **menu** is retired and replaced by a direct Footer stepper in both densities; there is
no separate desktop zoom bar and no zoom popup at any width. Reading retains the shared structured
pages with comfortable margins
and no card border per page.
`ReaderProgress` always reports reading progress separately from optional OCR status. PDF page
navigation is rendered once at the bottom; non-PDF location opens the existing Go to dialog.
Header/footer size variables determine PDF viewport height; quiet chrome is visual only — opacity and
transform, never viewport size, content height or scrollTop (contract §4.2, A12). Text chrome overlays
window-scrolled content. Long text continues to use window scrolling and the existing location contract.

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
Browser page zoom moves and scales the visual viewport. The mobile lookup sheet follows its visible
offset and dimensions while compensating for page scale; PDF control zoom affects only page rendering.
Selection actions use Define, Highlight and Note first; existing copy/color and translation
capabilities remain available. `useDialog` (`src/components/useDialog.ts`) owns Escape and focus
restoration; only mobile surfaces trap focus. Focus traps include disclosure summaries and exclude
controls inside closed disclosures.

### Progressive lookup readiness

App renders `lookupService.immediate` during selection and passes it into `quick` for reuse.
`quickPending` tracks automatic enrichment separately from explicit Context/Translate `loading`.
The existing result stays mounted as guarded service snapshots arrive. `Finding meanings…`
appears only for an empty pending result; useful content gets a small secondary progress indicator.
Quick and Full consume the same snapshots; changing display mode does not rerun any pipeline work.
`useMeaningReveal` compares meaning text across committed results, so initial/cached data and
opening Full have no reveal delay; newly arriving text can animate independently. Existing
sense keys, disclosure state and scrolling body survive enrichment. Abort controllers remain
owned by App and guard both progressive updates and final completion.

### Offline surface

Offline state is `App.tsx` state (`online`, fed by the browser `online`/`offline` events), never a
component-local store or a new preference. Three quiet surfaces report it, and none of them
downloads anything:

- Homepage: the existing `.status-banner` offline notice above the home shell.
- Reader: a `.reader-offline` status pill in `ReaderShell`, rendered `Offline · Local only`.
- Lookup: `LookupBottomSheet`'s `offline` prop, passed as `offline={!online}`, replacing the
  enrichment pending state with `Offline · Local results`. When offline, `quickPending` is not
  rendered at all.

`OfflineBadge` (`src/components/OfflineBadge.tsx`) is the per-document readiness marker, rendered
inside library cards, Advanced `DocumentIdentity` and Continue-reading cards. It renders
`✓ Available offline` only when `isAvailableOffline` (`src/documents/offline.ts`) is true, and
nothing otherwise. The predicate is pure and storage-backed: a PDF needs its stored `data`, every
other kind needs stored `content` or `data`. It never triggers a fetch, an import or a download, and
the current document model gains no new field.

Network-only actions fail fast with a clear message instead of waiting for a timeout: the share-target
and Import-URL paths in `App.tsx` reject immediately while offline with
`OFFLINE_ARTICLE_IMPORT_MESSAGE`. Import, translation, AI and context providers remain unchanged
when online, and local reading, lookup, markup, notes and vocabulary never depend on the network.

The guide documents this flow in both languages. `ContextLensOnboarding` renders a `.guide-offline`
section with `offlineWorks` / `offlineNeeds` and the `offlineTitle` heading ("Use Context Lens
offline" / "Dùng Context Lens khi ngoại tuyến"), following the existing `guide-*` section pattern.

## UI state ownership

There is no global store. Ownership rules:

- `src/app/useLibrary.ts` owns the Library list session: title query, kind filter, paged documents,
  loading state, and first-page refresh. `App.tsx` renders both Library variants and owns document
  opening, transactional deletion, and Continue reading.
- `src/app/App.tsx` owns all cross-component reader state: open document, `currentLocation`,
  `contentsOpen` / `contextPanelOpen`, `lookupOpen` / `lookupDisplay` / `activeSelection`, `lookup` / `contextResult` / `loading` /
  `error`, the OCR page list and queue, PDF view mode, preferences, engine settings, AI settings,
  Continue reading list, and modal visibility flags. The abort controllers for lookup, context,
  and import live here as refs.
- `lookupService` (`src/lookup/service.ts`) is a module singleton, created once and reconfigured
  from settings.
- Feature components own only transient UI state: `MarkupPalette` tool/color, `LookupBottomSheet`
  disclosures (Quick/Full follows App's `lookupDisplay`), `ReaderToolbar` overflow menu, `ReaderShell` mobile chrome visibility, `PdfViewer` mobile zoom and page sizes,
  `usePdfOcrQueue` queue status, `VocabularyLibrary` and `DataManagement` modals.
- Data is not mirrored into component state: the reader holds a `DocumentRecord` and re-renders
  after `db.documents.update`.
- Reading typography and page margins are passed as CSS custom properties from the `readerStyle`
  memo in `App.tsx`. `ReaderSettings` provides Book, News and Academic presets plus manual controls;
  size, line height, font, margin and appearance use the existing `reader-preferences` record, with
  no per-document or location state.

## Theme system

- `src/styles.css` contains shared styling and the original Simple homepage, imported once from `src/main.tsx`. `src/reader-layout.css` loads before opening a document and imports `src/styles.reader-base.css` first for reader markup, PDF Original/Reading presentation, controls and PDF.js text layers, followed by the responsive reader sheets and layout/inspector overrides. Base rules retain their original relative order; shared settings and mixed shared/lookup rules remain global. Both CSS chunks remain in the service-worker precache. `src/home-advanced.css` is loaded on demand for Advanced and scopes its rules to the Advanced home shell.
- `src/styles.mobile-reader.css` is imported first by the lazy `reader-layout.css`, after shared styles, and scopes mobile reader/lookup presentation to **≤1023 px**, so 768–1023 px is covered by the same mobile presentation as narrower phones. Shell specificity preserves its overrides over the following reader-layout rules. Linked bilingual meanings stack per sense; unmatched entry glosses remain separate. Quick and Full size to content up to their respective caps.
- `src/styles.desktop-reader.css` is imported next by the lazy `reader-layout.css` and scopes reader presentation to ≥1024 px, with shell specificity that survives the following reader-layout rules. Both responsive stylesheets load before opening a document and remain in the service-worker precache, outside the initial homepage bundle. It owns compact desktop chrome and bounded panel sizing; both open panels share less than half the viewport. Quick keeps its shared 440 px positioning contract and stacked linked senses; Full can use paired columns when its own container reaches 390 px. Shared structure and mobile presentation remain in their existing stylesheets.
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

Classify the change before verifying it; presentation-only edits (CSS color/token, spacing, border,
radius, typography, layout-only or responsive rules) stop at `npm run check:css` and do not require
subsystem verification. See the canonical
[change classes](verification-map.md#change-classes).

| Change | Location |
| --- | --- |
| New homepage section, import source, or library control | `src/app/App.tsx` home branch, plus a component in `src/components/` |
| Reader chrome, panel arrangement, keyboard shortcuts | `src/reader/ReaderShell.tsx`, `src/reader/ReaderToolbar.tsx`, `src/reader/ReaderProgress.tsx`, `src/app/App.tsx`; see [mobile-chrome.md](mobile-chrome.md) |
| Lookup card content or expansion behavior | `src/components/LookupBottomSheet.tsx`, `QuickExplain.tsx`, `ExpandedExplain.tsx`, `LanguageTabs.tsx` |
| Reading typography, theme tokens, responsive rules | `src/styles.css` + `src/components/ReaderSettings.tsx` |
| PDF controls, mode switch, page navigation | `src/reader/pdf/PdfViewer.tsx`, `src/reader/pdf/PdfModeSwitch.tsx`, `src/reader/DocumentPosition.tsx` |
| Notes UI | `src/notes/NotesPanel.tsx` + `src/notes/store.ts` |
| Saved words UI | `src/vocabulary/VocabularyLibrary.tsx` + `src/vocabulary/store.ts` |
| Storage dashboard / backup UI | `src/storage/DataManagement.tsx` + `src/storage/storageService.ts` |
| Engine and API-key UI | `src/settings/ApiSettings.tsx`, `EngineSettingsForm.tsx` |
| Onboarding and guide language | `src/onboarding/ContextLensOnboarding.tsx`, `src/onboarding/store.ts` |
| Offline status and readiness UI | `src/components/OfflineBadge.tsx`, `src/documents/offline.ts`, `src/app/App.tsx` (`online`) |

Both densities expose Contents, Markup and Document tools through the single **More** disclosure; Markup opens the existing tools and Note. The mobile Header carries only Back, the document title, and Original/Reading for PDF, and the mobile Footer owns progress, location, the direct PDF zoom stepper, the More trigger, and OCR status only while an OCR run is active.
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
3. Styling changes stay in the shared or scoped presentation stylesheets and reuse existing tokens.
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
`src/onboarding/ContextLensOnboarding.tsx`, `src/styles.css`, `index.html`,
`src/components/OfflineBadge.tsx`, `src/documents/offline.ts`.

### Desktop Quick placement
`AppPreferences.lookupPopupPlacement` lives in the existing `reader-preferences` settings object.
Missing or invalid values normalize to Auto without a database schema migration. Auto retains the
selection anchor algorithm. Desktop Quick alone offers Auto/Keep here in More and a word/POS pointer
handle; a completed drag saves normalized ratios once through App's existing preference persistence.
`lookupPopupPlacement.ts` owns width, bounds and coordinate conversion. The component measures popup
size and observes resize to restore relative placement with 12 px clearance, below the reader header.
The body scrolls within the remaining viewport height. Full, closing, selection and document changes
preserve the preference; mobile ignores it. Placement never invokes lookup providers.

### Quick presentation
`AppPreferences.lookupQuickMode` independently selects Simple (default) or Standard inside Quick,
persisted in `reader-preferences`; absent/invalid values normalize to Simple without a schema change.
App passes the preference and change callback to the existing `LookupBottomSheet`. Its compact header
button, marked with a small chevron, switches presentation immediately without replacing the result or invoking lookup services.
Simple moves the shared language cycle into More, retaining the same EN/VI/bilingual preference.
`QuickExplain` retains existing sense ordering and source-linked pairs. Simple selects 3–6 nonempty
meanings according to average visible text length, including confirmed context. Exact duplicate
pairs are omitted. Unpaired fallback uses at most 4 long or 6 short Vietnamese glosses when visible
senses have no linked Vietnamese. Standard retains existing content and local expansion.
Simple uses flexible EN/VI columns on desktop and sheets at least 430 px wide; narrower phones
stack each pair EN then VI. Entry-level glosses remain separate and lightly labelled.
Simple uses compact ambiguity
status on both platforms. Full ignores this preference; Show less restores it. Desktop retains the
440 px width, drag handle, saved placement and existing resize measurement. Platform styles own
presentation through `data-quick-mode`; no new lookup pipeline or storage table is introduced.
