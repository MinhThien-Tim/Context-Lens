import { test, expect } from '@playwright/test';
import { pdfQueueFixture } from './pdfQueueFixture';
import { pdfScanFixture } from './pdfScanFixture';

test('OCRs only inked poor pages in bounded slices and clears their cache', async ({ page }) => {
  test.setTimeout(240_000);
  const remote: string[] = [];
  page.on('request', request => { if (/tesseract|traineddata|jsdelivr|openai/i.test(request.url()) && new URL(request.url()).origin !== new URL(page.url()).origin) remote.push(request.url()); });
  await page.goto('/');
  const images = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1224; canvas.height = 1584;
    const context = canvas.getContext('2d')!; context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    const blank = canvas.toDataURL('image/jpeg', .9).split(',')[1];
    context.fillStyle = '#111'; context.font = 'bold 48px Arial'; context.fillText('THE CAREFUL READER', 80, 180);
    return { blank, ink: canvas.toDataURL('image/jpeg', .9).split(',')[1] };
  });
  await page.locator('input[type=file]').setInputFiles({ name: 'queue.pdf', mimeType: 'application/pdf', buffer: pdfQueueFixture(Buffer.from(images.ink, 'base64'), 1224, 1584, Buffer.from(images.blank, 'base64')) });
  await expect(page.getByRole('progressbar', { name: 'OCR progress' })).toBeVisible();
  await expect(page.locator('.pdf-queue-status')).toContainText(/\/3/, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Tạm dừng' }).click();
  await expect(page.locator('.pdf-queue-status')).toContainText('tạm dừng');
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page.locator('.pdf-queue-status')).toHaveCount(0, { timeout: 90_000 });
  await expect(page.getByRole('progressbar', { name: 'Reading progress' })).toBeVisible();
  await page.getByRole('button', { name: 'Reading', exact: true }).click();
  await expect(page.locator('.pdf-ocr-page')).toHaveCount(3);
  await expect(page.locator('[data-pdf-reading-page="3"] .pdf-ocr-text')).toHaveCount(0);
  await page.locator('.pdf-reading-options-toggle').click();
  await page.getByRole('menuitem', { name: 'OCR 6 trang tiếp' }).click();
  await expect(page.locator('.pdf-queue-status')).toContainText('Không có trang scan cần OCR');
  await expect(page.locator('.pdf-ocr-page')).toHaveCount(3);
  expect(remote).toEqual([]);
  await page.locator('.pdf-reading-options-toggle').click();
  page.once('dialog', dialog => void dialog.accept());
  await page.getByRole('menuitem', { name: 'Xóa kết quả OCR của tài liệu' }).click();
  await expect(page.locator('.pdf-ocr-page')).toHaveCount(0);
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await expect(page.locator('.pdf-canvas').first()).toBeVisible();
});

test('reports low storage and canvas allocation failure before saving OCR', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1224; canvas.height = 1584;
    const context = canvas.getContext('2d')!; context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#111'; context.font = 'bold 44px Arial'; context.fillText('READ THIS PAGE', 80, 160);
    return canvas.toDataURL('image/jpeg', .9).split(',')[1];
  });
  await page.locator('input[type=file]').setInputFiles({ name: 'resource.pdf', mimeType: 'application/pdf', buffer: pdfScanFixture(Buffer.from(jpeg, 'base64'), 1224, 1584) });
  await page.evaluate(() => Object.defineProperty(navigator.storage, 'estimate', { configurable: true, value: async () => ({ quota: 1_000_000, usage: 999_999 }) }));
  await page.locator('.pdf-reading-options-toggle').click();
  await page.getByRole('menuitem', { name: 'Nhận dạng chữ trang này' }).click();
  await expect(page.locator('.pdf-queue-status')).toContainText('sắp hết dung lượng');
  await page.evaluate(() => { delete (navigator.storage as unknown as Record<string, unknown>).estimate; const original = HTMLCanvasElement.prototype.getContext; Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: function (...args: Parameters<typeof original>) { return this.width > 1000 ? null : original.apply(this, args); } }); });
  await page.locator('.pdf-reading-options-toggle').click();
  await page.getByRole('menuitem', { name: 'Nhận dạng chữ trang này' }).click();
  await expect(page.locator('.pdf-queue-status')).toContainText('không đủ bộ nhớ');
  await expect(page.locator('.pdf-reading-options-toggle')).toBeVisible();
});

test('preloads at most the first twelve pages and leaves later scans for a manual slice', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 1000;
    const context = canvas.getContext('2d')!; context.fillStyle = '#fff'; context.fillRect(0, 0, 800, 1000);
    context.fillStyle = '#111'; context.font = 'bold 44px Arial'; context.fillText('A SCANNED CHAPTER', 60, 150);
    return canvas.toDataURL('image/jpeg', .9).split(',')[1];
  });
  const kinds = Array.from({ length: 13 }, (_, index) => index === 0 || index === 12 ? 'scan' as const : 'blank' as const);
  await page.locator('input[type=file]').setInputFiles({ name: 'first-twelve.pdf', mimeType: 'application/pdf', buffer: pdfQueueFixture(Buffer.from(jpeg, 'base64'), 800, 1000, undefined, kinds) });
  await expect(page.locator('.pdf-queue-status')).toHaveCount(0, { timeout: 90_000 });
  await page.getByRole('button', { name: 'Reading', exact: true }).click();
  await expect(page.locator('[data-ocr-page="1"]')).toHaveCount(1);
  await expect(page.locator('[data-ocr-page="13"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  for (let index = 1; index < 12; index++) await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByLabel('Current PDF page')).toContainText('12 / 13');
  await page.locator('.pdf-reading-options-toggle').click();
  await page.getByRole('menuitem', { name: 'OCR 3 trang tiếp' }).click();
  await expect(page.locator('.pdf-queue-status')).toHaveCount(0, { timeout: 90_000 });
  await page.getByRole('button', { name: 'Reading', exact: true }).click();
  await expect(page.locator('[data-ocr-page="13"]')).toHaveCount(1);
});
