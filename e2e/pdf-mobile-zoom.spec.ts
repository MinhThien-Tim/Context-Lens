import { test, expect, type Page } from '@playwright/test';
import { pdfFixture } from './pdfFixture';

/**
 * Mobile-band contract (docs/mobile-chrome.md §5:79-84): at ≤1023 px the Footer owns the direct
 * zoom stepper; at ≥1024 px the Footer renders no zoom control at all and the Header toolbar owns it
 * (desktop-reader.md §3, verified by probe: laptop 1366px resolves 'Zoom out' inside <header>,
 * mobile 412px inside <footer>). This file therefore pins a mobile viewport explicitly instead of
 * inheriting the project's viewport — under `laptop` the inherited 1366x900 put it in the desktop
 * band, where this file's Footer assertions describe a control that does not exist.
 *
 * One viewport per test on purpose (standing rules §1.3): a failure inside a
 * viewport loop is unattributable, so every resize target is its own test and
 * the report names the size that broke.
 */
test.use({ viewport: { width: 393, height: 850 } });

const RESIZE_TARGETS = [
  { label: 'narrow 320x850', width: 320, height: 850 },
  { label: 'landscape 850x393', width: 850, height: 393 },
  { label: 'portrait 393x850', width: 393, height: 850 },
];

/** Opens the 8-page fixture in Original mode on page 3, the shared starting state for a resize. */
async function openOriginalReaderAtPageThree(page: Page) {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'mobile-zoom.pdf', mimeType: 'application/pdf', buffer: pdfFixture(8) });
  await page.locator('.pdf-mode-switch').getByRole('button', { name: /Original|Trang gốc/ }).click();
  await page.getByRole('button', { name: 'Current PDF page', exact: true }).click();
  await page.getByRole('dialog', { name: 'Go to location', exact: true }).getByRole('spinbutton').fill('3');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Current PDF page', exact: true })).toHaveText('3 / 8');
}

test('Original mobile zoom preserves reading and selection geometry @pdf', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'mobile-zoom.pdf', mimeType: 'application/pdf', buffer: pdfFixture(8) });
  await page.locator('.pdf-mode-switch').getByRole('button', { name: /Original|Trang gốc/ }).click();
  const slot = page.locator('[data-pdf-page="1"]');
  const width = () => slot.evaluate(el => el.getBoundingClientRect().width);
  await expect(page.locator('.pdf-text-layer span').first()).toBeVisible();
  // §8.2/§8.3 (U3): at <=1023px zoom is a direct Footer control, never a popup. The mobile PDF
  // options popup and its Fit width / Fit page entries are gone from this band.
  const stepper = page.getByRole('button', { name: 'Zoom out', exact: true });
  await expect(stepper).toBeVisible();
    // §5:79-84 — the stepper belongs to the Footer in this band, and the deleted
    // mobile PDF options popup is not reintroduced as a replacement.
    await expect(stepper.locator('xpath=ancestor::footer')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'PDF options' })).toHaveCount(0);
  const fitted = await width();
  await stepper.click();
  await expect.poll(width).toBeLessThan(fitted);
  const smaller = await width();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(width).toBeGreaterThan(smaller);
  expect(await slot.evaluate(el => el.getBoundingClientRect().height)).toBeLessThanOrEqual(await page.locator('.pdf-scroll').evaluate(el => el.clientHeight));
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Current PDF page', exact: true }).click();
  await page.getByRole('dialog', { name: 'Go to location', exact: true }).getByRole('spinbutton').fill('3');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  const position = page.getByRole('button', { name: 'Current PDF page', exact: true });
  await expect(position).toHaveText('3 / 8');
    const text = page.locator('[data-pdf-page="3"] .pdf-text-layer span').filter({ hasText: 'The decision' }).first();
    await expect(text).toBeVisible();
    await text.evaluate(el => {
      const range = document.createRange(); range.setStart(el.firstChild!, 4); range.setEnd(el.firstChild!, 12);
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await expect(page.getByRole('toolbar', { name: 'Selected text actions' })).toBeVisible();
    const scroll = page.locator('.pdf-scroll');
    const before = await scroll.evaluate(el => el.scrollTop);
    await page.getByRole('button', { name: 'Close selection actions' }).click();
    expect(await scroll.evaluate(el => el.scrollTop)).toBe(before);
    await expect(position).toHaveText('3 / 8');
    // docs/reader.md: "Desktop custom scale is bounded to 0.1-6, while mobile custom scale remains
        // bounded to 0.1-3." Twenty Zoom In clicks from a fitted page run into that ceiling. This file
        // pins a <=1023px viewport (above), so the app is in the mobile band on every project and the
        // ceiling is 3 here. Reading it off the project device instead would silently assert 6 under
        // `laptop`, a band this file never enters.
        const scaleCeiling = 3;
    for (let n = 0; n < 20; n++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect.poll(() => page.locator('[data-pdf-page="3"]').evaluate(el => el.getBoundingClientRect().width)).toBeCloseTo(612 * scaleCeiling, 0);
    const pan = await scroll.evaluate(el => {
    const top = el.scrollTop; el.scrollLeft = el.scrollWidth;
    const right = el.scrollLeft; el.scrollLeft = 0;
    return { top, after: el.scrollTop, right, left: el.scrollLeft };
  });
  expect(pan.right).toBeGreaterThan(0); expect(pan.left).toBe(0); expect(pan.after).toBe(pan.top);
  await expect(position).toHaveText('3 / 8');
  expect(await page.locator('.pdf-canvas').count()).toBeLessThanOrEqual(3);
  for (const size of await page.locator('.pdf-canvas').evaluateAll(elements => elements.map(el => ({ page: Number(el.closest<HTMLElement>('[data-pdf-page]')?.dataset.pdfPage), width: (el as HTMLCanvasElement).width, height: (el as HTMLCanvasElement).height })))) {
    expect(size.width * size.height).toBeLessThanOrEqual(size.page === 3 ? 20_000_000 : 2_000_000);
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(size.page === 3 ? 8192 : 4096);
  }
  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.locator('.library-open').filter({ hasText: 'mobile-zoom' }).click();
  await expect(position).toHaveText('3 / 8');
});

for (const target of RESIZE_TARGETS) {
  test(`Resize to ${target.label} keeps the current page and never widens the document @pdf`, async ({ page }) => {
    await openOriginalReaderAtPageThree(page);
    await page.setViewportSize({ width: target.width, height: target.height });
    await expect(page.getByRole('button', { name: 'Current PDF page', exact: true })).toHaveText('3 / 8');
    expect(await page.locator('.pdf-canvas').count()).toBeLessThanOrEqual(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
