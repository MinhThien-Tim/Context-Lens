import { test, expect } from '@playwright/test';
import { pdfFixture } from './pdfFixture';

test.use({ deviceScaleFactor: 2 });

test('Original PDF keeps the dominant page at display resolution @pdf', async ({ page }, info) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'resolution.pdf', mimeType: 'application/pdf', buffer: pdfFixture(8) });
  await page.getByRole('button', { name: 'Original', exact: true }).first().click();
  await expect(page.locator('[data-pdf-page="1"] .pdf-canvas')).toBeVisible();
  const measure = () => page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.pdf-scroll')!;
    const top = root.getBoundingClientRect().top, bottom = root.getBoundingClientRect().bottom;
    const slots = Array.from(document.querySelectorAll<HTMLElement>('.pdf-page-slot'));
    const dominant = slots.map(slot => ({ slot, overlap: Math.max(0, Math.min(bottom, slot.getBoundingClientRect().bottom) - Math.max(top, slot.getBoundingClientRect().top)) })).sort((a, b) => b.overlap - a.overlap)[0];
    const canvas = dominant.slot.querySelector<HTMLCanvasElement>('canvas');
    const rect = canvas?.getBoundingClientRect();
    return { dpr: devicePixelRatio,
      rootWidth: root.clientWidth, rootHeight: root.clientHeight, scrollTop: root.scrollTop,
      page: Number(dominant.slot.dataset.pdfPage), pageWidth: dominant.slot.getBoundingClientRect().width,
      canvasWidth: rect?.width, canvasHeight: rect?.height, backingWidth: canvas?.width, backingHeight: canvas?.height,
      mounted: document.querySelectorAll('.pdf-canvas').length,
      canvasPixels: Array.from(document.querySelectorAll<HTMLCanvasElement>('.pdf-canvas')).map(canvas => ({ page: Number(canvas.closest<HTMLElement>('[data-pdf-page]')?.dataset.pdfPage), pixels: canvas.width * canvas.height })) };
  });
  const initial = await measure();
  console.log(`${info.project.name} initial`, JSON.stringify(initial));
  if (info.project.use.isMobile) await page.getByRole('button', { name: 'PDF options' }).click();
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  if (info.project.use.isMobile) await page.getByRole('button', { name: 'PDF options' }).click();
  const zoomed = await measure();
  console.log(`${info.project.name} zoomed`, JSON.stringify(zoomed));
  await page.mouse.move(page.viewportSize()!.width / 2, page.viewportSize()!.height / 2);
  await page.mouse.wheel(0, Math.round((zoomed.canvasHeight ?? 0) - zoomed.rootHeight * .48));
  await expect.poll(async () => (await measure()).page).toBe(2);
  const boundary = await measure();
  const location = await page.getByRole('button', { name: 'Current PDF page', exact: true }).textContent();
  console.log(`${info.project.name} boundary`, JSON.stringify({ ...boundary, location }));
  expect(location).toBe('1 / 8');
  expect((boundary.backingWidth ?? 0) / (boundary.canvasWidth ?? 1)).toBeGreaterThan(1.8);
  expect(boundary.canvasPixels.find(canvas => canvas.page === boundary.page)!.pixels).toBeLessThanOrEqual(20_000_000);
  for (const canvas of boundary.canvasPixels.filter(canvas => canvas.page !== boundary.page)) expect(canvas.pixels).toBeLessThanOrEqual(2_000_000);
  await page.mouse.wheel(0, Math.max(zoomed.rootHeight + 100, (zoomed.canvasHeight ?? 0) + 200));
  await expect.poll(async () => (await measure()).page).toBeGreaterThan(1);
  const next = await measure();
  console.log(`${info.project.name} next`, JSON.stringify(next));
  expect(next.mounted).toBeLessThanOrEqual(3);
});
