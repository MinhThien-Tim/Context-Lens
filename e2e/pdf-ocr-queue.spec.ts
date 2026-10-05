import { test, expect, type Page } from '@playwright/test';
import { pdfQueueFixture } from './pdfQueueFixture';
import { pdfScanFixture } from './pdfScanFixture';

// §9.7 — document tools and OCR controls are ONE surface reached through More.
// Idempotent: OCR action buttons call onClose(), so a test may need to reopen the dialog.
async function openDocumentTools(page: Page) {
  const dialog = page.getByRole('dialog', { name: /Document tools|Công cụ/ });
  if (await dialog.isVisible()) return;
  await page.getByRole('button', { name: 'Reader menu' }).click();
  // Menu item label is "Document" (not "Document tools") per App.tsx readerMoreItems
  await page.getByRole('menuitem', { name: 'Document', exact: true }).click();
  await expect(dialog).toBeVisible();
}

test('OCRs only inked poor pages in bounded slices and clears their cache @pdf @heavy', async ({ page }) => {
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
  // Use the Footer OCR progressbar (canonical active OCR status surface) instead of broad getByRole('status')
  await expect(page.getByRole('progressbar', { name: 'OCR progress' })).toContainText(/\/3/, { timeout: 30_000 });
  // Pause/Continue buttons are in Document Tools dialog; open it first
  await openDocumentTools(page);
  // Pause button label is "Tạm dừng OCR" per PdfDocumentTools
  await page.getByRole('button', { name: 'Tạm dừng OCR' }).click();
  // Pause state is reflected in the Document Tools dialog's role="status" paragraph
  // Accept either Vietnamese or English pause message
  await expect(page.getByRole('dialog', { name: /Document tools|Công cụ/ }).getByRole('status')).toContainText(/Tạm dừng trước trang tiếp theo|Paused before the next page/);
  // Continue button label is "Tiếp tục OCR"
  await page.getByRole('button', { name: 'Tiếp tục OCR' }).click();
  await expect(page.getByRole('progressbar', { name: 'OCR progress' })).toHaveCount(0, { timeout: 90_000 });
  await expect(page.getByRole('progressbar', { name: 'Reading progress' })).toBeVisible();
  await page.getByRole('button', { name: 'Reading', exact: true }).click();
  await expect(page.locator('.pdf-ocr-page')).toHaveCount(3);
  await expect(page.locator('[data-pdf-reading-page="3"] .pdf-ocr-text')).toHaveCount(0);
  // The OCR Next action lives in the document-tools dialog; open it explicitly before acting on it.
  await openDocumentTools(page);
  // "Find and OCR the remaining scanned pages" button has aria-label="OCR next"
  await page.getByRole('button', { name: 'OCR next' }).click();
  // Button closes dialog; re-open to check completion status
  await openDocumentTools(page);
  // Scope to the dialog's own role="status": the Reader also has live regions elsewhere.
  // An exhausted queue is reported by the queue message 'Không còn trang cần OCR.'
  await expect(page.getByRole('dialog', { name: /Document tools|Công cụ/ }).getByRole('status')).toContainText('Không còn trang cần OCR');
  await expect(page.locator('.pdf-ocr-page')).toHaveCount(3);
  expect(remote).toEqual([]);
  await openDocumentTools(page);
  page.once('dialog', dialog => void dialog.accept());
  // "Xóa kết quả OCR của tài liệu" is a button inside the document-tools dialog, not a More menuitem
  await page.getByRole('dialog', { name: /Document tools|Công cụ/ }).getByRole('button', { name: 'Xóa kết quả OCR của tài liệu' }).click();
  await expect(page.locator('.pdf-ocr-page')).toHaveCount(0);
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await expect(page.locator('.pdf-canvas').first()).toBeVisible();
});

test('reports low storage and canvas allocation failure before saving OCR @pdf @heavy', async ({ page }) => {
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
  await openDocumentTools(page);
  // Button label is "Nhận dạng chữ trang này" per PdfDocumentTools
  await page.getByRole('button', { name: 'Nhận dạng chữ trang này' }).click();
  // The action closes the dialog (onClose), so re-open it to read its own role="status"
  await openDocumentTools(page);
  // Error message from usePdfOcrQueue.ts catch block: 'Thiết bị sắp hết dung lượng lưu trữ. Hãy giải phóng dung lượng trước khi OCR.'
  await expect(page.getByRole('dialog', { name: /Document tools|Công cụ/ }).getByRole('status')).toContainText('sắp hết dung lượng lưu trữ');
  await expect(page.locator('.pdf-ocr-page')).toHaveCount(0);
  await page.evaluate(() => { delete (navigator.storage as unknown as Record<string, unknown>).estimate; const original = HTMLCanvasElement.prototype.getContext; Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: function (...args: Parameters<typeof original>) { return this.width > 1000 ? null : original.apply(this, args); } }); });
  await openDocumentTools(page);
  await page.getByRole('button', { name: 'Nhận dạng chữ trang này' }).click();
  // Re-open again: the dialog closed on click, and the error must still be observable after reopening
  await openDocumentTools(page);
  // Error message from ocrWorker.ts: 'Thiết bị không đủ bộ nhớ để tạo ảnh OCR. Hãy đóng bớt ứng dụng rồi thử lại.'
  await expect(page.getByRole('dialog', { name: /Document tools|Công cụ/ }).getByRole('status')).toContainText('không đủ bộ nhớ');
  await expect(page.locator('.pdf-ocr-page')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reader menu' })).toBeVisible();
});

test('preloads at most the first twelve pages and leaves later scans for a manual slice @pdf @heavy', async ({ page }) => {
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
  await expect(page.getByRole('progressbar', { name: 'OCR progress' })).toHaveCount(0, { timeout: 90_000 });
  await page.getByRole('button', { name: 'Reading', exact: true }).click();
  await expect(page.locator('[data-ocr-page="1"]')).toHaveCount(1);
  await expect(page.locator('[data-ocr-page="13"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  // Scope "Next page" to the Footer contentinfo region: the Header renders an identical
  // nav[aria-label="Page navigation"] with its own "Next page" button.
  const footerNav = page.getByRole('contentinfo', { name: 'Reading navigation' }).getByRole('button', { name: 'Next page' });
  for (let index = 1; index < 12; index++) await footerNav.click();
  await expect(page.getByRole('button', { name: 'Current PDF page' })).toContainText('12 / 13');
  await openDocumentTools(page);
  // The canonical OCR Next action carries aria-label="OCR next"
  await page.getByRole('button', { name: 'OCR next' }).click();
  await expect(page.getByRole('progressbar', { name: 'OCR progress' })).toHaveCount(0, { timeout: 90_000 });
  await page.getByRole('button', { name: 'Reading', exact: true }).click();
  await expect(page.locator('[data-ocr-page="13"]')).toHaveCount(1);
});
