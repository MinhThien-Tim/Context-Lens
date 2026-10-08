import { test, expect, type Page } from '@playwright/test';
import { pdfFixture } from './pdfFixture';
import { modeControl } from './readerNames';
import { waitForReaderSurface } from './readerO';

const expectMobileChrome = async (page: Page, mode: 'quiet' | 'chrome') => {
  const header = page.locator('.reader-header');
  const footer = page.locator('.reader-progress');
  const hidden = mode === 'quiet';
  await expect(header).toHaveCSS('visibility', hidden ? 'hidden' : 'visible');
  await expect(header).toHaveCSS('opacity', hidden ? '0' : '1');
  await expect(footer).toHaveCSS('visibility', hidden ? 'hidden' : 'visible');
  await expect(footer).toHaveCSS('opacity', hidden ? '0' : '1');
};

test.describe('MOB-1 — Quiet hides chrome at mobile', () => {
  test('While quiet only reading text is visible: Header, Footer and progress line hidden, text edge to edge @MOB-1 @pdf', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('input[type=file]').setInputFiles({ name: 'quiet.pdf', mimeType: 'application/pdf', buffer: pdfFixture(1) });
    await modeControl(page, 'text').click();
    await waitForReaderSurface(page);

    await expectMobileChrome(page, 'quiet');

    const header = page.locator('.reader-header');
    const footer = page.locator('.reader-progress');
    await expect(header).toHaveCSS('visibility', 'hidden');
    await expect(header).toHaveCSS('opacity', '0');
    await expect(footer).toHaveCSS('visibility', 'hidden');
    await expect(footer).toHaveCSS('opacity', '0');
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
