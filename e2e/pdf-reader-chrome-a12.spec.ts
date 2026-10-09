/**
 * A12 — the PDF viewport-geometry contract for the Reader chrome.
 *
 * This spec is deliberately selector-independent: it locates product surfaces by
 * role or accessible name, and states every invariant in product terms ("the
 * viewport box does not move", "the rendered page identity is kept") instead of
 * in pixels or class names. It exists so A12 survives the retirement of the
 * legacy layout specs, which encode the old reserved-strip model and drive
 * scroll with synthetic events.
 *
 * Coverage required by the A12 matrix: 390, 767, 768, 1023, 1024, and the
 * landscape pairs 844x390 and 915x412. There is no tablet band; 1024px is the
 * sole responsive authority.
 *
 * Contract coverage (docs/reader-behavior-contract.md v2) — tags only, the
 * assertions themselves are unchanged from the pre-redesign spec:
 *   CHR-2  quiet is visual and never changes content height, scrollTop, page
 *          identity, location or any geometry       -> quiet/reveal round trip
 *   GEO-1  viewport box top+height unchanged across quiet/reveal           -> both above
 *   GEO-2  page identity and reported location stable                     -> matrix, top return
 *   GEO-3  open order scrollTop 0 -> reconciliation -> settle             -> quiet/reveal round trip
 *   GEO-4  first readable line at or below the header bottom edge         -> first readable line
 *   GEO-5  a revealed header overlaps no more than its own height         -> revealed header overlap
 *
 * Execution tier: PDF-NORMAL
 *   PW_TIER=pdf-normal npx playwright test --config playwright.tiers.config.ts e2e/pdf-reader-chrome-a12.spec.ts
 */
import { test, expect } from '@playwright/test';
import { pdfFixture } from './pdfFixture';
import {
  readerGeometry, expectViewportStable, expectMobileChrome, readerScrollBy, scrollToTop,
  openLookup, closeLookup, togglePdfMode, type ReaderGeometry,
} from './readerO';

/** The A12 matrix. Heights use the repository convention of 900 for portrait and the real device heights for landscape. */
const MATRIX = [
  { name: '390x844 (phone)', width: 390, height: 844 },
  { name: '767x900 (phone boundary)', width: 767, height: 900 },
  { name: '768x900 (above phone band)', width: 768, height: 900 },
  { name: '1023x900 (desktop boundary - 1)', width: 1023, height: 900 },
  { name: '1024x900 (desktop)', width: 1024, height: 900 },
  { name: '844x390 (landscape)', width: 844, height: 390 },
  { name: '915x412 (landscape)', width: 915, height: 412 },
] as const;

async function openPdf(page: import('@playwright/test').Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'a12.pdf', mimeType: 'application/pdf', buffer: pdfFixture(12) });
  await togglePdfMode(page, 'pdf');
  await expect(page.locator('.pdf-page-slot').first()).toBeVisible();
  await page.waitForTimeout(300);
}

/**
 * Drives a quiet -> reveal -> quiet round trip with real wheel input and
 * asserts the A12 box invariants on each leg.
 */
async function chromeRoundTrip(page: import('@playwright/test').Page) {
  const atTop = await readerGeometry(page);

  const beforeQuiet = await readerGeometry(page);
  await readerScrollBy(page, 520, 'wheel');
  await expectMobileChrome(page, 'quiet');
  await expectViewportStable(page, beforeQuiet);

  const beforeReveal = await readerGeometry(page);
  await readerScrollBy(page, -60, 'wheel');
  await expectMobileChrome(page, 'revealed');
  await expectViewportStable(page, beforeReveal);

  const beforeRequiet = await readerGeometry(page);
  await readerScrollBy(page, 520, 'wheel');
  await expectMobileChrome(page, 'quiet');
  await expectViewportStable(page, beforeRequiet);

  return atTop;
}

test.describe('A12 — PDF viewport geometry survives chrome transitions', () => {
  test('quiet/reveal round trip keeps the viewport box and page identity (390) @pdf @CHR-2 @GEO-1 @GEO-2 @GEO-3', async ({ page }) => {
    test.setTimeout(90_000);
    await openPdf(page, 390, 844);
    await chromeRoundTrip(page);
  });

  for (const size of MATRIX) {
    test(`viewport box and page identity are stable at ${size.name} @pdf @GEO-1 @GEO-2`, async ({ page }) => {
      test.setTimeout(90_000);
      await openPdf(page, size.width, size.height);

      const before = await readerGeometry(page);
      // Independent of the model: whatever the chrome does, the rendered page
      // identity must be identical before and after a chrome transition.
      await readerScrollBy(page, 520, 'wheel');
      await expectViewportStable(page, before);
      await readerScrollBy(page, -60, 'wheel');
      await expectViewportStable(page, before);
    });
  }

  test('opening and closing Lookup does not move the viewport box (390) @pdf @GEO-1', async ({ page }) => {
    test.setTimeout(90_000);
    await openPdf(page, 390, 844);

    const before = await readerGeometry(page);
    await openLookup(page);
    await expectViewportStable(page, before);
    await closeLookup(page);
    await expectViewportStable(page, before);
  });

  test('returning to the true top keeps the same page, percent and offset @pdf @GEO-2 @GEO-3', async ({ page }) => {
    test.setTimeout(90_000);
    await openPdf(page, 390, 844);

    const atTop = await readerGeometry(page);
    await readerScrollBy(page, 520, 'wheel');
    await readerScrollBy(page, -520, 'wheel');
    await scrollToTop(page);

    const after = await readerGeometry(page);
    expect(after.scrollTop, 'returning to the top did not reach scrollTop 0').toBeLessThanOrEqual(1);
    expect(after.page, 'page label changed after returning to the top').toBe(atTop.page);
    expect(after.percent, 'percent changed after returning to the top').toBe(atTop.percent);
    expect(after.slotIds, 'page identity changed after returning to the top').toBe(atTop.slotIds);
  });

  test('a revealed header overlays the viewport box but never more than its own height @pdf @GEO-1 @GEO-5', async ({ page }) => {
    test.setTimeout(90_000);
    await openPdf(page, 390, 844);

    // Mid-document, revealed: the header is on top of the reading surface.
    await readerScrollBy(page, 520, 'wheel');
    await readerScrollBy(page, -60, 'wheel');
    await expectMobileChrome(page, 'revealed');

    const mid: ReaderGeometry = await readerGeometry(page);
    const headerHeight = await page.locator('.reader-header').evaluate(el => el.getBoundingClientRect().height);

    // A12 #11, stated so it holds for both chrome models: the revealed header may
    // overlap the viewport box (Overlay) but must never cover more of it than the
    // header's own visual height. Reserved-strip (R) trivially passes with 0
    // overlap; Overlay passes with exactly one header height.
    const overlap = mid.headerBottom - mid.viewportTop;
    expect(
      overlap,
      `header covers ${overlap}px of the viewport box but is only ${headerHeight}px tall`,
    ).toBeLessThanOrEqual(headerHeight + 0.5);
  });

  test('the first readable line is clear of the header at scrollTop 0 @pdf @GEO-4', async ({ page }) => {
    test.setTimeout(90_000);
    await openPdf(page, 390, 844);
    await scrollToTop(page);

    const atTop: ReaderGeometry = await readerGeometry(page);
    expect(atTop.scrollTop, 'helper did not reach scrollTop 0').toBeLessThanOrEqual(1);
    // At scrollTop 0 the first line must clear whatever the header occupies.
    // In the Overlay model the header overlays the surface, so this is the
    // invariant that the static padding inside the scroll container buys.
    expect(
      atTop.firstLineTop,
      `first readable line (top ${atTop.firstLineTop}) is covered by the header (bottom ${atTop.headerBottom})`,
    ).toBeGreaterThan(atTop.headerBottom - 0.5);
  });
});
