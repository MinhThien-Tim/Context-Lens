import { test, expect } from '@playwright/test';
import { pdfScanFixture } from './pdfScanFixture';

test('recognizes one scanned page, reads and looks up its text, then reuses the saved result', async ({ page }) => {
  test.setTimeout(240_000);
  const transfers: Array<{ url: string; bytes: number }> = [];
  page.on('requestfinished', request => {
    if (/tesseract|traineddata|jsdelivr/.test(request.url())) void request.sizes().then(size => transfers.push({ url: request.url(), bytes: size.responseBodySize })).catch(() => {});
  });
  await page.goto('/');
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1224; canvas.height = 1584;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#111'; context.font = 'bold 52px Arial';
    context.fillText('SCANNED PAGE', 80, 160);
    context.font = '38px Arial'; context.fillText('The careful reader studies every word.', 80, 260);
    return canvas.toDataURL('image/jpeg', .92).split(',')[1];
  });
  await page.locator('input[type=file]').setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: pdfScanFixture(Buffer.from(jpeg, 'base64'), 1224, 1584) });
  await expect(page.getByRole('button', { name: 'Original', exact: true }).first()).toBeVisible();
  expect(transfers).toHaveLength(0);
  const heapBefore = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize ?? null);
  const ocrStart = Date.now();
  await page.getByRole('button', { name: 'Nhận dạng chữ trang này' }).click();
  await expect(page.getByRole('button', { name: 'Đọc chữ đã nhận dạng' }).or(page.locator('.pdf-ocr-text'))).toBeVisible({ timeout: 180_000 });
  const ocrMs = Date.now() - ocrStart;
  const heapAfter = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize ?? null);
  if (await page.getByRole('button', { name: 'Đọc chữ đã nhận dạng' }).isVisible()) await page.getByRole('button', { name: 'Đọc chữ đã nhận dạng' }).click();
  await expect(page.locator('.pdf-ocr-text')).toContainText('careful reader');
  await page.locator('.pdf-ocr-text').click();
  await expect(page.locator('.lookup-sheet,.context-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Save word' }).click();
  await expect(page.getByRole('button', { name: 'Remove saved word' })).toBeVisible();
  await page.locator('.lookup-sheet').getByRole('button', { name: 'Close meaning' }).click();
  await page.locator('.pdf-ocr-text').evaluate(element => {
    const text = element.firstChild!;
    const range = document.createRange(); range.setStart(text, 17); range.setEnd(text, 31);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
  await expect(page.getByRole('toolbar', { name: 'Selected OCR text actions' })).toBeVisible();
  await page.getByRole('toolbar', { name: 'Selected OCR text actions' }).getByRole('button', { name: 'Note' }).click();
  await page.getByRole('textbox', { name: 'New note' }).fill('Scan OCR note');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.locator('.notes-list')).toContainText('Scan OCR note');
  await page.locator('.notes-list').getByRole('button', { name: 'Go to location' }).click();
  await expect(page.getByLabel('Current PDF page')).toContainText('1 / 1');
  await page.locator('.pdf-ocr-warning').getByRole('button', { name: 'Xem Trang gốc' }).click();
  await expect(page.locator('.pdf-canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nhận dạng chữ trang này' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.locator('.library-open').filter({ hasText: 'scan' }).click();
  await expect(page.getByRole('button', { name: 'Nhận dạng chữ trang này' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reading', exact: true }).click();
  await expect(page.locator('.pdf-ocr-text')).toContainText('careful reader');
  await test.info().attach('ocr-metrics', { body: JSON.stringify({ ocrMs, heapBefore, heapAfter, transfers }), contentType: 'application/json' });
  await page.getByRole('button', { name: 'Back to library' }).click();
  page.once('dialog', dialog => void dialog.accept());
  await page.getByRole('button', { name: 'Delete scan' }).click();
  await expect(page.locator('.library-open').filter({ hasText: 'scan' })).toHaveCount(0);
  expect(await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('context-lens'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const count = await new Promise<number>((resolve, reject) => { const request = database.transaction('pdfOcr').objectStore('pdfOcr').count(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    database.close(); return count;
  })).toBe(0);
});

test('cancels OCR and can retry the same scanned page', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1224; canvas.height = 1584;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#111'; context.font = 'bold 52px Arial'; context.fillText('SECOND SCANNED PAGE', 70, 160);
    return canvas.toDataURL('image/jpeg', .92).split(',')[1];
  });
  await page.locator('input[type=file]').setInputFiles({ name: 'cancel-scan.pdf', mimeType: 'application/pdf', buffer: pdfScanFixture(Buffer.from(jpeg, 'base64'), 1224, 1584) });
  await page.getByRole('button', { name: 'Nhận dạng chữ trang này' }).click();
  await page.getByRole('button', { name: 'Hủy OCR' }).click();
  await expect(page.getByRole('button', { name: 'Nhận dạng chữ trang này' })).toBeEnabled();
  await page.getByRole('button', { name: 'Nhận dạng chữ trang này' }).click();
  await expect(page.getByRole('button', { name: 'Đọc chữ đã nhận dạng' }).or(page.locator('.pdf-ocr-text'))).toBeVisible({ timeout: 180_000 });
});

test('keeps a blurred two-column scan available beside its recognized text', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1224; canvas.height = 1584;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.filter = 'blur(1.2px)'; context.fillStyle = '#333'; context.font = 'bold 43px Arial';
    context.fillText('FIRST COLUMN', 65, 160); context.fillText('SECOND COLUMN', 640, 160);
    context.font = '30px Arial';
    context.fillText('The reader looks left.', 65, 235); context.fillText('Then the reader looks right.', 640, 235);
    return canvas.toDataURL('image/jpeg', .78).split(',')[1];
  });
  await page.locator('input[type=file]').setInputFiles({ name: 'blurred-columns.pdf', mimeType: 'application/pdf', buffer: pdfScanFixture(Buffer.from(jpeg, 'base64'), 1224, 1584) });
  await page.getByRole('button', { name: 'Nhận dạng chữ trang này' }).click();
  await expect(page.getByRole('button', { name: 'Đọc chữ đã nhận dạng' }).or(page.locator('.pdf-ocr-text'))).toBeVisible({ timeout: 180_000 });
  if (await page.getByRole('button', { name: 'Đọc chữ đã nhận dạng' }).isVisible()) await page.getByRole('button', { name: 'Đọc chữ đã nhận dạng' }).click();
  const recognized = await page.locator('.pdf-ocr-text').textContent();
  expect(recognized).toContain('COLUMN');
  await test.info().attach('blurred-two-column-ocr', { body: recognized ?? '', contentType: 'text/plain' });
  await page.locator('.pdf-ocr-warning').getByRole('button', { name: 'Xem Trang gốc' }).click();
  await expect(page.locator('.pdf-canvas')).toBeVisible();
});
