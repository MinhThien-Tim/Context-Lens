import { test, expect, type Page } from '@playwright/test';

async function beginOcr(page: Page) {
  await page.locator('.pdf-reading-options-toggle').click();
  await page.getByRole('menuitem', { name: 'Nhận dạng chữ trang này' }).click();
}

async function readOcr(page: Page) {
  await page.locator('.pdf-reading-options-toggle').click();
  const option = page.locator('.pdf-reading-options button').nth(1);
  await expect(option).toBeEnabled({ timeout: 45_000 });
  await option.click();
}

import { pdfScanFixture } from './pdfScanFixture';
import { pdfMixedFixture } from './pdfMixedFixture';

test('lets a reader choose PDF or OCR text on a page with a text layer', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1224; canvas.height = 1584;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#111'; context.font = 'bold 46px Arial';
    context.fillText('A second page for OCR.', 65, 190);
    return canvas.toDataURL('image/jpeg', .92).split(',')[1];
  });
  await page.locator('input[type=file]').setInputFiles({ name: 'source-choice.pdf', mimeType: 'application/pdf', buffer: pdfMixedFixture(Buffer.from(jpeg, 'base64'), 1224, 1584) });
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await expect(page.getByLabel('Current PDF page')).toContainText('1 / 2');
  await expect(page.locator('.pdf-page-slot').first()).toBeVisible();
  const layout = await page.evaluate(() => ({ toolbarBottom: document.querySelector('.pdf-toolbar')!.getBoundingClientRect().bottom, pageTop: document.querySelector('.pdf-page-slot')!.getBoundingClientRect().top }));
  expect(layout.pageTop).toBeGreaterThanOrEqual(layout.toolbarBottom);
  await expect(page.locator('.pdf-queue-status')).toHaveCount(0, { timeout: 90_000 });
  await beginOcr(page);
  await readOcr(page);
  await expect(page.locator('[data-ocr-page="1"]')).toHaveCount(1);
  await page.getByLabel('Nguồn chữ trang 1').selectOption('pdf');
  await expect(page.locator('[data-ocr-page="1"]')).toHaveCount(0);
  await expect(page.locator('.pdf-reading-page').first()).toContainText('readable PDF page');
  await page.getByLabel('Nguồn chữ trang 1').selectOption('ocr');
  await expect(page.locator('[data-ocr-page="1"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.locator('.library-open').filter({ hasText: 'source-choice' }).click();
  await expect(page.locator('[data-ocr-page="1"]')).toHaveCount(1);
});

test('keeps extracted and scanned pages separate across modes and reopening', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1224; canvas.height = 1584;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#111'; context.font = 'bold 46px Arial';
    context.fillText('A scanned second page for the careful reader.', 65, 190);
    return canvas.toDataURL('image/jpeg', .92).split(',')[1];
  });
  await page.locator('input[type=file]').setInputFiles({ name: 'mixed-ocr.pdf', mimeType: 'application/pdf', buffer: pdfMixedFixture(Buffer.from(jpeg, 'base64'), 1224, 1584) });
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await expect(page.getByLabel('Current PDF page')).toContainText('1 / 2');
  await expect(page.locator('.pdf-queue-status')).toHaveCount(0, { timeout: 90_000 });
  await page.locator('.pdf-reading-options-toggle').click();
  await expect(page.locator('.pdf-reading-options button').last()).toBeVisible();
  await page.locator('.pdf-reading-options-toggle').click();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByLabel('Current PDF page')).toContainText('2 / 2');
  await page.getByRole('button', { name: 'Reading', exact: true }).click();
  await expect(page.getByLabel('Current PDF page')).toContainText('2 / 2');
  await expect(page.locator('.pdf-ocr-text')).toContainText('scanned second page');
  await page.locator('.pdf-ocr-text').evaluate(element => {
    const text = element.firstChild!;
    const range = document.createRange(); range.setStart(text, 2); range.setEnd(text, 16);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
  await page.getByRole('toolbar', { name: 'Selected OCR text actions' }).getByRole('button', { name: 'Note' }).click();
  await page.getByRole('textbox', { name: 'New note' }).fill('Mixed page note');
  await page.getByRole('button', { name: 'Save note' }).click();
  await page.locator('.notes-panel').getByRole('button', { name: 'Close notes' }).click();
  await page.getByRole('button', { name: 'Previous page' }).click();
  await expect(page.locator('.pdf-ocr-page')).toHaveCount(1);
  await expect(page.locator('.pdf-reading-page').first()).toContainText('readable PDF page');
  await page.getByRole('button', { name: 'Next page' }).click();
  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.locator('.library-open').filter({ hasText: 'mixed-ocr' }).click();
  await expect(page.getByLabel('Current PDF page')).toContainText('2 / 2');
  await expect(page.locator('.pdf-ocr-text')).toContainText('scanned second page');
  if (await page.getByRole('button', { name: 'Reader menu' }).isVisible()) {
    await page.getByRole('button', { name: 'Reader menu' }).click();
    await page.getByRole('menuitem', { name: 'Notes' }).click();
  } else await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(page.locator('.notes-list')).toContainText('Mixed page note');
  await page.locator('.notes-list').getByRole('button', { name: 'Go to location' }).click();
  await expect(page.getByLabel('Current PDF page')).toContainText('2 / 2');
  await expect(page.locator('[data-ocr-page="2"]')).toBeVisible();
  await page.locator('.pdf-ocr-warning').getByRole('button', { name: 'Xem Trang gốc' }).click();
  await expect(page.getByLabel('Current PDF page')).toContainText('2 / 2');
  await expect(page.locator('.pdf-canvas').last()).toBeVisible();
});

test('loads Vietnamese language data only after selecting bilingual OCR', async ({ page }) => {
  test.setTimeout(240_000);
  const transfers: Array<{ url: string; bytes: number }> = [];
  page.on('requestfinished', request => {
    if (/traineddata/.test(request.url())) void request.sizes().then(size => transfers.push({ url: request.url(), bytes: size.responseBodySize })).catch(() => {});
  });
  await page.goto('/');
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1224; canvas.height = 1584;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#111'; context.font = 'bold 48px Arial';
    context.fillText('The careful reader learns English.', 65, 180);
    context.fillText('Người đọc học tiếng Việt mỗi ngày.', 65, 270);
    return canvas.toDataURL('image/jpeg', .94).split(',')[1];
  });
  await page.locator('input[type=file]').setInputFiles({ name: 'bilingual.pdf', mimeType: 'application/pdf', buffer: pdfScanFixture(Buffer.from(jpeg, 'base64'), 1224, 1584) });
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await expect(page.locator('.pdf-queue-status')).toHaveCount(0, { timeout: 90_000 });
  expect(transfers.some(item => item.url.includes('/eng.traineddata.gz'))).toBe(true);
  expect(transfers.some(item => item.url.includes('/vie.traineddata.gz'))).toBe(false);
  await page.locator('.pdf-reading-options-toggle').click();
  await page.getByLabel('OCR language').selectOption('eng+vie');
  await page.locator('.pdf-reading-options-toggle').click();
  const start = Date.now();
  await beginOcr(page);
  await readOcr(page);
  const durationMs = Date.now() - start;
  const recognized = await page.locator('.pdf-ocr-text').textContent();
  expect(recognized).toContain('English');
  console.log(JSON.stringify({ durationMs, recognized, transfers }));
  await test.info().attach('bilingual-ocr-metrics', { body: JSON.stringify({ durationMs, recognized, transfers }), contentType: 'application/json' });
  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.locator('.library-open').filter({ hasText: 'bilingual' }).click();
  await expect(page.locator('.pdf-ocr-text')).toContainText('English');
});

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
  const heapBefore = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize ?? null);
  const ocrStart = Date.now();
  await expect(page.locator('.pdf-queue-status')).toHaveCount(0, { timeout: 90_000 });
  await page.getByRole('button', { name: 'Reading', exact: true }).click();
  const ocrMs = Date.now() - ocrStart;
  const heapAfter = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize ?? null);
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
  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.locator('.library-open').filter({ hasText: 'scan' }).click();
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
  await expect(page.getByRole('button', { name: 'Hủy OCR' })).toBeVisible();
  await page.getByRole('button', { name: 'Hủy OCR' }).click();
  await beginOcr(page);
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
  await expect(page.locator('.pdf-queue-status')).toHaveCount(0, { timeout: 90_000 });
  await readOcr(page);
  const recognized = await page.locator('.pdf-ocr-text').textContent();
  expect(recognized).toContain('COLUMN');
  await test.info().attach('blurred-two-column-ocr', { body: recognized ?? '', contentType: 'text/plain' });
  await page.locator('.pdf-ocr-warning').getByRole('button', { name: 'Xem Trang gốc' }).click();
  await expect(page.locator('.pdf-canvas')).toBeVisible();
});
