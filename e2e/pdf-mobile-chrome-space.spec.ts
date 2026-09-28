import { test, expect } from '@playwright/test';
import { pdfFixture } from './pdfFixture';

test('Original PDF reclaims mobile header space without a toolbar gap', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'chrome.pdf', mimeType: 'application/pdf', buffer: pdfFixture(8) });
  await page.locator('.pdf-mode-switch').getByRole('button', { name: /Original|Trang gốc/ }).click();
  await expect(page.locator('.pdf-page-slot').first()).toBeVisible();

  for (const [width, height] of [[320, 700], [360, 780], [390, 844], [393, 852], [430, 932], [640, 360]]) {
    await page.setViewportSize({ width, height });
    await page.locator('.reader-shell').evaluate(el => el.classList.remove('chrome-quiet'));
    await page.waitForTimeout(150);
    const geometry = () => page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const header = rect('.reader-header');
      const viewport = rect('.reader-viewport');
      const scroll = rect('.pdf-scroll');
      const pageSlot = rect('.pdf-page-slot');
      const footer = rect('.reader-progress');
      return { headerBottom: header.bottom, viewportTop: viewport.top, scrollTop: scroll.top,
        scrollBottom: scroll.bottom, pageTop: pageSlot.top, footerTop: footer.top,
        page: document.querySelector('[aria-label="Current PDF page"]')?.textContent,
        documentOverflowX: document.documentElement.scrollWidth > innerWidth,
        documentOverflowY: document.documentElement.scrollHeight > innerHeight };
    });
    const visible = await geometry();
    expect(visible.viewportTop).toBeCloseTo(visible.headerBottom, 0);
    expect(visible.scrollTop).toBeCloseTo(visible.headerBottom, 0);
    expect(visible.pageTop - visible.scrollTop).toBeLessThanOrEqual(5);
    expect(visible.scrollBottom).toBeLessThanOrEqual(height + 1);
    expect(visible.documentOverflowX).toBe(false);
    expect(visible.documentOverflowY).toBe(false);
    await page.locator('.reader-shell').evaluate(el => el.classList.add('chrome-quiet'));
    const hidden = await geometry();
    expect(hidden.scrollTop).toBe(0);
    expect(hidden.scrollBottom).toBeLessThanOrEqual(height + 1);
    expect(hidden.page).toBe(visible.page);
    expect(hidden.footerTop).toBe(visible.footerTop);
    await page.locator('.reader-shell').evaluate(el => el.classList.remove('chrome-quiet'));
    const restored = await geometry();
    expect(restored.scrollTop).toBeCloseTo(visible.scrollTop, 0);
    expect(restored.pageTop - restored.scrollTop).toBeLessThanOrEqual(5);
    expect(restored.page).toBe(visible.page);
  }
});
