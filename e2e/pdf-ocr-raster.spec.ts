import { test, expect } from '@playwright/test';
import { pdfScanFixture } from './pdfScanFixture';

test('measures a fixed OCR raster with small print', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1224; canvas.height = 1584;
    const context = canvas.getContext('2d')!; context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#171717'; context.font = '28px Georgia';
    for (let row = 0; row < 28; row++) context.fillText(`The careful reader follows every sentence on line ${row + 1}.`, 68, 100 + row * 48);
    return canvas.toDataURL('image/jpeg', .82).split(',')[1];
  });
  const heapBefore = await page.evaluate(() => (performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null);
  const started = Date.now();
  await page.locator('input[type=file]').setInputFiles({ name: 'raster.pdf', mimeType: 'application/pdf', buffer: pdfScanFixture(Buffer.from(jpeg, 'base64'), 1224, 1584) });
  await expect(page.locator('.pdf-queue-status')).toHaveCount(0, { timeout: 75_000 });
  await page.locator('.pdf-reading-options-toggle').click();
  await expect(page.getByRole('menuitem', { name: 'Chữ OCR' })).toBeEnabled({ timeout: 75_000 });
  const durationMs = Date.now() - started;
  await page.getByRole('menuitem', { name: 'Chữ OCR' }).click();
  const recognized = await page.locator('.pdf-ocr-text').textContent();
  const heapAfter = await page.evaluate(() => (performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null);
  expect(recognized?.match(/careful reader/gi)?.length).toBeGreaterThanOrEqual(24);
  const metrics = { pixels: process.env.VITE_OCR_RASTER_PIXELS ?? '3000000', durationMs, heapBefore, heapAfter, recognizedLines: recognized?.match(/careful reader/gi)?.length ?? 0 };
  console.log('OCR raster metrics', metrics);
  await test.info().attach('ocr-raster-metrics', { body: JSON.stringify(metrics), contentType: 'application/json' });
});
