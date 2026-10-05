# Desktop `Zoom in` shrinks the PDF canvas instead of growing it

**Status:** open · high priority · regression from `40e807d` (DesktopReader Toolbar phase)
**Class:** `SUBSYSTEM_LOGIC` (PDF zoom control)
**Found during:** PDF/OCR Controls remediation, while classifying failures from `4a5e141`.

## Symptom

On desktop, pressing `Zoom in` in the Header **reduces** the rendered page width.

Measured by `e2e/pdf-original-first-render-footer.spec.ts:5` at 1728×900, DPR 2, 4-page fixture:

```
initial  { css: 932,    backing: 1864, height: 2412 }
zoomed   { css: 703.79, ... }        // after one `Zoom in`
```

The test asserts the canvas grows past `initial.css` and fails: 932 → 703.79.

## Root cause

The desktop Header stepper and the viewer own **two different scale ladders**, and the Header's
one ignores the currently effective scale.

`App.tsx:611-615`:

```tsx
const onZoomOut = () => setPreferences(c => ({ ...c, pdfZoomMode: 'custom', pdfCustomScale: Math.max(0.1, c.pdfCustomScale * 0.85) }));
const onZoomIn  = () => setPreferences(c => ({ ...c, pdfZoomMode: 'custom', pdfCustomScale: Math.min(6,  c.pdfCustomScale * 1.15) }));
```

`pdfCustomScale` defaults to **1** (`database.ts:283`), while the default zoom mode is **'natural'**
(`database.ts:282`). The first `Zoom in` therefore sets the *absolute* custom scale to $1 \times 1.15 = 1.15$,
but the page was actually rendering at the natural scale.

Arithmetic confirming the measurement, from `calculatePdfScale` (`navigation.ts:26`) and
`size.width * scale` (`PdfViewer.tsx:147`), with a 612pt-wide page:

| state | mode | scale | css width |
|---|---|---|---|
| initial | `natural` | $\min(932, w-64)/612 = 932/612 \approx 1.5238$ | $612 \times 1.5238 = 932$ |
| after `Zoom in` | `custom` | $1 \times 1.15 = 1.15$ | $612 \times 1.15 = 703.8$ |

The multiplicative `* 1.15` is applied to a **stored absolute** value that is out of sync with the
**effective** scale. Net effect: the first `Zoom in` zooms out by ~24%.

The Footer stepper already does this correctly. `PdfViewer.tsx:81-88` resolves the *current effective*
scale first, then steps it:

```tsx
const current = scaleFor(size);
const next = desktop ? stepDesktopPdfScale(current, fitWidth, direction) : stepPdfScale(current, direction);
```

and `stepDesktopPdfScale` (`navigation.ts:7-13`) snaps the first step up to `fitWidth * 1.25` rather
than multiplying a stale number. The Header bypasses this path entirely.

## Secondary defect on the same control

`App.tsx:657-658` feeds the select:

```tsx
zoomLevel={Math.round(customScale * 100)}          // = 100 initially, regardless of effective scale
zoomMode={zoomMode === 'fit-width' ? 'auto' : 'custom'}
```

While the effective mode is `natural`, the select displays **100%** although the canvas renders at
~152%. The label does not represent the actual rendering scale, which violates
`docs/desktop-reader.md` §3 ("the selected value must represent the actual PDF rendering scale") and
task §3 requirement 1 of this phase.

## Impact

The single most-used zoom control on desktop is inverted on first use, and the adjacent readout lies
about the rendered scale. Preset selection (`Automatic / 75 / 100 / 125 / 150`) works, because
`onZoomSelect` sets an absolute value the viewer honours.

## Agreed fix direction (not yet implemented)

Route the Header stepper through the same effective-scale ladder the Footer uses, instead of
multiplying the stored preference:

- compute the current effective scale in one place (the viewer already exposes it via `scaleFor`,
  and `onDesktopCustomScale`/`desktopCustomScale` are already wired both ways between
  `App.tsx:681` and `PdfViewer.tsx:16,79`)
- have `Zoom in`/`Zoom out` call `stepDesktopPdfScale(current, fitWidth, ±1)` and write the **result**
  back to `pdfCustomScale`, so absolute scale and stepper agree
- remove the `* 1.15` / `* 0.85` multiplicative updates in `App.tsx`
- make `zoomLevel` report the effective scale so the select reflects what is rendered; ensure the
  reported value snaps to an available `<option>` or the select is driven from the effective value

Do **not** introduce a second zoom state or a second viewer — this is a wiring bug in the existing
architecture.

## Required regression test

The existing test at `e2e/pdf-original-first-render-footer.spec.ts:5` is a valid contract and must
keep asserting growth. Add coverage for the two behaviours the fix must not break:

```ts
// pressing Zoom in repeatedly is monotonically non-decreasing
// selecting the 150% preset makes the canvas render at 1.5x page width
// returning to Automatic restores the fit/natural scale
```

## Constraints

- Do not weaken or skip the existing assertion at `pdf-original-first-render-footer.spec.ts:33`.
- Do not reintroduce `.pdf-toolbar` or `.pdf-queue-status`.
- Do not touch the mobile band; mobile Footer zoom is owned by `PdfViewer.stepZoom` and is correct.
- One canonical zoom control per band; desktop is the Header (`mobile-chrome.md` §5/§12).