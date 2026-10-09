# PDF/OCR Controls — Implementation Spec

**Status:** Active · **Authority:** [`reader-behavior-contract.md`](./reader-behavior-contract.md) (frozen, wins over this doc) · **Phase:** P4 (OCR behavior); PDF scale ownership follows P2b and Z2

This is the implementation-facing source of truth for PDF-specific controls and OCR behavior in the Reader. It owns zoom presets, `Text | PDF` presentation, OCR preload, OCR continuation, OCR start ownership, OCR status lifecycle, and the PDF-specific More actions. It does **not** redesign the Reader chrome architecture, the OCR queue engine, or the responsive model — those are fixed by the frozen contract and [`reader.md`](./reader.md).

> **Status.** Chrome passages follow [reader-behavior-contract.md](reader-behavior-contract.md). The code catches up in P2b; see [reader-redesign-phases.md](reader-redesign-phases.md).
>
> Passages tagged **[P2b]**, **[P2c]**, **[P3]**, **[P4]** or **[Z2]** describe the approved target and are not yet true in code.

## 1. Scope and ownership

### 1.1 What this spec owns
- PDF zoom presets and the desktop zoom control (Header selector + stepper). **[P2b]** The mobile Footer stepper and mobile custom-scale code are deleted; mobile has no zoom control until pinch ships **[Z2]**.
- `Text | PDF` presentation control (single control, presentation-only).
- OCR initial preload (first 12 candidate pages).
- OCR automatic continuation (consecutive 12-page windows until exhaustion).
- OCR start — exactly one canonical entry point **[P4]**, moving out of Document into its own More item. Until P4 it stays in Document.
- OCR status — one canonical presentation with correct active/terminal lifecycle.
- PDF-specific More actions (the Document entry, which is the surface Document opens).

### 1.2 What this spec does NOT own
- Reader chrome architecture (Header/Footer/More layout) — see [`reader-chrome.md`](./reader-chrome.md).
- OCR queue engine internals (worker, eligibility, cache, storage guard) — see [`reader.md`](./reader.md) §"OCR integration".
- Responsive model — `useDesktop()` / 1024px is the sole authority ([reader-behavior-contract.md](./reader-behavior-contract.md) §1.3).
- Icon family or general Header layout — only PDF/OCR control integration is in scope.

## 2. Responsive model

- `≤1023px` = Mobile; `≥1024px` = Desktop. No tablet variant (contract §1.1–§1.3).
- `useDesktop()` (`src/components/useDesktop.ts`) is the sole semantic responsive authority.
- PDF/OCR controls may present differently by viewport, but must represent the same underlying actions/state.

## 3. PDF zoom

**[P2b]** The current mobile Footer stepper and custom-scale state are legacy and are removed in P2b. Until pinch ships **[Z2]**, mobile PDF uses fit-width only.

### 3.1 Zoom presets
The zoom control exposes exactly these choices:

| Label | Value | Rendering semantics |
|---|---|---|
| Automatic | `auto` | Existing fit/automatic-scale semantics (`fit-width` mode) |
| 75% | `75` | Custom scale = 0.75 |
| 100% | `100` | Custom scale = 1.0 |
| 125% | `125` | Custom scale = 1.25 |
| 150% | `150` | Custom scale = 1.5 |

`Automatic` is **not** treated as another arbitrary percentage — it connects to the existing fit/automatic-scale semantics.

### 3.2 Zoom control ownership
- **Desktop (≥1024px):** `ReaderToolbar` owns the zoom selector + stepper in the Header toolbar band. `PdfViewer` computes `stepZoom` and `scaleFor` but does **not** render a zoom control band of its own. At desktop the Footer owns no zoom host.
- **Mobile (≤1023px):** **no zoom control exists** (FTR-2). `ReaderProgress` does not own a zoom host; `PdfViewer` portals nothing into `.pdf-footer-zoom-host`. **[P2b]** deletes that host, the session-local stepper and the mobile custom-scale code; **[Z2]** adds pinch with render-after-settle. Until then mobile PDF renders at fit-width.
- There is **one canonical zoom control** per viewport. No second zoom state, no duplicate control.

### 3.3 Zoom behavior requirements
Selecting a preset must:
1. Update the PDF rendering scale (not merely the displayed number).
2. Visibly reflect the selected preset in the control.
3. Preserve the current document/page context where the existing architecture allows.
4. Work consistently with the `Text | PDF` presentation.
5. Not create a second independent zoom state.

### 3.4 Zoom state model
- `preferences.pdfZoomMode`: `'fit-width' | 'fit-page' | 'natural' | 'custom'`.
- `preferences.pdfCustomScale`: number (bounded 0.1–6 desktop). **[P2b]** drops the separate mobile bound; the mobile custom-scale path is deleted with the Footer stepper.
- `onZoomSelect('auto')` → sets `pdfZoomMode = 'fit-width'`.
- `onZoomSelect('custom', value)` → sets `pdfZoomMode = 'custom'`, `pdfCustomScale = value / 100`.
- **[P2b]** Mobile has no session-local zoom state. It opens every document at fit-width and stays there until **[Z2]** pinch changes the actual scale.

## 4. `Text | PDF`

### 4.1 Single control
`Text | PDF` is the single PDF presentation control, owned by `PdfModeSwitch` via `primaryActions` in the Header (ARCH-3). It is presentation-only — it does not couple to zoom state. The Header owns no other mode bar (HDR-3).

### 4.2 Unavailable readable text
When readable text is unavailable (`canRead` is false):
- The `Text` button is **disabled** with an understandable reason (not silently doing nothing).
- The control remains visible so the user understands the mode exists but is not available.

### 4.3 Source choice
Per-page text source (`pdf` vs `ocr`) is chosen in the Document surface, not in the mode switch.

## 5. OCR lifecycle

**[P4]** The Footer active status stays visible only during `preparing | running | paused`. Queue, source and run actions move from Document to the OCR More item in P4. The terminal-success shape and announcement remain open.

### 5.1 Lifecycle classes
"OCR active" means the union of `preparing`, `running`, `paused`. All behavior is defined over queue **state**, never over localized status text.

| Class | States | Reader-visible meaning | Run controls | Status surfaces |
|---|---|---|---|---|
| Active / resumable | `preparing`, `running`, `paused` | A run exists and can continue or be resumed | Resume, Pause/Resume, Cancel | Footer progress **and** Document status |
| Terminal success, work remains | `done` with `exhausted: false` | The run finished the window(s) it walked; untouched pages remain | Start enabled **[P4]** | Document status **only** |
| Terminal success, exhausted | `done` with `exhausted: true` | An explicit run walked every window and found no further candidates | Start disabled **[P4]** | Document status **only** |
| Terminal error | `error` | The run failed | Start enabled (retry) | Document status **only** |
| Cancelled / cleared | cancelled, or OCR results cleared | No run; queued work discarded | Start enabled **[P4]** | **None** |

`exhausted` is a **structural** flag on `OcrQueueStatus`, not a message probe. It is the single
source of truth for "no OCR work left" and replaces the removed localized-string comparison.

### 5.2 Preload (initial automatic)
- The Reader **MUST** preload the **first 12 candidate pages** on document open. This local preload does not start a run; only an explicit user action starts OCR, then continuation proceeds through 12-page windows.
- The preload loop iterates pages 1–12, skipping pages that already carry PDF text, and collects up to `OCR_AUTO_BATCH_SIZE` (12) candidates.
- The hard-coded `pending.length >= 6` cap is a **defect** — it must be `pending.length >= OCR_AUTO_BATCH_SIZE`.
- Preload **MUST** remain local-only: no upstream request, no quota reservation, no Worker API call.
- `App.tsx` only triggers preload when a page in the first 12 has empty `plainText` and passes `ocrCandidate`.

### 5.3 Explicit OCR [P4]
- An explicit OCR processes a **12-page window**, starting at the first unprocessed page.
- `startCurrent(page)` OCRs the selected page first, then continues from `page + 1` and never revisits an earlier page.
- `startNextUnprocessed(fromPage)` starts at the reading page and may include nonempty corrupt pages.
- A run starts **only** from an explicit user action (OCR-2). The first-12 preload never starts one.

### 5.4 Automatic continuation
- Within a run, windows **MUST** continue automatically in 12-page steps until the document is exhausted (OCR-2).
- The user never has to click again between batches.
- A page whose OCR text is empty (ink-free or unreadable) is skipped without saving a `PdfOcrRecord` and never fails or retries the run.
- `completed/total` counts the whole run, so a later window does not reset progress.

### 5.5 Terminal success state
- A run that completes **MUST** end in an explicit terminal-success state (`done`) that is observable.
- Success **MUST NOT** be inferred from a localized message.
- `done` alone does **not** mean "nothing left". `exhausted` carries that fact:
  - an **explicit** run walks every 12-page window of the whole document, so finishing it
    structurally exhausts the document → `exhausted: true`;
  - an **initial preload** stops after one bounded 12-page window and must leave later pages
    reachable through an explicit run start → `exhausted: false`;
  - a run that found zero candidates → `exhausted: mode !== 'preload'`.

### 5.6 No work
- "Nothing to OCR" **MUST** be observable and **MUST NOT** be a copy-matched special case.
- A reader with nothing to process **MUST NOT** be shown an active run.
- Observability comes from the `done` + `exhausted: true` state pair, not from its message text.
- The wording of the exhausted terminal state is still open (P4); the rules above hold whatever it says.

### 5.7 Error
- A failed run **MUST** end in an explicit terminal-error state (`error`) distinguishable from success.
- A failed run **MUST** keep previously produced results.
- A failed run **MUST** offer the §6 entry point for retry.

## 6. OCR run start ownership

### 6.1 Canonical entry point
- **[P4]** More carries its own OCR item (§8). "Run OCR" (en) / "OCR" (vi) lives there.
- Until P4 the action lives inside the Document surface, and it stays the single canonical entry point.
- It **MUST NOT** be a per-window "next" advance, **MUST NOT** be an L1/Header action, and **MUST NOT** be duplicated.
- It serves as the start-after-preload, restart-after-cancel, and recover-after-error entry point.
- There is **exactly one canonical user-facing entry point**. No competing Header OCR action. No second OCR toolbar.
- There is **no "OCR next" or "continue" control** (OCR-2). One start action; the run then continues on its own.

### 6.2 Label
- The label describes the actual action: "Run OCR" (en) / "OCR các trang còn lại" (vi).
- The label does **not** freeze an obsolete "next 6 pages" or "next 12 pages" string.
- The label does **not** specify a page count — the action processes all remaining pages in 12-page windows.
- **[P4]** The exact wording of the item and its empty/exhausted presentation is an open P4 item; §6.1 and §6.3 already fix its position and state behavior.

### 6.3 Disabled state
- The start action is **disabled** while a run is active (`preparing`, `running`, `paused`).
- It is **disabled** on terminal success **only when** `done` carries `exhausted: true`.
- It is **enabled** on terminal success with `exhausted: false` (a finished preload window
  always leaves later pages reachable), on terminal error, on cancelled/cleared, and on idle (no run).

## 7. OCR status ownership

### 7.1 Canonical status surface
- The **Document** surface (reached from More) is the canonical OCR status surface.
- The **Footer** shows OCR status **only** while a run is active (`preparing`, `running`, `paused`).
- The Footer OCR surface is a progress indicator, not a permanent control or navigation element.
- No second competing status host remains.

### 7.2 Active status (Footer)
During `preparing`, `running`, `paused`:
- The Footer exposes OCR status through `ReaderProgress` with `role="progressbar"`.
- The status communicates: that OCR is active/resumable, progress where available, and the relevant state.
- `paused` is active: a paused queue is still a run the reader can resume, so its status stays visible.

### 7.3 Terminal states
- Terminal success, terminal error, and cancelled/cleared states **MUST NOT** leave stale "active" status in the Footer.
- The Footer OCR surface **MUST** be absent for idle, terminal success, terminal error, and cancelled/cleared.
- Errors remain observable in the Document surface where the lifecycle requires them, but must not masquerade as active OCR.

### 7.4 Status detection
- Status is detected from queue **state** (`queueStatus.state`), never from localized strings.
- The string-coupled predicate `queueStatus.message === 'Không còn trang cần OCR.'` **MUST** be removed.

## 8. Document and More

### 8.1 Single entry
- The document surface is reached through More → "Document" (en) / "Công cụ tài liệu" (vi). **[P2b]** renames the More item from "Document tools" to "Document"; the dialog may keep a longer heading.
- The surface is named for what it opens (document settings), which is why "Document tools" is retired as the More item name (MORE-2).
- This is the single-entry ownership. No competing PDF/OCR entry point.

### 8.2 OCR actions in Document
- **[P4]** The run start action moves out to its own More item (§6.1). Until then:
- OCR controls are `button`s inside the Document dialog, not `menuitem`s. The former
  `role="menu"` / `role="menuitem"` container was replaced by `role="dialog"` in `3490a22`
  (2026-09-27); tests must select them by button role.
- "Recognize current page" — OCRs the current page only.
- "Run OCR" — the §6 canonical entry point.
- Pause / Resume / Cancel — available while a run is active.
- Clear OCR results — available when `hasAnyOcr` is true.
- Per-page text source choice (PDF vs OCR) — available when both sources exist.

### 8.3 Status presentation
- Document shows the OCR status as a `<p role="status">` block.
- This does **not** create a second competing menu/dialog.
- Non-OCR document functionality (source choice, language, clear) remains intact.

## 9. Test migration

This section records implementation history; Reader target behavior is governed by the contract.

### 9.1 Classification
| Test | Classification | Reason |
|---|---|---|
| `usePdfOcrQueue.test.tsx` — "preload examines only the first twelve pages and recognizes at most six" | **REWRITE** | Pins the 6-page defect; must verify 12-page contract |
| `usePdfOcrQueue.test.tsx` — "never preloads scans after the first twelve text pages" | **KEEP** | Correct behavior, no change needed |
| `usePdfOcrQueue.test.tsx` — "continues automatically through every 12-page window" | **KEEP** | Correct behavior |
| `usePdfOcrQueue.test.tsx` — "finishes a short final batch" | **KEEP** | Correct behavior |
| `ReaderShell.test.tsx` — "OCR next lives only in the document-tools surface" | **KEEP** (P2a commit B) | Asserts the `Document` More entry and the document-tools surface; kept untagged, because the `OCR next` item name retires in P4 |
| `PdfModeSwitch.ocr.test.tsx` — all tests | **KEEP** | Already correct, asserts semantic ownership |
| `e2e/pdf-ocr-queue.spec.ts` | **REWRITE** | Stale "OCR 6 trang" / "OCR 3 trang" labels, dead `.pdf-queue-status` selectors |
| `e2e/pdf-mode-layout.spec.ts` | **DELETED (P2a commit B)** | Was `test.fixme`; drove the obsolete chrome-quiet/reserved-footer model and a stale `/OCR.*6/` label. No replacement: the live coverage lives in `pdf-reader-chrome-a12.spec.ts` and the P2b tests |
| `e2e/pdf-mobile-chrome-space.spec.ts` | **DELETED (P2a commit B)** | Was `test.fixme`; pinned synthetic-chrome space invariants that the real-scroll chrome tests in `mobile-chrome.spec.ts` now cover |
| `e2e/spike-overlay-o.spec.ts` | **DELETED (P2a commit B)** | Feasibility spike for the retired reserved-footer overlay model; superseded by `pdf-reader-chrome-a12.spec.ts` and the P2b tests. `e2e/readerO.ts` is kept; its rename is P7 |
| `e2e/pdf-ocr.spec.ts` | **REWRITE** | Dead `.pdf-reading-options-toggle` selector, dead `.pdf-queue-status` selectors |
| `e2e/pdf-ocr-raster.spec.ts` | **REWRITE** | Dead `.pdf-reading-options-toggle` selector, dead `.pdf-queue-status` selector |
| `e2e/pdf-real-samples.spec.ts` | **REWRITE** | Dead `.pdf-reading-options-toggle` selector, stale "OCR 3 trang" label, dead `.pdf-queue-status` selectors |
| `e2e/pdf-zoom-footer.spec.ts` | **SPLIT (P2a commit B)** — kept with 4 tests, desktop Header zoom ×10 rewritten to `@FTR-2` | Deleted the mobile Footer stepper, the mobile/desktop page-navigation-ownership tests and the zoom-host count test (all assert the `[P2b]`-retired Footer zoom host and its portal). Kept both `Current PDF page` → `Go to location` openers, untagged until P2b, via the new `openGoToLocation` helper |

### 9.2 Required coverage

#### Zoom
- Automatic; 75%; 100%; 125%; 150%.
- Selected value corresponds to actual rendering scale.
- Changing zoom does not create duplicate zoom state.
- Zoom renders once, in the Header toolbar; **[P2b]** no Footer zoom host and no mobile zoom control.

#### OCR preload
- Scan-only/eligible PDF automatically starts with up to 12 candidates.
- 6-page legacy behavior is no longer pinned.
- Blank/non-candidate pages retain existing filtering semantics.

#### OCR continuation
- 12-page windows continue automatically.
- > 12-page document completes through subsequent windows.
- An explicit user action starts the appropriate remaining work.
- The first-12 preload never starts a run.
- User does not need to manually launch every 12-page window.

#### OCR ownership
- Exactly one canonical OCR start entry.
- No competing Header OCR action.
- More exposes the action. **[P4]** it is its own item, not a row inside Document.

#### OCR status
- preparing; running; paused; successful completion; cancellation; error.
- Verify status ownership and disappearance/transition semantically.

#### `Text | PDF`
- Single control.
- No duplicate mode control.
- Unavailable readable text is not a silent no-op.

## 10. Dead code cleanup

- Remove `.pdf-queue-status` CSS rules from `src/styles.reader-base.css`.
- **[P2b]** Remove `.pdf-footer-zoom-host` from `src/styles.mobile-reader.css` together with the Footer zoom host, its portal and the mobile custom-scale path.
- Remove `.pdf-reading-options-toggle` CSS rules (dead selector, no renderer).
- Remove `.pdf-toolbar` references (already deleted from source).

## 11. Source file map

| Concern | Source file |
|---|---|
| OCR queue (preload, continuation, states) | `src/reader/pdf/usePdfOcrQueue.ts` |
| OCR label, status rendering, string-coupling | `src/reader/pdf/PdfModeSwitch.tsx` |
| Zoom callbacks, active OCR progress, Document wiring | `src/app/App.tsx` |
| Desktop zoom selector + stepper | `src/reader/ReaderToolbar.tsx` |
| Footer OCR status | `src/reader/ReaderProgress.tsx` |
| PDF rendering scale | `src/reader/pdf/PdfViewer.tsx` |
| Zoom scale calculations | `src/reader/pdf/navigation.ts` |
