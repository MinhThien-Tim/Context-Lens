import { test, expect } from '@playwright/test';
import { pdfMixedFixture } from './pdfMixedFixture';

test('PDF mode toolbar stays aligned across viewport sizes and follows UI language', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'VN', exact: true }).click();
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 10; canvas.height = 10;
    return canvas.toDataURL('image/jpeg').split(',')[1];
  });
  await page.locator('input[type=file]').setInputFiles({ name: 'layout.pdf', mimeType: 'application/pdf', buffer: pdfMixedFixture(Buffer.from(jpeg, 'base64'), 10, 10) });
  const mode = page.locator('.pdf-mode-switch');
  await expect(mode.getByRole('button', { name: 'Trang gốc' })).toBeVisible();
  await expect(mode.getByRole('button', { name: 'Đọc chữ' })).toBeVisible();
  for (const width of [320, 390, 768, 1366]) {
    await page.setViewportSize({ width, height: 850 });
    const layout = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const header = rect('.reader-header'); const line = rect('.progress-line');
      const mode = rect('.pdf-mode-switch'); const nav = rect('.page-navigation');
      return { headerBottom: header.bottom, lineTop: line.top, modeRight: mode.right, navLeft: nav.left, navRight: nav.right, viewport: innerWidth };
    });
    expect(layout.lineTop).toBeGreaterThanOrEqual(layout.headerBottom - 1);
    expect(layout.modeRight).toBeLessThanOrEqual(layout.navLeft + 1);
    expect(layout.navRight).toBeLessThanOrEqual(layout.viewport);
    await mode.locator('.pdf-reading-options-toggle').click();
    await expect(page.locator('.pdf-reading-options')).toBeVisible();
    await mode.locator('.pdf-reading-options-toggle').click();
  }
  await mode.getByRole('button', { name: 'Đọc chữ' }).click();
  await expect(mode.getByRole('button', { name: 'Đọc chữ' })).toHaveAttribute('aria-pressed', 'true');
  await mode.getByRole('button', { name: 'Trang gốc' }).click();
  await expect(mode.getByRole('button', { name: 'Trang gốc' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.getByRole('button', { name: 'layout.pdf' }).click();
  await expect(page.locator('.pdf-mode-switch').getByRole('button', { name: 'Original' })).toBeVisible();
  await expect(page.locator('.pdf-mode-switch').getByRole('button', { name: 'Reading' })).toBeVisible();
});
