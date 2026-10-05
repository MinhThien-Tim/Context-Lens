import { test, expect, type Page } from '@playwright/test';

// §9.7 — document tools and OCR controls are ONE surface reached through More. The old
// `.pdf-reading-options-toggle` no longer has a renderer (removed in 34f4ca1/75497f9); opening
// Document tools is the canonical entry, exactly as mobile-chrome.spec.ts asserts.
// The menu item is labelled `Document` since the 2026-10-05 rename (mobile-chrome.md §6);
// `Document tools` is still the dialog's accessible name.
async function openDocumentTools(page: Page) {
  await page.getByRole('button', { name: 'Reader menu' }).click();
  await page.getByRole('menuitem', { name: 'Document', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /Document tools|Công cụ/ })).toBeVisible();
}

async function beginOcr(page: Page) {
  await openDocumentTools(page);
  await page.getByRole('button', { name: 'Nhận dạng chữ trang này', exact: true }).click();
}

// "read OCR" = wait until recognized text for the document actually exists, then leave the
// reader in OCR-source mode. `Chữ OCR` is disabled until OCR text exists, so it is the semantic
// equivalent of the old positional `.pdf-reading-options button` nth(1) pick, without depending
// on DOM order inside the dialog.
async function readOcr(page: Page) {
  await openDocumentTools(page);
  const option = page.getByRole('button', { name: /^Chữ OCR/ });
  await expect(option).toBeEnabled({ timeout: 45_000 });
  await option.click();
}

import { pdfScanFixture } from './pdfScanFixture';
import { pdfMixedFixture } from './pdfMixedFixture';

// The contract under test is a page that carries BOTH a PDF text layer and an OCR result, so a
// reader can pick the source per page (docs/reader.md §9 "Explicit runs auto-continue" —
// `startCurrent(page)` OCRs the selected page first). `ocrCandidate` rejects any page whose
// extraction quality is not `poor` (ocrEligibility.ts:8), so the fixture's readable page 1 can
// never be OCR'd and the text-free page 2 can never offer a source switch. The fixture therefore
// adds page 3: `poor` (caption under 24 chars) yet non-empty text, plus a painted image, which is
// exactly the corrupt/eligible-but-readable case in tasks/2026-09-29-pdf-corrupt-ocr-eligibility.md.
// Preload cannot reach page 3 — it skips pages that already carry text (docs/reader.md §9) — so the
// explicit `Nhận dạng chữ trang này` action is the only route, and it is the route asserted here.
test('lets a reader choose PDF or OCR text on a page with a text layer @pdf @heavy', async ({ page }) => {
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
  await page.locator('input[type=file]').setInputFiles({ name: 'source-choice.pdf', mimeType: 'application/pdf', buffer: pdfMixedFixture(Buffer.from(jpeg, 'base64'), 1224, 1584, { eligibleTextPage: true }) });
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await expect(page.getByLabel('Current PDF page')).toContainText('1 / 3');
  await expect(page.locator('.pdf-page-slot').first()).toBeVisible();
  // The document canvas starts below the Header band and scrolls under the fixed Footer
    // (docs/desktop-reader.md §1). A rendered page is normally taller than the viewport, so only
    // the top edge is guaranteed to clear the Header; the bottom edge is reached by scrolling.
    const layout = await page.evaluate(() => ({
      headerBottom: document.querySelector('.reader-header')!.getBoundingClientRect().bottom,
      footerTop: document.querySelector('.reader-progress')!.getBoundingClientRect().top,
      pageTop: document.querySelector('.pdf-page-slot')!.getBoundingClientRect().top,
      pageHeight: document.querySelector('.pdf-page-slot')!.getBoundingClientRect().height,
    }));
    expect(layout.pageTop).toBeGreaterThanOrEqual(layout.headerBottom);
    expect(layout.footerTop).toBeGreaterThan(layout.headerBottom);
    expect(layout.pageHeight).toBeGreaterThan(0);
    await expect(page.locator('.pdf-toolbar')).toHaveCount(0);
  await expect(page.getByRole('progressbar', { name: 'OCR progress' })).toHaveCount(0, { timeout: 90_000 });
  // An explicit run acts on the page being read, so navigate to the eligible page first.
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByLabel('Current PDF page')).toContainText('2 / 3');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByLabel('Current PDF page')).toContainText('3 / 3');
  await beginOcr(page);
  await readOcr(page);
  await expect(page.locator('[data-ocr-page="3"]')).toHaveCount(1);
  await page.getByLabel('Nguồn chữ trang 3').selectOption('pdf');
  await expect(page.locator('[data-ocr-page="3"]')).toHaveCount(0);
  await expect(page.locator('.pdf-reading-page').first()).toContainText('readable PDF page');
  await expect(page.locator('[data-pdf-reading-page="3"]')).toContainText('Short caption');
  await page.getByLabel('Nguồn chữ trang 3').selectOption('ocr');
  await expect(page.locator('[data-ocr-page="3"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.locator('.library-open').filter({ hasText: 'source-choice' }).click();
  await expect(page.locator('[data-ocr-page="3"]')).toHaveCount(1);
});

test('keeps extracted and scanned pages separate across modes and reopening @pdf @heavy', async ({ page }) => {
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
  await expect(page.getByRole('progressbar', { name: 'OCR progress' })).toHaveCount(0, { timeout: 90_000 });
  await openDocumentTools(page);
  await expect(page.getByRole('button', { name: 'OCR next' })).toBeVisible();
  await page.getByRole('button', { name: 'Close document tools', exact: true }).click();
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

test('loads Vietnamese language data only after selecting bilingual OCR @pdf @heavy', async ({ page }) => {
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
  await expect(page.getByRole('progressbar', { name: 'OCR progress' })).toHaveCount(0, { timeout: 90_000 });
  // Preloading is asynchronous, so poll the transfer log instead of sampling it once.
  await expect.poll(() => transfers.some(item => item.url.includes('/eng.traineddata.gz')), { timeout: 90_000 }).toBe(true);
  expect(transfers.some(item => item.url.includes('/vie.traineddata.gz'))).toBe(false);
  await openDocumentTools(page);
  await page.getByLabel('OCR language').selectOption('eng+vie');
    await page.getByRole('button', { name: 'Close document tools', exact: true }).click();
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

test('recognizes one scanned page, reads and looks up its text, then reuses the saved result @pdf @heavy', async ({ page }) => {
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
  await expect(page.getByRole('progressbar', { name: 'OCR progress' })).toHaveCount(0, { timeout: 90_000 });
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

test('cancels OCR and can retry the same scanned page @pdf @heavy', async ({ page }) => {
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
  // §12.11 — cancel is a Document-tools control reached through More, and it only renders while the
  // auto-preload queue is actually running. The panel stays open after Cancel (only the recognize
  // and clear handlers close it), so close it before retrying rather than leaving its <p> subtree to
  // intercept the next "Reader menu" click. Poll the panel that is already open: re-entering More
  // inside the retry would toggle the menu shut and livelock.
  await openDocumentTools(page);
  await expect(page.getByRole('button', { name: 'Hủy OCR' })).toBeVisible({ timeout: 90_000 });
  await page.getByRole('button', { name: 'Hủy OCR' }).click();
  await page.getByRole('button', { name: 'Close document tools', exact: true }).click();
  await beginOcr(page);
});

test('keeps a blurred two-column scan available beside its recognized text @pdf @heavy', async ({ page }) => {
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
  await expect(page.getByRole('progressbar', { name: 'OCR progress' })).toHaveCount(0, { timeout: 90_000 });
  await readOcr(page);
  const recognized = await page.locator('.pdf-ocr-text').textContent();
  expect(recognized).toContain('COLUMN');
  await test.info().attach('blurred-two-column-ocr', { body: recognized ?? '', contentType: 'text/plain' });
  await page.locator('.pdf-ocr-warning').getByRole('button', { name: 'Xem Trang gốc' }).click();
  await expect(page.locator('.pdf-canvas')).toBeVisible();
});
