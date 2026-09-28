import { test, expect } from '@playwright/test';
import { pdfFixture } from './pdfFixture';

test.use({ deviceScaleFactor: 2 });

test('desktop natural scale, explicit zoom, canvas resolution and text geometry', async ({ page }) => {
  await page.setViewportSize({ width: 1728, height: 900 });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'natural.pdf', mimeType: 'application/pdf', buffer: pdfFixture(2) });
  await page.getByRole('button', { name: 'Original', exact: true }).first().click();
  await expect(page.locator('[data-pdf-page="1"] .pdf-canvas')).toBeVisible();
  const measure = () => page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.pdf-scroll')!;
    const slot = document.querySelector<HTMLElement>('[data-pdf-page="1"]')!;
    const canvas = slot.querySelector<HTMLCanvasElement>('canvas')!;
    const text = slot.querySelector<HTMLElement>('.pdf-text-layer')!;
    const rect = slot.getBoundingClientRect(), canvasRect = canvas.getBoundingClientRect(), textRect = text.getBoundingClientRect();
    return { rootWidth: root.clientWidth, rootHeight: root.clientHeight, pageWidth: rect.width, pageHeight: rect.height,
      leftGap: rect.left - root.getBoundingClientRect().left, rightGap: root.getBoundingClientRect().right - rect.right,
      canvasWidth: canvasRect.width, canvasHeight: canvasRect.height, backingWidth: canvas.width, backingHeight: canvas.height,
      textWidth: textRect.width, textHeight: textRect.height, textLeft: textRect.left - canvasRect.left,
    };
  });
  await expect.poll(async () => (await measure()).backingWidth).toBeGreaterThan(1800);
  const natural = await measure();
  console.log('natural', JSON.stringify(natural));
  expect(natural.pageWidth).toBeCloseTo(932, 0);
  expect(Math.abs(natural.leftGap - natural.rightGap)).toBeLessThan(2);
  expect(natural.backingWidth / natural.canvasWidth).toBeGreaterThan(1.99);
  expect(natural.backingWidth * natural.backingHeight).toBeLessThanOrEqual(20_000_000);
  expect(natural.textWidth).toBeCloseTo(natural.canvasWidth, 0);
  expect(natural.textHeight).toBeCloseTo(natural.canvasHeight, 0);
  expect(Math.abs(natural.textLeft)).toBeLessThan(1);

  await page.getByRole('button', { name: 'PDF zoom presets' }).click();
  await page.getByRole('button', { name: 'Fit width' }).click();
  await expect.poll(async () => (await measure()).pageWidth).toBeGreaterThan(natural.pageWidth);
  const fitWidth = await measure();
  expect(fitWidth.pageWidth).toBeCloseTo(fitWidth.rootWidth - 64, 0);
  await page.getByRole('button', { name: 'PDF zoom presets' }).click();
  await page.getByRole('button', { name: 'Fit page' }).click();
  await expect.poll(async () => (await measure()).pageWidth).toBeLessThan(natural.pageWidth);
  const fitPage = await measure();
  expect(fitPage.pageWidth).toBeLessThan(natural.pageWidth);
  expect(fitPage.pageHeight).toBeLessThanOrEqual(fitPage.rootHeight);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  const custom = await measure();
  expect(custom.pageWidth).toBeGreaterThan(fitPage.pageWidth);
});

test('natural width clamps on a narrow desktop viewport', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'narrow.pdf', mimeType: 'application/pdf', buffer: pdfFixture(2) });
  await page.getByRole('button', { name: 'Original', exact: true }).first().click();
  await expect.poll(() => page.locator('[data-pdf-page="1"]').evaluate(el => el.getBoundingClientRect().width)).toBeCloseTo(736, 0);
});
