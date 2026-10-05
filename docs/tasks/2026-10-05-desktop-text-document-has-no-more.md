# Desktop text/EPUB document has no More trigger at ≥1024px

**Status:** open · high priority · regression from `40e807d` (DesktopReader Toolbar phase)
**Class:** `SUBSYSTEM_LOGIC` (Reader chrome ownership)
**Found during:** PDF/OCR Controls remediation — the mobile More trigger / footer zoom gate restore
(`1e628bd`) and the More layer CSS scope fix (`f68b3e6`).

## Symptom

At ≥1024px, opening a **text or EPUB document** renders no More disclosure anywhere:

- `.reader-header` → no `Reader menu` button
- `.reader-progress` (Footer) → no `Reader menu` button (correct — Footer More is mobile-only per §8.1)
- the §9.3 inventory (Contents, Context, Notes, Markup, Text, Languages, Document, Click lookup) is
  unreachable for non-PDF documents

Confirmed empirically: a probe waiting for `getByRole('button', { name: 'Reader menu' })` on a text
reader at 1280×900 timed out. PDF at the same width has exactly one trigger, in the Header.

## Root cause

[ReaderToolbar.tsx](../../src/reader/ReaderToolbar.tsx) computes:

```tsx
const showDesktopToolbar = desktop && (page !== undefined && totalPages !== undefined);
```

`page` / `totalPages` are PDF-only props supplied by `App.tsx`. A text or EPUB document passes
neither, so `showDesktopToolbar` is `false`, and the whole desktop toolbar — page navigation, zoom
stepper, document tools, markup tools **and** `ReaderMore` — disappears.

This is not intended "by design" behaviour: `docs/reader-behavior-contract.md` §9.3 states that More
owns the entire action inventory, and §9.2 states there is exactly one More disclosure per band. A
document type is not a condition for owning the inventory.

## Impact

Regression of the same family as the mobile defect fixed in `f68b3e6` (portal/scope), but
independent of it: it is a plain render-gating mistake, not a CSS scope problem. Text and EPUB
users on desktop lose the entire action surface.

## Agreed fix direction (not yet implemented)

Lift `ReaderMore` out of the `showDesktopToolbar` condition so it renders whenever `desktop` is
true, and keep only page navigation, the zoom stepper, document tools and markup tools inside the
PDF-only block. Concretely:

- render `<ReaderMore items={moreItems ?? []} />` under a new condition that depends on `desktop`
  only, positioned at the end of `.reader-header-actions`
- keep the existing `showDesktopToolbar && (<> … </>)` block for the PDF-specific groups
- confirm `App.tsx` always supplies `moreItems` (it passes `readerMoreItems` at ~line 650); if it can
  be empty for text documents, supply a text-appropriate subset rather than an empty menu

## Required regression test

A text document at 1280px has exactly one `Reader menu` trigger, in the Header:

```ts
await openTextReader(page, 1280, 900);
await expect(page.locator('.reader-header').getByRole('button', { name: 'Reader menu' })).toHaveCount(1);
await expect(page.locator('.reader-progress').getByRole('button', { name: 'Reader menu' })).toHaveCount(0);
await openMore(page);
await expect(page.getByRole('menu', { name: 'Reader actions' })).toBeVisible();
```

Add it to [e2e/mobile-chrome.spec.ts](../../e2e/mobile-chrome.spec.ts) next to
`exactly one Reader menu trigger per band: Footer at 390px, Header at 1280px`, and assert the
text-appropriate inventory rather than the PDF inventory.

## Constraints

- Do not touch the mobile band; mobile More ownership is correct and covered by `e668d08`.
- Do not re-scope or re-style `.reader-more-layer`; `f68b3e6` settled that convention.
- Do not change `docs/desktop-reader.md` §2-3 without approval — this is a render-gate fix, not a
  chrome redesign.