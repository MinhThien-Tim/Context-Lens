import { test, expect } from '@playwright/test';
import { pdfFixture } from './pdfFixture';

test('desktop Original PDF reaches both horizontal edges after zoom', async ({ page }) => {
  for (const width of [1024, 1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.locator('input[type=file]').setInputFiles({ name: `scroll-${width}.pdf`, mimeType: 'application/pdf', buffer: pdfFixture(3) });
    await page.getByRole('button', { name: 'Original', exact: true }).first().click();
    await expect(page.locator('.pdf-page-slot').first()).toBeVisible();

    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    const geometry = await page.locator('.pdf-scroll').evaluate(root => {
      const pages = root.querySelector('.pdf-pages')!.getBoundingClientRect();
      const slot = root.querySelector('.pdf-page-slot')!;
      const styles = getComputedStyle(root);
      const maxLeft = root.scrollWidth - root.clientWidth;
      root.scrollLeft = 0;
      const left = slot.getBoundingClientRect().left - root.getBoundingClientRect().left;
      root.scrollLeft = maxLeft;
      const right = root.getBoundingClientRect().right - slot.getBoundingClientRect().right;
      const beforeTop = root.scrollTop;
      root.scrollTop = root.scrollHeight - root.clientHeight;
      return { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth, scrollLeft: root.scrollLeft,
        pagesLeft: pages.left, pagesRight: pages.right, slotWidth: slot.getBoundingClientRect().width, left, right,
        paddingLeft: parseFloat(styles.paddingLeft), paddingRight: parseFloat(styles.paddingRight),
        beforeTop, afterTop: root.scrollTop };
    });
    expect(geometry.slotWidth).toBeGreaterThan(geometry.clientWidth);
    expect(geometry.slotWidth).toBeCloseTo((geometry.clientWidth - 64) * 1.25, 0);
    expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth);
    expect(geometry.left).toBeGreaterThanOrEqual(geometry.paddingLeft - 2);
    expect(geometry.left).toBeLessThanOrEqual(geometry.paddingLeft + 2);
    expect(geometry.scrollLeft).toBeCloseTo(geometry.scrollWidth - geometry.clientWidth, 0);
    expect(geometry.right).toBeGreaterThanOrEqual(geometry.paddingRight - 2);
    expect(geometry.afterTop).toBeGreaterThan(geometry.beforeTop);
  }
});
