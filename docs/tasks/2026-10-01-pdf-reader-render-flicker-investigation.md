# Reader render flicker — Investigation (Fact Report)

TASK
Re-evaluate the reported Context Lens reader rendering problem — visible flicker during rendering,
black/blank intermediate frames, delayed text appearance after the page becomes visible — against the
**current** repository state, and re-check the prior `PLANNER_REPORT.md` as a hypothesis set rather
than an established solution.

ROLE / MODE
Investigator. Read-only for product implementation; no production, test, or config file was modified.
No runtime trace was captured, so claims that cannot be settled by reading source are marked
`INFERRED` and paired with the single measurement that would settle them.

SUBSYSTEM
Reader / PDF (`docs/ARCHITECTURE.md` routing table → `docs/reader.md`).
Files read: `src/app/App.tsx`, `src/reader/pdf/PdfViewer.tsx`, `src/reader/pdf/PdfPage.tsx`,
`src/reader/pdf/usePdfScroll.ts`, `src/reader/pdf/renderBudget.ts`, `src/reader/pdf/pageLease.ts`,
`src/reader/pdf/PdfPage.test.tsx`, `src/reader/pdf/stability.test.tsx`,
`src/reader/pdf-reading/PdfReadingView.tsx`, `src/reader/pdf-reading/PdfReadingPage.tsx`,
`src/reader/pdf-reading/PdfOcrReadingPage.tsx`, `src/reader/pdf-reading/PdfReadingBlock.tsx`,
`src/styles.reader-base.css`, `src/styles.desktop-reader.css`, `src/styles.mobile-reader.css`,
`src/reader-layout.css`, `src/styles.css`, `package.json`,
`node_modules/pdfjs-dist/legacy/build/pdf.mjs` (v6.3.289).

EVIDENCE
All evidence is in-repo and re-verified against the current working tree (not carried over from the
prior report). Authoritative references, consolidated:

- Activation/mount policy: `src/reader/pdf/PdfViewer.tsx:148` (slot gate), `:119` (`setVisible` from
  `dominantPage`), `:96` (`geometryKey` includes `bounds`).
- Canvas lifecycle: `src/reader/pdf/PdfPage.tsx:54` (unconditional backing-size write), `:57`
  (index nulled), `:61` (`await import`), `:65` (sync `page.render`), `:69` (`getTextContent` awaited
  concurrently), `:74-75` (index published), `:76` (`await rendered`), `:105` (unmount writes
  `canvas.width = 1`), `:110` (dependency array), `:267`/`:278`/`:279` (overlay effect).
- PDF.js v6.3.289 behaviour: `pdf.mjs:22505` (first fill deferred behind
  `displayReadyCapability`), `:22520` (`render` returns synchronously), `:17435`
  (`background || "#ffffff"` fill), `:17439-17442` + `:17525-17533` (`transparentCanvas`
  create-and-composite path).
- Budgets and leases: `src/reader/pdf/renderBudget.ts:2-3`, `src/reader/pdf/pageLease.ts`.
- Fonts (negative result): `src/styles.css:2,4` — system stacks; no `@font-face` rule and no
  `font-display` descriptor anywhere in the project (verified by project-wide search).
- Test gap: `src/reader/pdf/PdfPage.test.tsx:9` (`vi.mock('pdfjs-dist')`), `:22` (`getContext`
  mocked), `:142` (late-render guard), `:158` (lease settling) — the suite cannot observe
  `canvas.width/height`, so bitmap destruction is invisible to it.
- No git commit introduced or removed the behaviour analysed here. Relevant history for
  `src/reader/pdf/PdfPage.tsx` (`git log --all --oneline --follow`), oldest first:
  `dfa48c8` (add original document viewer foundation) → `9f78f67` (stabilize selection, navigation
  and render budgets) → … → `2ec819c` (latest commit touching the file).

FINDINGS

Headline conclusions (each is expanded with supporting/contradicting evidence in §3):

1. **The page on screen is destroyed and rebuilt, not reused.** The dominant-page slot gate
   (`PdfViewer.tsx:148`) unmounts the outgoing `PdfPage`; cleanup writes `canvas.width = 1`
   (`PdfPage.tsx:105`). Reactivation writes a fresh backing size (`:54`) — itself a bitmap reset —
   and must pass `await import('pdfjs-dist')` (`:61`) before PDF.js performs its first fill, which is
   **deferred** into a callback (`pdf.mjs:22505` → `pdf.mjs:17435`). Confidence **HIGH**; this is the
   proven source of the white/blank interval on scroll, settle, resize and zoom.
2. **The prior report's primary cause does not exist.** `page.render()` (`PdfPage.tsx:65`) is called
   **synchronously** and `page.getTextContent()` is awaited *after* it (`:69`), so canvas paint and
   text-content fetch already run concurrently. There is no waterfall, so no `Promise.all()` change
   can help. Confidence **HIGH** (§3 H3).
3. **"Delayed text" is two different latencies, not one.** Visible glyphs *are* canvas pixels — the
   text layer is `color: transparent` (`styles.reader-base.css:41`), so the visible symptom is 1a.
   Separately, selectability is late because `PdfTextIndex` is published only at `PdfPage.tsx:74-75`.
   Confidence **HIGH** (§1c).
4. **Black is not proven and is not the same state as blank.** No `background` is passed
   (`PdfPage.tsx:65`), so transparent pages take PDF.js's `transparentCanvas` create-and-composite path
   (`pdf.mjs:17439-17442`, `:17525-17533`) at a 20,000,000-px budget (`renderBudget.ts:2`); a texture
   drop of that surface during the pre-composite window can present black. Confidence **MEDIUM**
   (`INFERRED`); requires the §8d measurement before any fix.
5. **Reading Mode cannot produce the canvas-class symptoms.** There is no `<canvas>` in
   `src/reader/pdf-reading/`, and the source-switch claim in the prior report is refuted by the stable
   `key={page.pageNumber}` (`PdfReadingView.tsx:84`). Its real residual is unmemoized whole-document
   reconciliation per tracked frame (`App.tsx:204-205` → `PdfReadingView.tsx:19,81`).
6. **A third, distinct transient exists:** saved highlights disappear for the duration of every
   re-render because the index is nulled at `PdfPage.tsx:57` and the overlay effect early-returns at
   `:267` with cleanup at `:278`. Confidence **HIGH** (§1d).

---

## 1. CURRENT SYMPTOMS

Each symptom is stated with the code fact that makes it possible, and classified
`PROVEN IN CODE` / `INFERRED`.

### 1a. Flicker / blank (white) intermediate frames — `PROVEN IN CODE`

The page that is on screen is destroyed and rebuilt rather than reused:

- The slot gate mounts `PdfPage` only for `pageNumber === visible || (!ocrBusy && |pageNumber - visible| === 1)`
  (`PdfViewer.tsx:148`). Crossing the dominant-page boundary therefore **unmounts** the outgoing page.
- Unmount runs the effect cleanup, which **destroys the bitmap**:
  `canvas.width = 1; canvas.height = 1;` (`PdfPage.tsx:105`). The same cleanup also runs on every
  `scale` change and every `renderPixels` change (dependency array `PdfPage.tsx:110`).
- Reactivation re-runs the effect body, which writes a fresh backing size unconditionally
  (`PdfPage.tsx:53-54`). Writing `width`/`height` on a canvas always resets its bitmap, so this is a
  second, independent clear even when the computed dimensions are identical.
- The first visible pixel cannot be painted immediately: the effect body must `await import('pdfjs-dist')`
  (`PdfPage.tsx:61`) before `page.render(...)` is even called (`PdfPage.tsx:65`), and PDF.js defers its
  first fill into a callback (see §2a step 10). During that window the canvas is an empty (transparent)
  backing store composited over `.pdf-page-slot { background:#fff }` (`styles.reader-base.css:36`)
  → a **white blank**.

Reproduction surface (all reachable in current code): scroll direction reversal / settle while
`visible` flips between adjacent pages; any zoom step; any panel open/close or window resize that
changes `bounds`→`scale`; returning to a page that had stopped being dominant+neighbor.

### 1b. Black intermediate frames — `INFERRED` (mechanism identified, device dependence unresolved)

`PdfPage` never passes a `background` to `page.render()` (`PdfPage.tsx:65`), so `beginDrawing` uses
`background = null` and fills with `#ffffff` (`pdf.mjs:17435`). That fill happens **inside the deferred
callback** (§2a step 10), not synchronously with `page.render()`. When the page's operator list is
transparent, PDF.js additionally redirects all drawing into a separate full-size
`transparentCanvas` and composites it into the visible canvas at completion
(`pdf.mjs:17439-17442`, `pdf.mjs:17525-17533`). That path doubles the backing-store footprint
transiently (budget: 20,000,000 backing px for the visible page — `renderBudget.ts:2`), and a garbage
collection / GPU memory drop of such a surface during the pre-composite window can present as an
opaque black frame.

**Black and blank are not the same state and must not be conflated:** blank is *no effective canvas
content over the white slot*; black is *a canvas drawn but presenting no texture*. The code proves the
blank mechanism and only makes the black mechanism plausible. The discriminating measurement is §8d
and is a prerequisite for any fix in that direction.

### 1c. Delayed text appearance — `PROVEN IN CODE` (two different latencies, usually conflated)

1. **Visible glyphs are the canvas.** The PDF.js text layer is `color: transparent`
   (`styles.reader-base.css:41`) and exists for selection/hit-testing only. So "the text appears late"
   and "the canvas appears late" are the *same* symptom with the *same* cause (1a). There is no
   separate text-layer paint to wait for.
2. **Selectable / indexed text is genuinely later.** `PdfTextIndex` is published only after
   `await page.getTextContent()` (`PdfPage.tsx:69`) and `await textLayer.render()`
   (`PdfPage.tsx:72`), at `PdfPage.tsx:74-75`. Selection, double-click lookup and saved-highlight
   rendering are all gated on `indexRef.current` being non-null, which happens **after** the canvas is
   already painting. A user who selects immediately experiences this as "the text isn't there yet".

### 1d. Highlight-overlay transient — `PROVEN IN CODE` (third, distinct class)

`indexRef.current` is nulled synchronously at `PdfPage.tsx:57` on every effect run, the overlay effect
returns early when `!indexRef.current` (`PdfPage.tsx:267`), and its cleanup calls
`overlay.replaceChildren()` (`PdfPage.tsx:278`) with deps `[highlights, indexVersion]` (`:279`). Saved
highlights therefore **disappear for the whole duration of the re-render** and come back only after the
new index exists. This is neither black nor blank and is not fixed by anything that fixes 1a/1b.

### 1e. Reading Mode — no canvas-class symptom reproduced

Reading Mode renders DOM text only (no `<canvas>` anywhere in `src/reader/pdf-reading/`), so neither 1a's
canvas clear nor 1b's texture drop applies. The prior report's claim that source switching unmounts and
remounts a page component **does not hold** in the current code: both branches of the source ternary
carry `key={page.pageNumber}` (`PdfReadingView.tsx:84`), so the element is replaced in place with
synchronous DOM text and no intermediate blank interval exists. What does exist is a per-frame
re-render volume problem (§3 H7), which is a responsiveness cost, not a reproduced blank/black frame.

---

## 2. VERIFIED RENDERING FLOW

### 2a. Original PDF — actual lifecycle

**Mount phase** (`PdfViewer.tsx`)

1. `ready = Boolean(pdf && Object.keys(sizes).length === pdf.numPages)` (`PdfViewer.tsx:24`). `sizes` is
   produced by a **sequential** loop over all pages (`PdfViewer.tsx:106`);
   `if (!pdf || !ready) return <div class="pdf-state" role="status">Opening PDF…</div>` (`PdfViewer.tsx:136`).
   For the whole duration of that loop the surface shows only "Opening PDF…".
2. `ResizeObserver` on the scroll root → `setBounds` (dedupes identical width+height only)
   (`PdfViewer.tsx:131`).
3. `scaleFor(size) = calculatePdfScale(effectiveZoom, selectedCustomScale, bounds.width, bounds.height, …)`
   (`PdfViewer.tsx:87`) — for fit modes `scale` is a function of `bounds`.
4. `geometryKey = \`${effectiveZoom}:${selectedCustomScale}:${bounds?.width}:${bounds?.height}\``
   (`PdfViewer.tsx:96`) — **includes `bounds`**, so every root resize changes it.
5. `usePdfScroll(rootRef, '.pdf-page-slot', ready && Boolean(bounds), location, navigationToken, cb, geometryKey)`
   (`PdfViewer.tsx:118`).
6. Scroll callback: `setVisible(dominantPage)` **always**, then a dedupe on
   `` `${page}:${Math.round(pageOffset*1000)}:${Math.round(scrollY)}` `` before calling `onLocation`
   (`PdfViewer.tsx:119-127`).

**Per-activation phase** (`PdfPage.tsx:42-110`). Synchronous part of the effect body:

| # | Line | Action |
|---|------|--------|
| 1 | `:49-51` | new `.pdf-text-layer` container; `textHost.replaceChildren(...)` drops the previous text DOM |
| 2 | `:52` | `viewport = page.getViewport({ scale })` |
| 3 | `:53` | `canvasBackingSize(viewport.w, viewport.h, devicePixelRatio, renderPixels)` |
| 4 | `:54` | **`canvas.width = width; canvas.height = height`** — unconditional bitmap reset |
| 5 | `:55-56` | `--total-scale-factor`, `--scale-factor` custom properties |
| 6 | `:57` | `indexRef.current = null` — selection/lookup/highlights dead from here |
| 7 | `:58-59` | CSS size set; `textContainer.replaceChildren()` |

Asynchronous part (IIFE):

| # | Line | Action |
|---|------|--------|
| 8 | `:61` | `await import('pdfjs-dist')` — canvas is empty across this gate |
| 9 | `:63` | `canvas.getContext('2d', { alpha: false })` |
| 10 | `:65` | `page.render({ canvas, canvasContext, viewport, transform })` — returns **synchronously** (`pdf.mjs:22520`), and the first fill is **deferred**: PDF.js waits on `intentState.displayReadyCapability.promise` before calling `initializeGraphics` → `beginDrawing` → `fillStyle = background \|\| "#ffffff"; fillRect(...)` (`pdf.mjs:22505-22518`, `pdf.mjs:17435`) |
| 11 | `:68` | `rendered = renderTask.promise.catch(...)` |
| 12 | `:69` | `await page.getTextContent()` |
| 13 | `:71-72` | `new pdfjs.TextLayer({...})` + `await textLayer.render()` |
| 14 | `:74` | `indexRef.current = new PdfTextIndex(textContainer, documentText, pageOffset, pageEnd)` |
| 15 | `:75` | `setIndexVersion(v => v + 1)` → highlight overlay effect (`:265-279`, deps `[highlights, indexVersion]`) |
| 16 | `:76` | `await rendered` — canvas is final here (PDF.js also paints progressively before this) |
| 17 | `:79-100` | `getAnnotations({intent:'display'})` → link `<a>` elements |

Cleanup (`:102-109`), runs on unmount and on every dependency change (`[page, active, scale, renderPixels, documentText, pageOffset, pageEnd]`, `:110`):

```
disposed = true; indexRef.current = null
renderTask?.cancel(); textLayer?.cancel()
releasePage(renderTask?.promise)      // pageLease.ts: page.cleanup() only after the last lease settles
canvas.width = 1; canvas.height = 1   // ← bitmap destroyed
remove selection if inside this text container
textContainer.remove(); annotationRef.replaceChildren(); overlayRef.replaceChildren()
```

`pageLease.ts`: `acquirePage` increments a `WeakMap` lease; the release closure decrements and calls
`page.cleanup()` at zero, and waits for `settled` first so a stale render never cleans a proxy a newer
render owns. `page.cleanup()` drops PDF.js operator-list/graphics caches, so a revisited page can need
a **full operator-list re-pump** — another cold-render latency source inside the three-canvas window.

### 2b. Reading Mode — actual lifecycle

```
PdfReadingView (key={documentRecord.id}, App.tsx:608)
  pages = useMemo(() => readingPagesForDocument(documentRecord), [documentRecord])   // :19
  selectedOcr(page) = ocrPages.find(…) && (pdfTextSources[page] === 'ocr' || …)      // :20-23
  hasOcr = ocrPages.some(…)                                                          // :84
  usePdfScroll(root, '.pdf-reading-page', ready = true, location, navigationToken, …) // :25
  pages.map(page => ocr ? <PdfOcrReadingPage key={page.pageNumber} …/>
                        : <PdfReadingPage     key={page.pageNumber} …/>)              // :84
```

- All pages are always in the DOM (documented in `docs/reader.md`); no canvas, no async render, no
  bitmap, no render task, no text layer.
- `ready` is hard-coded truthy for Reading Mode, so there is no equivalent of the "Opening PDF…" gate.
- `PdfReadingPage`, `PdfOcrReadingPage` and `PdfReadingBlock` are **not memoized**, and `App` passes
  fresh inline callbacks each render.
- Fonts are system stacks — `--font-ui` / `--font-reading` in `styles.css:2,4`; there is **no
  `@font-face` rule and no `font-display` descriptor anywhere in the project**, so there is no webfont
  FOIT/FOUT path. (The CSS variable named `--font-display` is a font-*family* token, unrelated.)

### 2c. State transitions that restart Original rendering

| Trigger | Mechanism | Result |
|---|---|---|
| Scroll crosses the dominant-page boundary | `setVisible(dominantPage)` (`PdfViewer.tsx:119`) → slot gate `:148` | outgoing page unmounts (bitmap destroyed), incoming page cold-renders |
| Zoom step | `scale` is an effect dep (`PdfPage.tsx:110`) | cleanup clears canvas → full re-render |
| Resize / height change | `ResizeObserver` → `setBounds` (`PdfViewer.tsx:131`) → `scaleFor` (`:87`) and `geometryKey` (`:96`) | every mounted canvas re-renders; `geometryKey` also triggers `navigate()` |
| `geometryKey` change | `useLayoutEffect` in `usePdfScroll.ts:87-98` → `navigate()` writes `root.scrollTop` | programmatic scroll → `track()` → possibly another `setVisible` |
| OCR start/progress/stop | `ocrBusy` in the gate (`PdfViewer.tsx:148`) | both neighbour canvases unmount |
| `documentText`/`pageOffset`/`pageEnd` identity change | effect deps (`PdfPage.tsx:110`) | full re-render |

Additional verified restart paths not captured by the table:

- **`PdfPage` is not memoized.** `PdfViewer` re-renders on `visible`, `bounds`, zoom and OCR changes
  (`PdfViewer.tsx:128-133` `ResizeObserver` → `setBounds`; `:119` `setVisible`); each re-render
  constructs fresh `onHighlight`/`onErase`/`onLookup`/`onAddNote`/`onNavigate` closures and fresh
  `Array.prototype.filter` results for `highlights` (`:148`). The render effect's dependency array
  (`PdfPage.tsx:110`) contains only stable primitives (`page`, `active`, `scale`, `renderPixels`,
  `documentText`, `pageOffset`, `pageEnd`), so the effect itself does **not** restart from these
  closures — but `PdfPage` still reconciles, and the overlay effect (`:279` deps
  `[highlights, indexVersion]`) *does* re-run on every new `highlights` array identity. This is a
  per-frame render-volume cost, not a canvas restart.
- **`canvasBackingSize` receives `renderPixels`** (`PdfPage.tsx:53`), so the dominant↔neighbour
  transition changes the backing dimensions as well as the budget. Every such transition is therefore
  both an unmount/remount (if outside the two-page window) and a genuine size change.

---

## 3. ROOT-CAUSE ANALYSIS

### H1 — Activation destroys and rebuilds page content instead of reusing it. Confidence: **HIGH**
- **Supporting:** slot gate `PdfViewer.tsx:148`; cleanup destroys the bitmap `PdfPage.tsx:105`; the
  re-render is gated behind `await import('pdfjs-dist')` (`:61`) and PDF.js's deferred first fill
  (`pdf.mjs:22505`); `pageLease` fully `cleanup()`s the proxy at zero leases (`pageLease.ts`).
- **Contradicting:** none found. Entirely code-derived.
- **Explains:** symptom 1a; the visible part of 1c-1; most repeated-scroll latency. Does not by itself
  explain black specifically, and does not touch Reading Mode.

### H2 — The canvas is cleared and repainted with no buffer and no pre-fill. Confidence: **HIGH**
- **Supporting:** `canvas.width/height` written unconditionally (`PdfPage.tsx:54`) — a bitmap reset
  even when the dimensions are unchanged; the first fill is not fired until
  `displayReadyCapability` resolves (`pdf.mjs:22505`); no offscreen/back-buffer exists anywhere in
  `src/reader/pdf`.
- **Contradicting:** PDF.js *does* fill white synchronously inside `beginDrawing` (`pdf.mjs:17435`) —
  but only once the deferred callback runs, so it does not cover the `await import` gap.
- **Explains:** 1a and 1c-1. Not sufficient for 1b.

### H3 — The prior report's "sequential rendering dependency" does not exist. Confidence: **HIGH** (rejects the prior primary cause)
- **Supporting:** `page.render(...)` (`PdfPage.tsx:65`) is called **synchronously** and returns before
  the code reaches `await page.getTextContent()` (`:69`). Canvas paint and text-content fetch are
  therefore **concurrent**, not serialized. `await rendered` (`:76`) orders only the annotation step
  after canvas completion; it delays nothing visual.
- **Contradicting:** none.
- **Explains:** nothing new. Removes the prior report's stated primary cause.

### H4 — Index latency is real but is not visible-glyph latency. Confidence: **HIGH**
- **Supporting:** index published at `:74-75`, after `getTextContent` + `TextLayer.render`; spans are
  `color: transparent` (`styles.reader-base.css:41`).
- **Contradicting:** none.
- **Explains:** the delayed-selection half of 1c only.

### H5 — Transparent-page path + oversized backing store produces black frames on GPU-limited devices. Confidence: **MEDIUM** (`INFERRED`)
- **Supporting:** no `background` passed (`PdfPage.tsx:65`) → `background = null`; transparent pages take
  the `transparentCanvas` create + composite path (`pdf.mjs:17439-17442`, `pdf.mjs:17525-17533`);
  `transparency` comes from the operator list via `displayReadyCapability` (`pdf.mjs:22505`); the
  visible-page budget is 20,000,000 backing pixels (`renderBudget.ts:2`), e.g. 1224×1584 CSS at DPR 3
  → 3672×4752 ≈ 17.4 M px.
- **Contradicting:** most pages are non-transparent and take the direct white-fill path; the behaviour
  is device- and page-dependent, so it cannot be asserted from source alone.
- **Explains:** 1b only.

### H6 — `bounds` churn restarts rendering during layout settling. Confidence: **MEDIUM**
- **Supporting:** `bounds` feeds both `scaleFor` (`PdfViewer.tsx:87`) and `geometryKey` (`:96`);
  a `geometryKey` change triggers `navigate()` writing `scrollTop` (`usePdfScroll.ts:89-97`), whose
  scroll event re-enters `track()`; `setBounds` only dedupes exact width+height (`PdfViewer.tsx:131`).
- **Contradicting:** `bounds` requires `width > 0 && height > 0`; chrome is height-stable in normal
  reading, so the churn needs a real layout change to start.
- **Explains:** flicker during resize, panel open/close, orientation change, and possibly the first
  frames after mount.

### H7 — Reading Mode re-renders the whole document on every tracked scroll frame. Confidence: **LOW** for flicker
- **Supporting:** `trackPdfLocation` calls `setCurrentLocation` on every tracked frame
  (`App.tsx:204-205`); `PdfReadingView`/`PdfReadingPage`/`PdfReadingBlock` are unmemoized and receive
  new inline callbacks; `hasOcr = ocrPages.some(...)` and `ocrPages.find(...)` per page are
  O(pages × ocrPages).
- **Contradicting:** Preact reconciles in memory with no placeholder DOM, so no intermediate paint is
  expected; the `pages` memo is keyed on `documentRecord` (`PdfReadingView.tsx:19`), which the
  high-frequency path does not replace.
- **Explains:** possible jank on very large documents. Not the reported blink.

### H8 — Reading Mode source-switch unmount causes a blank state. Confidence: **REJECTED**
- **Supporting:** none found in current code.
- **Contradicting:** both branches carry `key={page.pageNumber}` (`PdfReadingView.tsx:84`), so the page
  subtree is replaced in place; the replacement is synchronous DOM text with no async gate and no
  intermediate blank. Only an actual layout shift is possible (an OCR warning line above the page
  changing subsequent offsets), which is a few-pixel shift, not a blank/black frame.

### H9 — Highlight overlay is stale-positioned across a canvas re-render. Confidence: **LOW**
- **Supporting:** overlay effect deps are `[highlights, indexVersion]` (`PdfPage.tsx:279`); a `scale`
  change re-runs the render effect but `indexVersion` only bumps after the new `PdfTextIndex` exists,
  so old-coordinate marks can briefly overlay a fresh canvas.
- **Explains:** highlight jitter/misalignment during zoom, not the primary symptoms.

---

## 4. TIMING ANALYSIS

Sequence for the dominant page across a boundary flip or zoom change (Original PDF):

```
t0   setVisible(next) / scale change         → App render; PdfPage subtree replaced
t0   effect body: text DOM replaced (:49-51); canvas backing reset (:54)   ← CAVITY BEGINS
t0   indexRef.current = null (:57)
t0+  await import('pdfjs-dist') (:61)        ← CAVITY (module cached: microtask; cold: longer)
t1   page.render(...) called, sync return (:65)
t1'  getTextContent() dispatched (:69)       ← runs CONCURRENTLY with the pending paint
t2   PDF.js displayReadyCapability resolves → beginDrawing → fillRect (#fff)
                                              ← EARLIEST possible visible pixel
t3   TextLayer.render() → PdfTextIndex → setIndexVersion (:72-75)
t4   await rendered (:76)                    → canvas final
t5   getAnnotations + link DOM (:79-100)
t0'  cleanup on the outgoing page: canvas.width = 1 (:105) — if that page is unmounting
```

Explicit answers:

- **Are canvas rendering and text-layer rendering sequential?** **No.** `page.render()` is invoked
  synchronously *before* `await page.getTextContent()` (`PdfPage.tsx:65` then `:69`), so the two run
  concurrently. Only the annotation step is ordered after the canvas. The prior report's premise is
  false at the source level.
- **Is the canvas cleared before a replacement frame is ready?** **Yes, provably — twice.** (i) The
  effect body writes `canvas.width/height` at `:54` before anything is painted; (ii) unmount sets
  `canvas.width = 1` at `:105`. The earliest possible replacement fill is the deferred `beginDrawing`
  at `t2`. There is no back buffer anywhere.
- **Does page activation cause unnecessary render restarts?** **Yes.** Activation is driven by
  `dominantPage`, so ordinary scrolling across a boundary, scroll settle, and every change that alters
  `bounds`/`scale` destroys and rebuilds the page instead of reusing it. Zoom additionally chains into
  `usePdfScroll`'s `geometryKey` → `navigate()` → `scrollTop` write → another `track()`.
- **Is text appearance delayed independently of canvas rendering?** **No for visible glyphs** — glyphs
  are canvas pixels, because the text layer is `color: transparent`. **Yes for selectable/indexed
  text** — the index is published at `:74-75`, after the canvas has typically painted.

---

## 5. CROSS-MODE ANALYSIS

**Not one shared root cause.** The two modes have different rendering mechanics.

| Aspect | Original PDF | Reading Mode |
|---|---|---|
| Failure mechanics | asynchronous canvas acquisition + bitmap destruction on unmount/scale | whole-document reconciliation per tracked frame |
| Can produce blank/black paint | yes (canvas lifecycle, §3 H1/H2/H5) | no code path (synchronous DOM text) |
| Delayed visible glyphs | yes (canvas gated by `await import` + deferred fill) | no (text painted in the initial render) |
| Source switch | n/a | same element key, synchronous replacement → no blank |
| Highlight overlay transient | yes (index nulled, overlay cleared) | not applicable (no PDF.js text layer) |

**Shared element — a lifecycle risk pattern, not a rendering cause:** the scroll tracker writes into
surface-level state on every tracked frame (`setVisible` in Original, `setCurrentLocation` in both).
In Original this state directly controls whether a canvas exists, so it converts ordinary scrolling
into mount/unmount cycles. In Reading Mode it only causes redundant reconciliation. Conclusion:
**separate causes with one shared risk pattern.** Nothing in Reading Mode was found to cause
canvas-level flicker, and nothing in the canvas pipeline affects Reading Mode's DOM text, so the two
must keep being handled separately.

---

## 6. SOLUTION OPTIONS

Directions only. Each is evidence-backed and states what must not change. The implementation contract
belongs to the Planner.

### Option A — Keep the rendered page alive across reactivation
- **Problem addressed:** H1/H2 (symptom 1a, 1c-1) — the dominant-page gate destroys a page that was
  rendered moments earlier.
- **Why from evidence:** the bitmap is destroyed at `PdfPage.tsx:105` while the immediately previous
  scroll position still shows that page; the geometry needed to avoid the rebuild (`sizes`, `scale`,
  `visible`) already exists.
- **Likely files:** `src/reader/pdf/PdfViewer.tsx` (slot gate `:148`, `renderPixels` assignment,
  `visible` update policy), `src/reader/pdf/PdfPage.tsx` (cleanup ordering `:102-109`).
- **Regression risks:** exceeding the three-canvas budget (invariant 8); memory/GPU pressure on mobile;
  showing stale content as current; text-index / page-lease lifetime bugs; more `page.cleanup()`
  re-pumps.
- **What must NOT change:** the three-canvas bound and pixel budgets; `pageLease` cancellation
  semantics; the per-render generational text layer (invariant 9); OCR neighbour suppression.

### Option B — Ensure the first fill lands before the canvas is presented
- **Problem addressed:** H2 — the blank gap between bitmap allocation (`:54`) and the first fill (`t2`).
- **Why from evidence:** the gap is real, and the earliest fill is deferred by PDF.js and further
  delayed by `await import('pdfjs-dist')` (`:61`).
- **Likely files:** `src/reader/pdf/PdfPage.tsx` (render-effect ordering / pre-fill).
- **Regression risks:** a second surface competing with the existing budget; a visible artifact if the
  pre-fill and the final frame disagree; bundling pressure if PDF.js is pulled in earlier.
- **What must NOT change:** the dynamic `import()` lazy-chunk rule (invariant 6); the canvas pixel
  budget.

### Option C — Stop tearing down content that is still valid
- **Problem addressed:** H1/H6 (1a, 1c-1) — cleanup runs for changes that do not affect what is on
  screen.
- **Why from evidence:** the dep array (`:110`) includes values that change for unrelated reasons, and
  `canvas.width/height` is written at `:54` without comparing to the current backing size.
- **Likely files:** `src/reader/pdf/PdfPage.tsx`, `src/reader/pdf/PdfViewer.tsx` (`bounds` → `scale`
  stability).
- **Regression risks:** showing a stale scale after zoom; canvas and text layer desynchronizing; an
  index that outlives its DOM generation; masking a real relayout.
- **What must NOT change:** invariant 9 generational text-layer rule; invariants 1-3 (single document
  model, page model, canonical offsets); `pageLease` cancellation rule.

### Option D — Address the black-frame path (only after measurement)
- **Problem addressed:** H5 — black frames specifically.
- **Why from evidence:** no `background` is passed, so transparent pages take the
  `transparentCanvas` create-and-composite path (`pdf.mjs:17439-17442`, `pdf.mjs:17525-17533`).
- **Likely files:** `src/reader/pdf/PdfPage.tsx` only.
- **Regression risks:** changing page colour semantics; acting on an unverified device-specific cause.
- **Gate:** must not be implemented until §8d confirms the black mechanism.
- **What must NOT change:** the `{ alpha: false }` context creation, unless the measurement justifies it.

### Option E — Leave Reading Mode rendering alone
- **Problem addressed:** nothing can be fixed here for the reported symptoms; H7 is jank-only and H8
  is refuted.
- **Why from evidence:** no blank/black path exists in Reading Mode, and its source-switch key is
  stable.
- **What must NOT change:** the `useMemo` key at `PdfReadingView.tsx:19` (`documentRecord`) and the
  `key={page.pageNumber}` scheme at `:84`. In particular, do **not** re-key the `pages` memo on scroll
  position or `location` — that would rebuild the page model on every tracked frame.

---

## 7. RECOMMENDED IMPLEMENTATION BOUNDARY

Smallest safe scope for the next Implementer task:

- **In scope:** `src/reader/pdf/PdfViewer.tsx` and `src/reader/pdf/PdfPage.tsx` only — the activation /
  mount policy and the render-effect setup and cleanup ordering. Options A and C are the
  evidence-backed candidates; Option B only if the §8d measurement shows the blank window persists
  after A/C.
- **Out of scope:** Reading Mode rendering (`src/reader/pdf-reading/*`); `renderBudget.ts` limits;
  `usePdfScroll` navigation semantics; selection/markup adapters; location persistence; the OCR queue;
  CSS unless a measured compositing problem requires it (a `check:css`-class change).
- **Blocked pending measurement:** Option D must not be implemented until the black-vs-blank
  discrimination in §8d is performed on the target device.
- **Explicitly excluded by the task brief and by evidence:** the `Promise.all()` change (rejected, §9)
  and font preloading / `font-display` (no webfonts exist, §2b).
- **Do not change:** invariant 5 (bounded mounting), invariant 6 (dynamic import), invariant 8 (pixel
  budget, page lease), invariant 9 (per-render generational text layer).

---

## 8. VERIFICATION PLAN

### 8a. Focused automated tests that should exist

Current coverage (`PdfPage.test.tsx`) verifies selection, the late-render guard (`:142`) and page-lease
settling (`:158`), but **nothing asserts the canvas's visual state over time**. The suite mocks
`pdfjs-dist` and returns an already-resolved render task, and never observes `canvas.width/height`, so
bitmap destruction is invisible to it. Tests to add:

1. **Backing bitmap is not destroyed when nothing on screen changed** — spy on the `width`/`height`
   accessors of `HTMLCanvasElement.prototype`; assert no `1` assignment while the page stays active with
   an unchanged `scale` and unchanged `renderPixels`.
2. **No double render across an A→B→A activation cycle** — count `page.render` calls over a simulated
   `visible` flip and back; assert page A is not re-rendered from scratch on return.
3. **A superseded render cannot publish an index or annotations** — extend the existing
   `state.layers[1].finish()` pattern (`PdfPage.test.tsx:142-155`) to a scale change; assert
   `indexVersion`/index identity never regresses to an older generation (invariant 9).
4. **Zoom retains the previous frame until the replacement is ready** — mock `render` with a
   controllable promise; assert the canvas still holds non-1×1 content at the moment `scale` changes.

### 8b. Existing verification commands

Change class `SUBSYSTEM_LOGIC` (`docs/verification-map.md`):

- `npm run verify:pdf` — authoritative subsystem command (typecheck + `src/reader/pdf`
  + `src/reader/pdf-reading` + `src/documents/pdf`).
- `npm run check:css` — only if a stylesheet change is included (`PRESENTATION_ONLY`).
- `npm run verify:contracts` — only if an invariant/contract file is touched.
- `verify:full` is escalation-only, not the starting point.

### 8c. Manual desktop / mobile checks

- Desktop: slow scroll across a boundary then settle; fast jump to a distant page; zoom step while
  reading; open/close a side panel; window resize.
- Mobile on a **real device** (not emulation): the same scroll/jump/zoom matrix at DPR ≥ 2, plus
  orientation change and an OCR run in progress (neighbour suppression).
- Record separately: white flash, black flash, partially painted page, late selectability, and
  highlight visibility continuity while a page re-renders.

### 8d. Timing measurement required before Option D (no production instrumentation)

Smallest targeted measurement — one Playwright trace, consistent with `npm run test:browser`:

1. Load a large PDF, scroll one page down and back to force an activation flip.
2. In the DevTools Performance panel, determine whether the black interval is a **compositor** effect
   (canvas layer update/drop, GPU memory) or a **renderer** effect (empty canvas over the white slot).
3. Record PDF.js page-request/render timings and the `await import('pdfjs-dist')` gap.
4. Repeat at DPR 2 and DPR 3 to separate texture-memory effects from paint-timing effects.

A second short trace on a Reading Mode source switch closes H8 definitively (expected: no blank
interval).

---

## 9. REPORT CORRECTION — `PLANNER_REPORT.md`

Section numbers below refer to the prior report's own headings (`PLANNER_REPORT.md`).

**RETAIN**
- §1-2 architecture and lifecycle description as a base map (incomplete, see REVISE).
- §4 "Original vs Reading: different pipelines, No shared cause" — confirmed by this investigation.
- §4 "Desktop vs Mobile share the same underlying causes within each mode" — confirmed.
- §6.2 "Smart canvas clearing avoidance" — correct direction; narrowed below.
- §7 alternatives table reasoning for rejecting *increasing the virtualization buffer* and *CSS opacity
  transitions as a fix* — both remain correct.
- §9 regression-risk checklist, §10 verification strategy, §11 Non-Goals — reusable as written.

**REVISE**
- §3 Primary cause ("sequential rendering dependency… visual rendering must complete before text
  rendering can finish", §6.1 "reduces total wait time to max(duration) rather than sum(duration)") →
  there is **no waterfall to remove**. `page.render()` returns synchronously (`PdfPage.tsx:65`) and
  `page.getTextContent()` is awaited *after* it (`:69`), so the two already run concurrently; the only
  ordering is annotations after canvas (`:76`). What survives is narrower: the text *index* is published
  after the canvas (`:74-75`), so selection/lookup is late — visible glyphs are not.
- §3 Primary sub-claim ("user sees partially rendered visual content without text, then text appears
  later") → the text layer is `color: transparent` (`styles.reader-base.css:41`); visible words are
  canvas pixels. What is late is selectability, not the rendering of the words.
- §3 "Canvas clearing on size reset *contributes* to blank frames" → promote from *contributes* to
  **primary** contributor, and add the second, independent clear that §3 omits: unmount sets
  `canvas.width = 1` (`PdfPage.tsx:105`), not just the effect-body reset at `:54`.
- §3 "Particularly noticeable when toggling active state rapidly" → `active` is passed as a literal
  boolean attribute (`PdfViewer.tsx:148`), so it is always `true`; the real toggle is the conditional
  mount itself. Restate in terms of mount/unmount, not prop toggling.
- §3 Reading Mode cause ("component unmount/mount during source switching… DOM removal and recreation…
  layout thrashing and blank states") → reduce to a layout-shift observation; the page key is stable
  (`PdfReadingView.tsx:84`) and the replacement is synchronous DOM text with no async gate. Add the
  concrete residual in its place: unmemoized whole-document reconciliation on every tracked scroll
  frame (`App.tsx:204-205` → `PdfReadingView.tsx:19,81`).
- §6.3 "placeholder strategy for pages recently deactivated (<500 ms) with a timestamp-based cache" →
  keep as an *option*, but the mechanism should be a retained frame inside the existing budgeted
  neighbour window rather than a new timestamp cache; a 500 ms heuristic is not the constraint — the
  three-canvas budget is.
- §4 desktop/mobile row ("Same rendering pipeline / Yes (implementation identical)") → correct at the
  pipeline level, but the mobile-only `.reader-viewport { transition: margin 200ms ease }`
  (`styles.reader-base.css:116`, disabled on desktop by `styles.desktop-reader.css:45`) and the
  `100dvh`-based reserved heights mean mobile has an additional `bounds`-churn source desktop does not.
- §10 Device matrix should explicitly require a real mobile device, not emulation, for the black-frame
  case.

**REJECT**
- §6.1 "Change effect to await `Promise.all([visualRenderPromise, textRenderPromise])`" — there is no
  visible serialization to remove, and the two promises already overlap. It cannot affect the reported
  symptoms.
- §3 "Reading Mode component unmount/mount during source switching causes a blank state" — refuted by
  the stable key at `PdfReadingView.tsx:84`.
- §6.2 "Consider font loading optimization / preload fonts / `font-display: optional`" — no
  `@font-face` rule and no `font-display` descriptor exists anywhere in the project; the reader uses
  system font stacks (`styles.css:2,4`). There is no webfont path to optimize.
- §7 "Double-buffering canvases — overkill for observed issue magnitude" — the dismissal rests on the
  same unverified magnitude assessment as §3, so it is rejected as a *justification* while the option
  itself stays open (this report's Option A/B are milder forms of it).
- §11 Implementer Task Spec as written — built on the unverified primary cause, and its two mandated
  changes are partial and mis-targeted. Only its Non-Goals and Success Criteria framing are reusable.

---

## PRESERVE / INVARIANTS AT RISK

- **5** — `PdfPage` mounting stays bounded (visible + immediate previous/next, ≤3; neighbours paused
  during OCR). Options A and C both press on this.
- **6** — heavy PDF/OCR libraries stay behind dynamic `import()` and their own chunks. An eager
  import to close the blank gap would violate it.
- **8** — `renderBudget.ts` caps (20 M visible / 2 M neighbour / 8192 edge / DPR ≤3); at most three
  mounted canvases; `pageLease` cancellation must stop a stale render from cleaning a page a newer
  render owns.
- **9** — the text layer is per-render and generational; a late completion must not publish a new
  `PdfTextIndex` or annotations over a newer one. Reordering in Options B/C must not break the
  `disposed` guards (`PdfPage.tsx:62, 70, 73, 77` plus the annotation guard
  `if (disposed || !annotationRef.current) return;`).
- **1-3** — one document model, `structuredPages.ts` as the single page-model source, canonical
  `pageOffsets`.
- **7** — no scroll-observer / navigation feedback loop; jumps only via `pdfNavigationToken`.
  Re-checking `geometryKey` handling must not reintroduce a loop.

## CROSS-SUBSYSTEM IMPACT

Confined to `src/reader/pdf/*` plus the shared scroll controller it already uses. No impact on lookup,
storage, import, or OCR-queue contracts. Reading Mode is affected only through the shell-level
re-render stream and should be left unchanged.

## CHANGE CLASS HINT

`SUBSYSTEM_LOGIC` — the change is confined to the PDF reader render lifecycle; no shared contract,
persistence shape, or public API change.

## VERIFICATION HINT

`npm run verify:pdf` is authoritative; add the canvas-lifecycle unit tests from §8a because the existing
PDF tests cannot observe bitmap destruction. Escalate to `verify:full` only if a shared contract is
touched. Perform the §8d black/blank discrimination **before** implementing the black-frame direction.
Follow the Terminal Loop Guard.

## OPEN QUESTIONS / RISKS

1. Black versus blank is unresolved from source alone and blocks Option D (§8d).
2. Whether `setVisible` reliably triggers a re-render on every boundary crossing was not reproduced at
   runtime; confirm it in the same trace as §8d.
3. Any keep-alive approach interacts with the three-canvas budget; changing that budget or the mount
   window would be a separate, contract-affecting decision for the Planner.
4. The mobile neighbour budget of 2,000,000 px is deliberate; a fix must not simply raise DPR or the
   budget (cost guardrails in `COST & QUOTA GUARDRAILS.md`).
5. Whether the black frame reproduces at all on the target device is unknown; it may be
   environment-specific and not worth a code change.

---

## IMPLEMENTER-READY TASK SPECIFICATION

**Verified problem**

In Original PDF mode, the page on screen is destroyed and rebuilt instead of being retained. The
dominant-page mount gate (`PdfViewer.tsx:148`) unmounts the outgoing `PdfPage`; its cleanup destroys the
canvas bitmap (`PdfPage.tsx:105`); reactivation writes a new backing size (`PdfPage.tsx:54`, itself a
bitmap reset) and must `await import('pdfjs-dist')` (`:61`) before PDF.js performs its first — deferred —
fill (`pdf.mjs:22505`, `pdf.mjs:17435`). The result is a visible white/blank interval and a full
re-render during ordinary scrolling, scroll settle, panel/resize churn, and zoom. Selectable/indexed
text becomes available only after `getTextContent()` + `TextLayer.render()` (`PdfPage.tsx:69-75`),
independently of the canvas; visible glyphs come from the canvas because the text layer is
`color: transparent`. Saved highlights disappear for the duration of each re-render because the index is
nulled at `:57` and the overlay is cleared at `:278`. Reading Mode has a separate, minor reconciliation
cost and no proven blank/black path.

**Scope**

`src/reader/pdf/PdfViewer.tsx` and `src/reader/pdf/PdfPage.tsx` only.

**Constraints**

- Preserve invariants 5, 6, 8, 9 and 1-3 of `docs/reader.md`; keep at most three mounted canvases and
  the existing pixel budgets.
- Do not modify `src/reader/pdf-reading/*`, `renderBudget.ts` limits, `usePdfScroll` navigation
  semantics, selection/markup adapters, location persistence, or the OCR queue.
- Do not call `page.render()` before `await import('pdfjs-dist')` resolves, and do not move PDF.js into
  the initial bundle.
- Do not implement the black-frame direction (page `background`, context alpha) until the §8d
  measurement confirms the mechanism.
- Do not re-key `PdfReadingView`'s page-model `useMemo` to scroll position or `location`.
- Do not add timers or CSS that hides flicker; the fix must change when content is destroyed, not mask it.
- No production instrumentation as a substitute for the tests in §8a.

**Acceptance criteria**

- Scrolling across a page boundary, settling, and returning does not destroy and rebuild a page that is
  still within the mounted window; no blank canvas interval is observable.
- `canvas.width`/`height` are not assigned `1` while the page remains active with an unchanged `scale`
  and unchanged backing size.
- Zoom keeps the previous rendered frame until the replacement is ready (no white interval), and the
  text index never describes a removed text-layer generation.
- Saved highlights do not disappear and reappear on every re-render unless the page content genuinely
  changes.
- No regression in selection, double-click/click word lookup, highlight apply/erase, saved-highlight
  alignment, or page-lease cleanup; at most three canvases stay mounted; memory stays inside
  `renderBudget.ts`.
- New canvas-lifecycle unit tests in `src/reader/pdf/PdfPage.test.tsx` (or a sibling test file) pass and
  `npm run verify:pdf` reports PASS.
- Reading Mode files remain unchanged.
