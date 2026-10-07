# Doc patches for P2a

Instructions for the agent. Apply exactly; do not rewrite untouched sections. After applying, `git grep` for the deleted file names and for each retired label, and fix every hit.

## 1. Files

| Action | File |
| --- | --- |
| Replace | `docs/reader-behavior-contract.md` ← `reader-behavior-contract.md` (v2) |
| Add | `docs/reader-chrome.md` |
| Add | `docs/reader-redesign-phases.md` |
| Delete | `docs/reader-chrome-foundation.md`, `docs/mobile-chrome.md`, `docs/desktop-reader.md` (merged into `reader-chrome.md`) |
| Edit | `docs/reader.md`, `docs/ui-system.md` (below) |
| Edit | `docs/change-dependencies.md`: Reader routing rows point to `reader-chrome.md` |

Do **not** delete `reader.md` or `ui-system.md`: besides chrome they own PDF loading, extraction, OCR integration, lookup presentation, offline and theme content with no other home. Replace only the chrome passages below; passages that belong to a later phase (OCR → P4, lookup → P5) are migrated in that phase.

Retired labels to purge from docs and tests: `Reading` / `Original` (as mode names), `Document tools` (as a More item), `Text and theme`, `Language engines` (More item), `Click word lookup`, `Reading appearance`, `Aa` as a Header button.

## 2. `docs/reader.md`

**a. Related line.** Add `[reader-chrome.md](reader-chrome.md)` and `[reader-behavior-contract.md](reader-behavior-contract.md)`.

**b. Table row "Extra chrome".** Replace with: `Header Text \| PDF (desktop: zoom, Contents, markup tools, Aa); Footer page number and progress (mobile: Contents, Markup, More); Document via More` (Original) and `Header Text \| PDF; reading typography via Theme` (Reading).

**c. Zoom row.** Replace "direct Footer stepper at every density" with "direct stepper in the desktop Header toolbar; no zoom control on mobile".

**d. Paragraph block.** Replace everything from "Both PDF surfaces share the shell bottom `PageNavigation`…" through "…keeps the last page reachable above the overlaid footer." with:

> Both PDF modes share one chrome, specified in [reader-chrome.md](reader-chrome.md) and governed by [reader-behavior-contract.md](reader-behavior-contract.md). Header and Footer overlay the reading surface and reserve no space (static padding sits inside the scroll container), so chrome never shifts content or scroll mapping. The single Header `Text | PDF` control switches mode (stored values stay `reading` / `original`). Desktop zoom is a direct Header stepper; mobile has no zoom control. At ≤1023px quiet chrome hides Header and Footer together after accumulated downward travel and reveals them after accumulated upward travel, at the content top, on focus entering chrome, or through the reveal-only `Aa ···` control; taps never change chrome state. Open overlays (More, selection actions, Markup palette) block quieting. Reading Mode keeps a stable full-height scroll surface with bottom padding so the last page stays reachable above the Footer.

**e. "Mode choice" paragraph.** Keep as is; add: "Visible labels are `Text` and `PDF`; preference and location values are unchanged."

**f. Selection, Original Reader.** Replace "**Click word lookup** control … is a More action" with "**Click lookup** toggle … is a More item".

**g. OCR integration.** Untouched until P4.

## 3. `docs/ui-system.md`

**a. Structure diagram, READER block.** Replace with:

```text
READER <ReaderShell surface contentsOpen contextOpen>
     ReaderToolbar  (mobile: Back, title, Text|PDF; desktop: Library, title + File switcher, Text|PDF, zoom, Contents, Markup tools, Aa, More)
     ReaderProgress (single-row bar; mobile: Contents, page number, Markup, More, hairline progress, reveal-only Aa ···;
                     desktop: page number, progress line, OCR status while active)
     reader-viewport → TextReader | PdfViewer | PdfReadingView
     panels:   ContentsPanel, LookupBottomSheet (Context Inspector opens from Show more)
     overlays: MarkupPalette, Theme panel (ReaderSettings), GoToLocation, Document (via More)
```

`NotesPanel` stays in the tree untouched (contract ARCH-7).

**b. Paragraph "`ReaderShell` exposes `data-interface-mode`…".** Replace with: "`ReaderShell` exposes `data-reader-surface` and panel classes. It owns only transient mobile chrome visibility; rules and constants are in [reader-chrome.md](reader-chrome.md)."

**c. Homepage density paragraph ("Density is `AppPreferences.interfaceMode`…").** Replace with: "There is one Home layout. `interfaceMode` is removed; `loadPreferences` migrates stored density values, preserving appearance and typography, and the home brand-header keeps the Simple controls minus density."
Also delete the Advanced-only bullets in the Homepage section and in the `brand-header` line.

**d. Reader layout table, "Toolbar" row.** Replace with: "Header: mobile Back, bounded title, `Text \| PDF`; desktop adds Library, the File switcher, zoom, Contents, Highlight/Underline/Erase, `Aa` and More. Footer: page number and progress at every band; mobile also Contents, Markup and More; desktop also OCR status while active. See [reader-chrome.md](reader-chrome.md)."
**"Contents / Go to" row.** Replace with: "Contents icon (Header on desktop, Footer bar on mobile); tapping an entry navigates. The location button opens Go to location. Keyboard `T` and `G` unchanged."

**e. Paragraphs "Simple starts with both panels closed…" and "The top PDF control contains only Original/Reading…".** Replace with: "Both panels start closed. The Document column provides Contents and, for PDF, Pages. The Context Inspector opens only from Lookup Show more. Document (via More) holds text-source, extraction and, until P4, OCR actions. Desktop zoom is a direct Header stepper with no popup; mobile has no zoom control."

**f. "Both densities expose the eight approved secondary actions…" paragraph.** Replace through "…replace `Document tools`, …" with: "More (bottom sheet ≤1023px, popover ≥1024px) holds, per contract MORE-2, Document, Theme (mobile only; desktop uses the `Aa` Header button), Languages, OCR (P4) and Click lookup." Keep the title-trimming sentence.

**g. Invariant 4.** Replace with: "Appearance state is `preferences.theme` → `data-theme`; there is no density mode."

**h. "Where to make a change", row "Reader chrome…".** Link `reader-chrome.md` instead of `mobile-chrome.md`.

**i. Typography.** Wherever `ui-system.md` describes fonts or tokens, state that one font setting (Sans | Serif, bundled locally) drives interface and reading typography (contract APP-3).
