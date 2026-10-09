# UI System

Purpose: tell future agents **where** a UI change belongs.
Related: [ARCHITECTURE.md](ARCHITECTURE.md), [reader.md](reader.md).

## Structure at a glance

> **Status.** Chrome passages follow [reader-behavior-contract.md](reader-behavior-contract.md). The code catches up in P2b; see [reader-redesign-phases.md](reader-redesign-phases.md).
>
> Passages tagged **[P2b]**, **[P2c]**, **[P3]**, **[P4]** or **[Z2]** describe the approved target and are not yet true in code.

```text
src/main.tsx
  └─ <App>                                  src/app/App.tsx   ← composition + state owner
       ├─ HOME  <main class="home-shell">
       │    brand-header / home-nav
       │    PasteComposer + import sources
       │    continue-reading, library grid (search + kind filter + load more)
       │    OnboardingCard / ContextLensOnboarding
       │    modals: ApiSettings, VocabularyLibrary, DataManagement
       └─ READER <ReaderShell surface contentsOpen contextOpen>
          ReaderToolbar (mobile: Back, title, Text|PDF; desktop: Library, title + File switcher, Text|PDF,
                         zoom, Contents, Markup tools, Aa, More) [P2b; File switcher P2c]
          ReaderProgress (single-row bar; mobile: Contents, page number, Markup, More, hairline progress,
                          reveal-only Aa ···; desktop: page number, progress line, OCR status while active [P4])
          reader-viewport → TextReader | PdfViewer | PdfReadingView
          panels: ContentsPanel, LookupBottomSheet (Context Inspector opens from Show more)
          overlays: MarkupPalette, Theme panel (ReaderSettings), GoToLocation, Document (via More)
          NotesPanel stays in the tree and has no chrome entry (ARCH-7). Its entries are the ContentsPanel
                    footer `Notes` action, the Context panel `Open notes` and the selection-bar Note action, and all
                    three open this one overlay. Browsing all saved notes stays an open item after P2b.
```

`ReaderShell` exposes `data-reader-surface` and panel classes. It owns only transient mobile chrome visibility; rules and constants are in [reader-chrome.md](reader-chrome.md).
## Homepage (`home-shell`)

Rendered by the `if (!documentRecord)` branch in `src/app/App.tsx`. Sections, in render order:

- Status banners: offline notice, and a service-worker "update ready" action driven by the
  `context-lens:update-ready` / `context-lens:apply-update` window events from `src/main.tsx`.
- `brand-header`: brand lockup and Saved words, Storage, Settings (the `Language engines`
  dialog — the reading-setup dialog in `src/settings/ApiSettings.tsx`, whose eyebrow reads
  `Reading setup` and whose heading reads `Language engines`), Guide, with the original
  language and appearance controls, plus `LookupStatistics`.
- `home-preferences`: appearance and guide language. Reader typography is reached through the
  Reader `Aa` control, which reuses `ReaderSettings`; there is no second preference state.
- Home has one opening area with Import document, Paste text and Library anchor links, and one Continue-reading section after import/paste, including its empty state and cards. Document lists reuse presentational
  `DocumentIdentity` for local title-initial covers, existing location/progress, and updated date.
  The current document model has no cover/thumbnail field; no extraction or external service is added.
  `ContinueReading` is the default-closed disclosure with a bounded scrolling list.
  Its sibling dismiss controls call `src/app/continueReading.ts`; App owns the displayed documents.
- `PasteComposer` and the existing file/article import surface, with stable anchor targets. Two framed entry surfaces: Paste on the left, Import on the right at tablet/desktop widths; phones stack Paste first.
- Library: title search, kind filter, `Load more` through `queryDocumentLibrary`, and existing
  per-document transactional delete. The responsive card grid keeps its rounded geometry; phones retain a vertical list.
- `OnboardingCard` until dismissed, then `ContextLensOnboarding` as a modal.
- `home-note` privacy line.

**[P2b]** There is one Home layout. The `interfaceMode` preference is removed; `loadPreferences` migrates stored density values, preserving appearance and typography, and the Home keeps the former Simple controls minus density.

## Reader layout

Mobile at ≤1023 px uses a compact Header (Back, title, Text | PDF), a one-row Footer bar and modal drawers/sheets; quiet hides Header and Footer together **[P2b]**. Desktop uses a reading canvas between independent Document and Context columns. `useDesktop()` (`src/components/useDesktop.ts`) is the sole Reader responsive authority. See [reader-chrome.md](reader-chrome.md) and [reader-behavior-contract.md](reader-behavior-contract.md).

| Area | Desktop | Mobile |
| --- | --- | --- |
| Notes | No Header or More entry (ARCH-7); reachable via the Contents panel footer `Notes` action, the Context panel `Open notes` and the selection-bar Note action | Same |
| Header | Library · title ⌄ (File switcher, P2c) · Text \| PDF · zoom − level + · Contents · Highlight Underline Erase · `Aa` · More **[P2b]** | Back · title · Text \| PDF **[P2b]** |
| Footer | Page number (opens Go to location) · thin progress line · OCR status while active **[P4]** | One-row bar: Contents · page number · Markup · More · hairline progress; hidden with Header while quiet **[P2b]** |
| Contents / Go to | Contents icon in Header; an entry navigates; page number opens Go to location; keyboard `T` and `G` unchanged | Contents icon in Footer; same behavior |
| PDF paging | Page number is the only page control; scrolling and guarded arrow keys remain | Same |
| Zoom | Header − level + (PDF mode only) | None **[Z2: pinch]** |
| Theme | `Aa` Header button opens Theme panel **[P3]** | More → Theme **[P3]** |

Mobile Header at 320px allows only the title to shrink; verify both fonts. Footer items retain visible text labels. Geometry is overlay-based: static top and bottom padding stays inside the scroll container (CHR-1, GEO-4, GEO-6). Switching documents flushes location, aborts OCR and lookup, resets panel state, then runs the existing open lifecycle **[P2c]**.

Both panels start closed. The Document column provides Contents and, for PDF, Pages. The Context Inspector opens only from Lookup Show more. Until P4, Document (via More) holds text-source, extraction and OCR actions; from P4, OCR actions move to the OCR More item **[P4]**. Desktop zoom is a direct Header stepper; mobile has no zoom control until pinch **[Z2]**.
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
Selection actions expose exactly Define, Highlight, Note and Close — no Copy, no More disclosure. `useDialog` (`src/components/useDialog.ts`) owns Escape and focus
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

- The File switcher owns only its transient search and filter UI; the list session comes from `useLibrary` and opening goes through App **[P2c]**.
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
  disclosures (Quick/Full follows App's `lookupDisplay`), `ReaderToolbar` overflow menu, `ReaderShell` mobile chrome visibility, `PdfViewer` scale and page sizes,
  `usePdfOcrQueue` queue status, `VocabularyLibrary` and `DataManagement` modals.
- Data is not mirrored into component state: the reader holds a `DocumentRecord` and re-renders
  after `db.documents.update`.
- Reading typography and page margins are passed as CSS custom properties from the `readerStyle` memo in `App.tsx`. `ReaderSettings` provides theme and typography controls; the fate of the Book, News and Academic presets remains open for P3. Size, line height, font, margin and appearance use the existing `reader-preferences` record, with no per-document or location state.

## Theme system

- `src/styles.css` contains shared styling and the Home layout, imported once from `src/main.tsx`. `src/reader-layout.css` loads before opening a document and imports `src/styles.reader-base.css` first for reader markup, PDF presentation, controls and PDF.js text layers, followed by the responsive reader sheets and layout/inspector overrides. Base rules retain their original relative order; shared settings and mixed shared/lookup rules remain global. Both CSS chunks remain in the service-worker precache.
- `src/styles.mobile-reader.css` is imported first by the lazy `reader-layout.css`, after shared styles, and scopes mobile reader/lookup presentation to **≤1023 px**, so 768–1023 px is covered by the same mobile presentation as narrower phones. Shell specificity preserves its overrides over the following reader-layout rules. Linked bilingual meanings stack per sense; unmatched entry glosses remain separate. Quick and Full size to content up to their respective caps.
- `src/styles.desktop-reader.css` is imported next by the lazy `reader-layout.css` and scopes reader presentation to ≥1024 px, with shell specificity that survives the following reader-layout rules. Both responsive stylesheets load before opening a document and remain in the service-worker precache, outside the initial homepage bundle. It owns compact desktop chrome and bounded panel sizing; both open panels share less than half the viewport. Quick keeps its shared 440 px positioning contract and stacked linked senses; Full can use paired columns when its own container reaches 390 px. Shared structure and mobile presentation remain in their existing stylesheets.
- Design tokens are CSS variables on `:root` (palette, surfaces, `--reading-surface`,
  `--elevated-surface`, `--primary-text`, `--secondary-text`, `--border`, `--selection`,
  `--danger`, `--overlay`, `--shadow`).
- Theme selection is `data-theme` on `:root`. Today the values are `light`, `dark` and `system` (handled by `@media (prefers-color-scheme: dark)`). **[P3]** Appearance becomes Light | Dark; a stored `system` is resolved once at migration (APP-1). The reader tokens become Heading/Title, Body, Accent and Page background, plus a separate lookup accent (APP-2, APP-5). `AppPreferences.theme` is persisted in `db.settings` under `reader-preferences` via `loadPreferences` / `savePreferences`.
- System follows the OS color scheme on all surfaces. Paste has a distinct blue accent in both modes, while Import retains green. Reader palette remains shared.
- Reader surfaces deliberately reuse the same semantic tokens in light and dark. Do not introduce a second palette for the reader.
- Book, News and Academic presets in `ReaderSettings`: their fate is decided with the Theme panel in P3 (contract open item 4).
- Foundation tokens cover semantic surfaces/text, spacing, radii, shadows, touch height, sidebar width bounds and reading width.
- One bundled local Sans | Serif font setting drives interface and reading typography (APP-3) **[P3]**.

## Where to make a change

Classify the change before verifying it; presentation-only edits (CSS color/token, spacing, border,
radius, typography, layout-only or responsive rules) stop at `npm run check:css` and do not require
subsystem verification. See the canonical
[change classes](verification-map.md#change-classes).

| Change | Location |
| --- | --- |
| New homepage section, import source, or library control | `src/app/App.tsx` home branch, plus a component in `src/components/` |
| Reader chrome, panel arrangement, keyboard shortcuts | `src/reader/ReaderShell.tsx`, `src/reader/ReaderToolbar.tsx`, `src/reader/ReaderProgress.tsx`, `src/app/App.tsx`; see [reader-chrome.md](reader-chrome.md) and [reader-behavior-contract.md](reader-behavior-contract.md) |
| File switcher **[P2c]** | new `src/reader/FileSwitcher.tsx` using the `useLibrary` session through a list component shared with Home; opening stays in `App.tsx` |
| Theme panel (`Aa`, More → Theme) | `src/components/ReaderSettings.tsx` |
| Reader Footer bar and page number | `src/reader/ReaderProgress.tsx`, `src/reader/DocumentPosition.tsx` |
| Lookup card content or expansion behavior | `src/components/LookupBottomSheet.tsx`, `QuickExplain.tsx`, `ExpandedExplain.tsx`, `LanguageTabs.tsx` |
| Reading typography, theme tokens, responsive rules | `src/styles.css` + `src/components/ReaderSettings.tsx` |
| PDF controls, mode switch, page navigation | `src/reader/pdf/PdfViewer.tsx`, `src/reader/pdf/PdfModeSwitch.tsx`, `src/reader/DocumentPosition.tsx` |
| Notes UI | `src/notes/NotesPanel.tsx` + `src/notes/store.ts` |
| Saved words UI | `src/vocabulary/VocabularyLibrary.tsx` + `src/vocabulary/store.ts` |
| Storage dashboard / backup UI | `src/storage/DataManagement.tsx` + `src/storage/storageService.ts` |
| Engine and API-key UI | `src/settings/ApiSettings.tsx`, `EngineSettingsForm.tsx` |
| Onboarding and guide language | `src/onboarding/ContextLensOnboarding.tsx`, `src/onboarding/store.ts` |
| Offline status and readiness UI | `src/components/OfflineBadge.tsx`, `src/documents/offline.ts`, `src/app/App.tsx` (`online`) |

Titles omit known file extensions and subtitles after a colon, with visual ellipsis and a full-title tooltip.

Individual CSS declarations are intentionally not documented here; this file records ownership only.

## Invariants

1. `useDesktop()` (1024 px) is the single responsive authority; do not add a second breakpoint
   source inside a component.
2. New UI goes through `App.tsx` state and props; components stay presentational.
3. Styling changes stay in the shared or scoped presentation stylesheets and reuse existing tokens.
4. Appearance state is `preferences.theme` → `data-theme`; there is no density mode.
5. Modal surfaces keep the `useDialog` focus trap and Escape behavior.
6. Selection-anchored UI must tolerate re-anchoring when the reader scrolls.
7. More is the only menu architecture; Contents, Markup, Theme, the File switcher and Go to location are panels, palettes or dialogs (FTR-4).
8. No action is reachable from two places (MORE-4).

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
