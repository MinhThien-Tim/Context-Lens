# Refinements for `reader.md` and `ui-system.md`

Apply to the 2026-10-07 rewrites. Replace only the passages named here. Phase tags mean "not yet true in code": **[P2b]** chrome and `interfaceMode`, **[P2c]** File switcher, **[P3]** Theme, **[P4]** OCR, **[Z2]** pinch.

Why: the rewrites describe the target chrome in the present tense while the branch code (`4ac6b87`) is still the legacy chrome. Architecture-of-record docs must say what is true, so each target passage carries its phase tag and a status banner.

## 0. Status banner (both docs, directly under the title)

> **Status.** Chrome passages follow [reader-behavior-contract.md](reader-behavior-contract.md). The code catches up in P2b; see [reader-redesign-phases.md](reader-redesign-phases.md).
>
> Passages tagged **[P2b]**, **[P2c]**, **[P3]**, **[P4]** or **[Z2]** describe the approved target and are not yet true in code.

## 1. `reader.md`

**1.1 Chrome paragraph.** Start the paragraph "Both PDF modes share one chrome…" with `**[P2b]**`.

**1.2 Selection, PDF mode.** Replace the sentences from "On mobile, the session-local **Click lookup** control…" through "Quiet chrome does not move the Original PDF viewport during contact." with:

> On mobile, **Click lookup** is a session-local More toggle (default on; MORE-6). While it is on, a short, stationary single-finger tap on an actual text glyph maps the word through the same index and opens Quick directly; with it off, native selection remains and tap lookup is disabled. Scroll, long press, multi-touch, links and empty page space never trigger tap lookup. Chrome transitions never move the Original PDF viewport during contact (chrome overlays a full-height viewport, CHR-1).

**1.3 Zoom, last sentences of the desktop-zoom bullet.** Replace "Mobile zoom remains session-local and resets to fit-width when the viewer remounts. Pinch gestures and margin cropping are not implemented." with:

> The mobile custom scale (0.1–3) and its session-local stepper are legacy **[P2b: deleted]**; until pinch ships **[Z2]** mobile PDF renders at fit-width. Margin cropping is not implemented.

**1.4 New subsection after "Render lifecycle": Current implementation — PDF scale pipeline (audit of `4ac6b87`; Z1 verifies).** This describes today's code, not the target; keep it apart from target behavior so Z1 does not force contract edits.

> Scale is computed in `PdfViewer` (`calculatePdfScale`, the desktop stepper state, the legacy mobile zoom) and passed to `PdfPage`, which derives the PDF.js viewport and `canvasBackingSize`, owns render tasks and cancellation, the per-render text layer and the highlight overlay. `usePdfScroll` maps scroll geometry to page, page offset and location. Any scale change (the stepper now, pinch in Z2) must keep the bitmap, text layer, overlay geometry, page slot sizes and scroll location consistent. Z1 verifies this and measures render cost; no performance figure is known from source inspection.

**1.5 OCR status sentence.** Replace "Active OCR progress is an ambient status in `ReaderProgress`… Queue/source/OCR actions live there too." with:

> While an OCR run is active (`preparing | running | paused`) the Footer shows a non-interactive status beside the page number and progress line (OCR-3; no percentage). It is hidden on terminal success, terminal error, cancel and clear. Until P4 the queue, source and run actions live in Document (via More); from P4 they live in the OCR More item **[P4]**.

**1.6 U6 sentence.** Replace "the hard-coded 6-candidate cap is the known U6 defect deferred to the PDF/OCR controls phase." with "the hard-coded 6-candidate cap is the known U6 defect, fixed in P4 (OCR-1)." Remove the stray indentation of the last OCR bullet ("physical phones is still unmeasured…").

**1.7 OCR out-of-scope line.** Replace "Out of scope by design: whole-book OCR, …" with:

> Out of scope by design: unattended whole-book OCR. The first 12 candidate pages may be preloaded locally; a full OCR run starts only from an explicit user action and then continues through the remaining 12-page windows automatically. Also out of scope: selectable OCR overlays on the original PDF page and vision-API fallback.

**1.8 Invariants, append:**

> 12. **Chrome is an overlay. [P2b]** Header and Footer never reserve space or resize the reading viewport; static padding inside the scroll container keeps the first and last lines clear (CHR-1, GEO-4, GEO-6). Visibility changes only through the paths in INP-1; tap never toggles it.
> 13. **Switching documents is a close-then-open lifecycle. [P2c]** A document change flushes the previous location (invariant 10), aborts the OCR queue and lookup, resets panel state and runs the open lifecycle again (GEO-3). The File switcher adds no second open path.

## 2. `ui-system.md`

**2.1 Diagram note.** Replace "`NotesPanel` remains mounted per ARCH-7" with: "`NotesPanel` stays in the tree but has no chrome entry (ARCH-7); saved notes are unreachable in the Reader until a separate task decides."

**2.2 Reader layout intro.** Replace "Mobile below 1024 px uses a compact header, bottom page navigation and modal drawers/sheets." with: "Mobile at ≤1023 px uses a compact Header (Back, title, Text | PDF), a one-row Footer bar and modal drawers/sheets; quiet hides Header and Footer together **[P2b]**."

**2.3 Reader layout table.** Replace the rows Notes, Toolbar, Contents / Go to and PDF paging (the rewrite repeats one text in both columns) with:

| Area | Desktop | Mobile |
| --- | --- | --- |
| Notes | No chrome entry (ARCH-7); `NotesPanel` retained | Same |
| Header | Library · title ⌄ (File switcher, P2c) · Text \| PDF · zoom − level + · Contents · Highlight Underline Erase · `Aa` · More | Back · title · Text \| PDF |
| Footer | Page number (opens Go to location) · thin progress line · OCR status while active | One-row bar: Contents · page number · Markup · More · hairline progress; hidden with the Header while quiet |
| Contents / Go to | Header Contents icon; an entry navigates; the page number opens Go to location; keyboard `T` and `G` unchanged | Footer Contents icon; same behavior |
| PDF paging | The page number is the only page control; scrolling and guarded arrow keys remain | Same |
| Zoom | Header − level + (PDF mode only) | None **[Z2: pinch]** |
| Theme | `Aa` Header button opens the Theme panel | More → Theme |

**2.4 Remove the duplicate More paragraph.** Delete the paragraph after the "Where to make a change" table that starts "More (bottom sheet ≤1023px, popover ≥1024px) holds…" (the same paragraph already exists in Reader layout), and delete "Lookup content, Notes, and processing capabilities remain available…" (the Notes statement is now in the table). Move the sentence about foundation tokens into the Theme system section and keep: "One bundled local Sans | Serif font setting drives interface and reading typography (APP-3) **[P3]**."

**2.5 Homepage.** Start "There is one Home layout. `interfaceMode` is removed…" with `**[P2b]**`.

**2.6 Theme system.** Replace "Theme selection is `data-theme` on `:root` with values `light`, `dark`, `system`; `system` is handled by `@media (prefers-color-scheme: dark)`." with:

> Theme selection is `data-theme` on `:root`. Today the values are `light`, `dark` and `system` (handled by `@media (prefers-color-scheme: dark)`). **[P3]** Appearance becomes Light | Dark; a stored `system` is resolved once at migration (APP-1). The reader tokens become Heading/Title, Body, Accent and Page background, plus a separate lookup accent (APP-2, APP-5).

Add: "Book, News and Academic presets in `ReaderSettings`: their fate is decided with the Theme panel in P3 (contract open item 7)."

**2.7 "Where to make a change", add rows:**

| Change | Location |
| --- | --- |
| File switcher **[P2c]** | new `src/reader/FileSwitcher.tsx` using the `useLibrary` session through a list component shared with Home; opening stays in `App.tsx` |
| Theme panel (`Aa`, More → Theme) | `src/components/ReaderSettings.tsx` |
| Reader Footer bar and page number | `src/reader/ReaderProgress.tsx`, `src/reader/DocumentPosition.tsx` |

**2.8 UI state ownership, add:** "The File switcher owns only its transient search and filter UI; the list session comes from `useLibrary` and opening goes through App **[P2c]**."

**2.9 Invariants, append:**

> 7. More is the only menu architecture; Contents, Markup, Theme, the File switcher and Go to location are panels, palettes or dialogs (FTR-4).
> 8. No action is reachable from two places (MORE-4).

## 3. Retired vocabulary: purge, do not patch line by line

After applying sections 1 and 2, no retired term may remain in `docs/` except in historical decision records under `docs/tasks/` (which are not edited) and in passages tagged **[P2b]** that describe a migration.

Retired: `Original/Reading` and `Reading/Original` as mode names (use `Text` / `PDF`); `Document tools` as a More item (it names only the surface Document opens); `Text and theme`; `Language engines` as a More item (use `Languages`); `Click word lookup`; `Reading appearance`; `PageNavigation`; previous/next page buttons; a percentage in the Footer; a Footer zoom stepper or zoom menu; Notes, Context or Markup as chrome entries; `Simple/Advanced` and `interfaceMode`; `ReaderFab`; the deleted docs `reader-chrome-foundation.md`, `mobile-chrome.md`, `desktop-reader.md`.

Check (PowerShell, from the repo root):

```powershell
git grep -n -i -E "Original/Reading|Reading/Original|Text and theme|Language engines|Click word lookup|Reading appearance|PageNavigation|ReaderFab|reader-chrome-foundation|mobile-chrome\.md|desktop-reader\.md" -- docs ':!docs/tasks'
git grep -n -i -E "Simple/Advanced|interfaceMode|previous page|next page|prev/next|Footer.*(zoom|percent)|zoom.*Footer" -- docs ':!docs/tasks'
git grep -n -i "Document tools" -- docs ':!docs/tasks'
```

Every remaining hit must be justified in the report (migration note tagged **[P2b]**, or the surface name `Document tools`).
