import { test, expect } from '@playwright/test';
import { pdfFixture } from './pdfFixture';
test.use({ deviceScaleFactor: 2 });

test('first desktop canvas uses real bounds and dominant DPR before zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1728, height: 900 });
  await page.goto('/');
  await page.evaluate(() => {
    (window as typeof window & { pdfCanvasSamples?: unknown[] }).pdfCanvasSamples = [];
    new MutationObserver(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-pdf-page="1"] canvas');
      const root = document.querySelector<HTMLElement>('.pdf-scroll');
      if (canvas && root && canvas.style.width && canvas.width > 1) {
        const samples = (window as typeof window & { pdfCanvasSamples: unknown[] }).pdfCanvasSamples;
        const sample = { backing: canvas.width, height: canvas.height, css: canvas.getBoundingClientRect().width, root: root.clientWidth, dpr: devicePixelRatio };
        if (JSON.stringify(samples.at(-1)) !== JSON.stringify(sample)) samples.push(sample);
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['width', 'height', 'style'] });
  });
  await page.locator('input[type=file]').setInputFiles({ name: 'first-render.pdf', mimeType: 'application/pdf', buffer: pdfFixture(4) });
  await page.getByRole('button', { name: 'Original', exact: true }).first().click();
  const canvas = page.locator('[data-pdf-page="1"] canvas');
  await expect.poll(() => canvas.evaluate(el => (el as HTMLCanvasElement).width)).toBeGreaterThan(1800);
  const initial = await canvas.evaluate(el => { const c = el as HTMLCanvasElement; return { backing: c.width, height: c.height, css: c.getBoundingClientRect().width, dpr: devicePixelRatio }; });
  const samples = await page.evaluate(() => (window as typeof window & { pdfCanvasSamples: unknown[] }).pdfCanvasSamples);
  console.log('first-render', JSON.stringify({ initial, samples }));
  expect(initial.backing / initial.css).toBeGreaterThan(initial.dpr - .02);
  expect(initial.backing * initial.height).toBeLessThanOrEqual(20_000_000);
  expect(samples.every((s: any) => s.backing / s.css > s.dpr - .02)).toBe(true);
  const neighborPixels = await page.locator('[data-pdf-page="2"] canvas').evaluate(el => { const c = el as HTMLCanvasElement; return c.width * c.height; });
  expect(neighborPixels).toBeLessThanOrEqual(2_000_000);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(() => canvas.evaluate(el => (el as HTMLCanvasElement).getBoundingClientRect().width)).toBeGreaterThan(initial.css);
  const zoomed = await canvas.evaluate(el => { const c = el as HTMLCanvasElement; return { backing: c.width, height: c.height, css: c.getBoundingClientRect().width, dpr: devicePixelRatio }; });
  console.log('zoomed-render', JSON.stringify(zoomed));
  expect(zoomed.backing * zoomed.height).toBeLessThanOrEqual(20_000_000);
  expect(zoomed.backing / zoomed.css).toBeGreaterThan(1);
});

test('mobile Zoom fits in footer and its menu stays operable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 850 });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'footer.pdf', mimeType: 'application/pdf', buffer: pdfFixture(2) });
  await page.getByRole('button', { name: 'Original', exact: true }).first().click();
  for (const width of [320, 360, 390, 393, 430]) {
    await page.setViewportSize({ width, height: 850 });
    const zoom = page.getByRole('button', { name: 'PDF options' });
    await expect(zoom).toBeVisible();
    await expect(page.getByRole('button', { name: 'Click word lookup' })).toBeVisible();
    const layout = await page.evaluate(() => {
      const footer = document.querySelector<HTMLElement>('.reader-progress')!;
      const location = footer.querySelector<HTMLElement>('.reader-progress-location')!;
      const status = footer.querySelector<HTMLElement>('.reader-progress-status')!;
      const a = location.getBoundingClientRect(), b = status.getBoundingClientRect(), f = footer.getBoundingClientRect();
      return { documentWidth: document.documentElement.scrollWidth, viewport: innerWidth, footerHeight: f.height, sameLine: Math.abs(a.top - b.top) < 3, separated: a.right <= b.left + 1, inside: b.right <= innerWidth + 1 };
    });
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport);
    expect(layout.sameLine && layout.separated && layout.inside).toBe(true);
    await zoom.click();
    const menu = page.locator('.pdf-more-menu');
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    expect(box!.y + box!.height).toBeLessThan((await zoom.boundingBox())!.y);
    for (const action of ['Zoom out', 'Zoom in', 'Fit width', 'Fit page']) await menu.getByRole('button', { name: action }).click();
    await zoom.click();
    await expect(menu).toHaveCount(0);
  }
});
