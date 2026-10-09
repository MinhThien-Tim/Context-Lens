import { test, expect, type Page } from '@playwright/test';
import { pdfFixture } from './pdfFixture';
import { modeControl } from './readerNames';

const slotWidth = (page: Page) =>
  page.locator('.pdf-scroll .pdf-page-slot').first()
    .evaluate(el => el.getBoundingClientRect().width);

// wait for width to stabilize instead of fixed timeout
const settled = async (page: Page) => {
  let prev = -1;
  await expect.poll(async () => {
    const w = await slotWidth(page);
    const stable = Math.abs(w - prev) < 0.5;
    prev = w;
    return stable;
  }, { timeout: 5000 }).toBe(true);
  return slotWidth(page);
};

for (const width of [1024, 1366, 1920]) {
  test(`desktop PDF view reaches both horizontal edges after zoom @${width} @pdf`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.locator('input[type=file]').setInputFiles({
      name: `scroll-${width}.pdf`, mimeType: 'application/pdf',
      buffer: pdfFixture(3, 0, 0, { width: 2200, height: 800 }),
    });
    await modeControl(page, 'pdf').click();
    await expect(page.locator('.pdf-page-slot').first()).toBeVisible();

    const zoom = page.getByRole('combobox', { name: 'Zoom level' });
    await zoom.selectOption('100');
    const w100 = await settled(page);
    console.log({ width, w100, expectedAtPt: 2200 });
    await zoom.selectOption('150');
    await expect.poll(async () => (await slotWidth(page)) / w100).toBeCloseTo(1.5, 1);
    await settled(page);

    const g = await page.locator('.pdf-scroll').evaluate(root => {
      const slot = root.querySelector('.pdf-page-slot')!;
      const cs = getComputedStyle(root);
      const rootBox = () => root.getBoundingClientRect();
      const maxLeft = root.scrollWidth - root.clientWidth;
      root.scrollLeft = 0;
      const left = slot.getBoundingClientRect().left - rootBox().left;
      root.scrollLeft = maxLeft;
      const right = rootBox().right - slot.getBoundingClientRect().right;
      const scrollLeft = root.scrollLeft;
      const beforeTop = root.scrollTop;
      root.scrollTop = root.scrollHeight - root.clientHeight;
      return { cw: root.clientWidth, sw: root.scrollWidth, maxLeft, scrollLeft, left, right,
        pl: parseFloat(cs.paddingLeft), pr: parseFloat(cs.paddingRight),
        beforeTop, afterTop: root.scrollTop };
    });

    expect(g.sw).toBeGreaterThan(g.cw);                 // real horizontal overflow
    expect(g.left).toBeCloseTo(g.pl, 0);                // left edge reachable (catches flex-center clipping left)
    expect(g.scrollLeft).toBeGreaterThan(0);
    expect(g.scrollLeft).toBeCloseTo(g.maxLeft, 0);
    expect(g.right).toBeGreaterThanOrEqual(g.pr - 2);   // right edge reachable
    expect(g.afterTop).toBeGreaterThan(g.beforeTop);
  });
}
