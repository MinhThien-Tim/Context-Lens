import { test, expect } from '@playwright/test';
import { pdfFixture } from './pdfFixture';

test('PDF mode toolbar stays aligned across viewport sizes and follows UI language', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'VN', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'layout.pdf', mimeType: 'application/pdf', buffer: pdfFixture(8) });
  const mode = page.locator('.pdf-mode-switch');
  await expect(mode.getByRole('button', { name: 'Trang gốc' })).toBeVisible();
  await expect(mode.getByRole('button', { name: 'Đọc chữ' })).toBeVisible();
  await page.getByRole('button', { name: 'Current PDF page', exact: true }).click();
  await page.getByRole('dialog', { name: 'Go to location', exact: true }).getByRole('spinbutton').fill('3');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Current PDF page', exact: true })).toHaveText('3 / 8');
  for (const width of [320, 390, 768, 1366]) {
    await page.setViewportSize({ width, height: 850 });
    await expect(mode.getByRole('button')).toHaveCount(2);
    const layout = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const header = rect('.reader-header'); const footer = rect('.reader-progress');
      const mode = rect('.pdf-mode-switch'); const nav = rect('.page-navigation');
      return { headerBottom: header.bottom, footerTop: footer.top, modeRight: mode.right, modeLeft: mode.left, navRight: nav.right, viewport: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(layout.footerTop).toBeGreaterThan(layout.headerBottom);
    expect(layout.modeLeft).toBeGreaterThanOrEqual(0);
    expect(layout.modeRight).toBeLessThanOrEqual(layout.viewport);
    expect(layout.navRight).toBeLessThanOrEqual(layout.viewport);
    expect(layout.overflow).toBe(false);
    await page.locator('.pdf-reading-options-toggle').click();
    await expect(page.locator('.pdf-reading-options')).toBeVisible();
    await expect(page.locator('.pdf-reading-options').getByRole('button', { name: /OCR.*6/ })).toBeVisible();
    await page.locator('.pdf-reading-options').getByRole('button', { name: 'Close document tools', exact: true }).click();
    await mode.getByRole('button', { name: 'Trang g' }).click();
    await expect(page.locator('.pdf-canvas').first()).toBeVisible();
    await page.screenshot({ path: `tmp/phase2/pdf-original-${width}.png` });
    await mode.getByRole('button', { name: 'Đọc chữ', exact: true }).click();
    await expect(page.locator('.pdf-reading-view')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Current PDF page', exact: true })).toHaveText('3 / 8');
    await page.screenshot({ path: `tmp/phase2/pdf-reading-${width}.png` });
    await mode.getByRole('button', { name: 'Trang g' }).click();
    await expect(page.getByRole('button', { name: 'Current PDF page', exact: true })).toHaveText('3 / 8');
  }
  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.locator('.library-open').filter({ hasText: 'layout' }).click();
  await expect(page.locator('.pdf-mode-switch').getByRole('button', { name: 'Original' })).toBeVisible();
  await expect(page.locator('.pdf-mode-switch').getByRole('button', { name: 'Reading' })).toBeVisible();
});
