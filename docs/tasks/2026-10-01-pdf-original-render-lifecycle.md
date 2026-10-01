# Original PDF render lifecycle — Planner handoff

Evidence baseline: [`2026-10-01-pdf-reader-render-flicker-investigation.md`](2026-10-01-pdf-reader-render-flicker-investigation.md)
(Investigator Fact Report — treat as verified; do not re-investigate).

## TASK

Stop the Original PDF reader from destroying and rebuilding a page canvas that is still
legitimately mounted, and stop exposing an unpainted canvas across a re-render caused by a render
budget or scale change, without changing the mount window, the pixel budgets, the `pageLease`
semantics, or the dynamic `pdfjs-dist` boundary.

## FINDINGS

- `PdfViewer.tsx:148` mounts `PdfPage` only for `pageNumber === visible || (!ocrBusy && |pageNumber - visible| === 1)`
  and assigns `renderPixels = pageNumber === visible ? MAX_CANVAS_PIXELS : NEIGHBOR_CANVAS_PIXELS`.
  Crossing a dominance boundary therefore either unmounts the outgoing page or changes only its
  `renderPixels`.
- `PdfPage.tsx:110` lists `renderPixels` and `scale` in the render-effect dependency array, so a
  role swap or a zoom step re-runs the whole effect: `canvas.width = 1` in cleanup (`:105`), then an
  unconditional backing-size write in the body (`:54`) — two bitmap resets — followed by
  `await import('pdfjs-dist')` (`:61`) and PDF.js's deferred first fill (`pdf.mjs:22505`,
  `pdf.mjs:17435`). The interval between the reset and that fill is the proven white blank
  (Investigator §1a/H1/H2). `Promise.all()` is rejected (H3); the black-frame mechanism is
  unverified and must not drive implementation (H5).
- `canvasBackingSize(w, h, dpr, budget)` yields an **identical** backing size for both budgets
  whenever `dpr <= 3` is the binding term (e.g. DPR 1 always; DPR 2 for ordinary page sizes).
  In that case the role swap changes nothing about the pixels, yet it currently destroys the
  canvas, nulls `indexRef.current` (`:57`) and re-renders.
- The text layer/index/highlight overlay share that one effect. `indexRef.current = null` (`:57`)
  plus the overlay effect's early return (`:267`) and cleanup `overlay.replaceChildren()` (`:278`)
  is the highlight/selectability transient (H4, §1d).
- The previous frame is never preserved: there is no back buffer anywhere in `src/reader/pdf`.
- Existing tests cannot observe any of this: `PdfPage.test.tsx:9` mocks `pdfjs-dist`,
  `:22` mocks `getContext` as `{}`, and nothing observes `canvas.width/height`.

## SCOPE

`src/reader/pdf/PdfPage.tsx` (render lifecycle only), `src/reader/pdf/PdfPage.test.tsx` (additive
scenarios), `src/reader/pdf/PdfViewer.test.tsx` (mount/instance retention), and one minimal
control-flow note in `docs/reader.md`. `PdfViewer.tsx` needs **no change** — see
IMPLEMENTATION DIRECTION.

## PRESERVE / INVARIANTS

- `docs/reader.md` invariant 5 — bounded mounting (visible + immediate neighbours, ≤3 canvases;
  neighbours suppressed while OCR is busy). Window and gate stay exactly as they are.
- Invariant 6 / `ARCHITECTURE.md` invariant 10 — PDF.js stays behind `await import('pdfjs-dist')`
  in its own chunk.
- Invariant 8 / `renderBudget.ts` — `MAX_CANVAS_PIXELS`, `NEIGHBOR_CANVAS_PIXELS`, `MAX_CANVAS_EDGE`,
  DPR cap and `canvasBackingSize` are unchanged; no live canvas may exceed the computed backing size.
- Invariant 9 — per-render generational text layer: a late completion must never publish a
  `PdfTextIndex` or annotations over a newer generation.
- `pageLease.ts` cancellation semantics (a stale render must not clean a proxy a newer render owns).
- Invariant 7 — no scroll/navigation feedback loop; `usePdfScroll` is untouched.

## OUT OF SCOPE

Reading Mode (`src/reader/pdf-reading/*`), `renderBudget.ts` constants, `usePdfScroll` navigation
semantics, selection/markup adapters, location persistence, the OCR queue, CSS, the rejected
`Promise.all()` change, the unverified black-frame direction (`background` / context `alpha`), any
timestamp/500 ms placeholder cache, and any timer or opacity transition that only hides the flash.

## IMPLEMENTATION DIRECTION

1. **Conditional teardown (primary).** Split the render effect into a canvas effect
   (`[page, active, scale, renderPixels]`) and a text-layer effect
   (`[page, active, scale, documentText, pageOffset, pageEnd]`). Keep live handles
   (`RenderTask`, lease release, text layer) in refs and replace the per-run `disposed` flag with a
   per-effect generation counter. Teardown happens only when the incoming inputs invalidate the
   rendered result; a pass whose computed backing geometry is identical to the committed one must
   neither cancel, nor release, nor clear, nor re-render.
2. **Geometry signature.** Compute `{ ratio, width, height }` via `canvasBackingSize` during the
   render phase into a ref so the previous pass's cleanup can compare old vs incoming inputs.
   The budget influences the result only through the computed backing size; identical size means
   identical pixels, so re-rendering adds nothing and the budget cap is still honoured.
3. **Canvas may be destroyed only on unmount.** Remove `canvas.width = 1` from the shared cleanup;
   do the 1×1 release from a dedicated mount-scoped effect so the memory-release guarantee survives
   without blanking a re-render. Write `canvas.width/height` only when the computed backing size
   actually differs from the current one.
4. **Commit-on-ready for genuine geometry changes.** When the live canvas already holds a committed
   frame for a different geometry, render PDF.js into a lazily created, never-mounted buffer canvas
   at the new backing size and commit atomically (`canvas.width/height = …; ctx.drawImage(buffer, 0, 0)`)
   in one synchronous block after the render settles. When there is no committed frame (first
   render) or the buffer's 2D context is unavailable, use today's direct path. The buffer is
   dropped after the commit; it is bounded by the same `canvasBackingSize` caps and is never part
   of the ≤3 mounted canvases.
5. **Highlight/selection continuity.** Keep the text layer, the index and the overlay out of the
   canvas effect; drop the overlay effect's unconditional cleanup clear so existing marks stay
   until the replacement index publishes and redraws them, instead of disappearing for the whole
   rebuild.
6. **No `PdfViewer.tsx` change.** Widening the gate or re-policying `renderPixels` would violate
   invariant 5/8; the retention is achieved by keeping the existing gate and making `PdfPage` treat
   a still-mounted page as retained.

## CHANGE CLASS / RISK

`SUBSYSTEM_LOGIC`. Highest risks: the transient buffer's peak memory on the largest visible pages;
a skipped pass leaving a stale committed geometry after a failed render (must reset the signature on
failure); losing generational protection when the `disposed` flag becomes a generation counter.
Smallest rollback boundary: `src/reader/pdf/PdfPage.tsx` alone.

## VERIFICATION

Focused: `npx vitest run src/reader/pdf/PdfPage.test.tsx src/reader/pdf/PdfViewer.test.tsx`.
Authoritative: `npm run verify:pdf`. `verify:full` is not required (no shared contract, no bundle,
no CSS change; the dynamic import stays dynamic). Manual desktop scroll/settle/zoom/panel-resize and
a real-device mobile pass; success means the canvas is never observed at a destroyed or unpainted
size across a transition, not merely that the flash is shorter.

## ACCEPTANCE CRITERIA

- A page that stays inside the mounted window keeps one `PdfPage` instance and one canvas element
  across a dominance change; it is not unmounted, not re-rendered, and its canvas bitmap is not
  reset when the computed backing geometry is unchanged.
- `canvas.width/height` are never assigned `1` while the page is mounted and active; the only 1×1
  release happens on unmount.
- Across a scale/zoom change the live canvas keeps its previous frame until the replacement render
  commits, and the commit never exposes a cleared canvas.
- A superseded generation cannot publish an index, an overlay update or link annotations.
- Saved highlights do not disappear during a render-budget-only transition and are never absent
  during a scale rebuild.
- ≤3 mounted page canvases, unchanged `renderBudget.ts` limits, unchanged `pageLease` behaviour,
  unchanged PDF.js dynamic import.
- `npm run verify:pdf` reports PASS.

## DOC IMPACT

Required, one file: `docs/reader.md` (control flow of the render lifecycle changed).

## OPEN QUESTIONS / RISKS

- Peak memory of the transient buffer is the main cost; it is bounded by the new backing size and
  released at commit, with the direct path as the fallback when a 2D context is unavailable.
- The black-frame mechanism remains unverified. Nothing in this change touches `background` or
  `alpha`; do not extend the change to them.
