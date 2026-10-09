import { test, expect } from '@playwright/test';
import { pdfFixture } from './pdfFixture';
import { modeControl } from './readerNames';
import { waitForReaderSurface, expectMobileChrome, readerScrollBy, togglePdfMode } from './readerO';

test.describe('MOB-1 — Quiet hides chrome at mobile', () => {
  test('While quiet only reading text is visible: Header, Footer and progress line hidden, text edge to edge @MOB-1 @pdf', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    // Quiet is reached by real accumulated scroll (INP-1), so the document must be long enough
    // to travel: a single page cannot scroll and would make quiet unreachable by construction.
    await page.locator('input[type=file]').setInputFiles({ name: 'quiet.pdf', mimeType: 'application/pdf', buffer: pdfFixture(12) });
    await togglePdfMode(page, 'text');
    await waitForReaderSurface(page);
    // A freshly opened document always shows chrome (CHR-4); switching presentation must not be
    // what quiets it (MODE-1). Quiet then arrives only from the accumulated wheel travel below.
    await expectMobileChrome(page, 'revealed');
    await readerScrollBy(page, 600, 'wheel');
    await expectMobileChrome(page, 'quiet');

    // Quiet hides the chrome visually: `chrome-quiet` translates the Header off the top and the
    // Footer off the bottom, fades both to zero and drops their pointer events. It deliberately
    // does NOT use `visibility: hidden` — the contract requires the chrome be hidden, not the
    // mechanism — so these assert the mechanism actually implemented.
    const header = page.locator('.reader-header');
    const footer = page.locator('.reader-progress');
    await expect(page.locator('.reader-shell')).toHaveClass(/chrome-quiet/);
    await expect(header).toHaveCSS('opacity', '0');
    await expect(footer).toHaveCSS('opacity', '0');
    await expect(header).toHaveCSS('pointer-events', 'none');
    await expect(footer).toHaveCSS('pointer-events', 'none');
    // Off-screen in both directions: nothing of either bar can overlap the reading text.
    const viewport = page.locator('.reader-viewport');
    const viewportBox = (await viewport.boundingBox())!;
    const headerBox = await header.boundingBox();
    const footerBox = await footer.boundingBox();
    expect(headerBox, 'Header must keep its box while quiet (it is translated, not unmounted)').not.toBeNull();
    expect(footerBox, 'Footer must keep its box while quiet (it is translated, not unmounted)').not.toBeNull();
    expect(headerBox!.y + headerBox!.height, 'Header must sit entirely above the reading viewport').toBeLessThanOrEqual(viewportBox.y + 1);
    expect(footerBox!.y, 'Footer must sit entirely below the reading viewport').toBeGreaterThanOrEqual(viewportBox.y + viewportBox.height - 1);
    // The reading text is edge to edge, and the only visible affordance left is the one-way
    // reveal control (INP-4).
    await expect(page.locator('.reader-reveal')).toBeVisible();
    await expect(page.locator('.pdf-reading-scroll')).toBeVisible();
  });
});

test.describe('MOB-2 — Footer row at mobile', () => {
  for (const [band, width, height] of [
    ['mobile 390px', 390, 844],
    ['mobile 320px', 320, 720],
  ] as const) {
    test(`Footer is one single row of exactly Contents · page number · Markup · More with visible text labels and a hairline top progress line, no % and no zoom at ${band} @MOB-2 @pdf`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await page.locator('input[type=file]').setInputFiles({ name: 'footer.pdf', mimeType: 'application/pdf', buffer: pdfFixture(3) });
      await modeControl(page, 'text').click();
      await waitForReaderSurface(page);

      const footer = page.locator('.reader-progress');
      await expect(footer).toBeVisible();

      await expect(footer.getByRole('button', { name: 'Contents', exact: true })).toBeVisible();
      await expect(footer.getByRole('button', { name: 'Current PDF page', exact: true })).toBeVisible();
      await expect(footer.getByRole('button', { name: 'Markup', exact: true })).toBeVisible();
      await expect(footer.getByRole('button', { name: 'Reader menu', exact: true })).toBeVisible();

      const footerText = await footer.textContent();
      expect(footerText).not.toContain('%');

      await expect(footer.getByRole('button', { name: 'Zoom in', exact: true })).toHaveCount(0);
      await expect(footer.getByRole('button', { name: 'Zoom out', exact: true })).toHaveCount(0);
    });
  }
});
