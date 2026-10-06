import { test, expect, type Page } from '@playwright/test';

// §9.7 — document tools and OCR controls are ONE surface reached through More.
async function openDocumentTools(page: Page) {
  await page.getByRole('button', { name: 'Reader menu' }).click();
    // Menu item label is "Document" (not "Document tools") per App.tsx readerMoreItems
    await page.getByRole('menuitem', { name: 'Document', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /Document tools|Công cụ/ })).toBeVisible();
}

async function beginOcr(page: Page) {
  await openDocumentTools(page);
  await page.getByRole('button', { name: 'Nhận dạng chữ trang này', exact: true }).click();
}

async function readOcr(page: Page) {
  await openDocumentTools(page);
  const option = page.getByRole('button', { name: /^Chữ OCR/ });
  await expect(option).toBeEnabled({ timeout: 10_000 });
  await option.click();
}

const textPdf = process.env.PDF_QA_TEXT_PATH;
const scanPdf = process.env.PDF_QA_SCAN_PATH;

test('reviews the supplied title page and manually compares OCR with PDF text @pdf @heavy', async ({ page }) => {
  test.skip(!textPdf, 'Set PDF_QA_TEXT_PATH to run the local sample');
  test.setTimeout(240_000);
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(textPdf!);
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  for (let n = 1; n < 5; n++) await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByLabel('Current PDF page')).toContainText('5 / 21');
  await page.getByRole('button', { name: 'Reading', exact: true }).click();
  await expect(page.locator('.pdf-reading-page').nth(4)).toContainText('THIRD EDITION');
  await expect(page.locator('.pdf-reading-page').nth(4)).toContainText('GERALD GRAFF');
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await beginOcr(page);
  await readOcr(page);
  await expect(page.getByLabel('Current PDF page')).toContainText('5 / 21');
  await expect(page.locator('.pdf-ocr-page')).toHaveCount(1);
  await page.getByLabel('Nguồn chữ trang 5').selectOption('pdf');
  await expect(page.locator('.pdf-ocr-page')).toHaveCount(0);
  await page.getByLabel('Nguồn chữ trang 5').selectOption('ocr');
  await expect(page.locator('.pdf-ocr-page')).toHaveCount(1);
  await test.info().attach('title-page-ocr', { body: await page.locator('[data-ocr-page="5"] .pdf-ocr-text').textContent() ?? '', contentType: 'text/plain' });
});

test('reads the supplied scan through OCR and returns to its original page @pdf @heavy', async ({ page }) => {
  test.skip(!scanPdf, 'Set PDF_QA_SCAN_PATH to run the local sample');
  test.setTimeout(240_000);
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(scanPdf!);
  await expect(page.getByLabel('Current PDF page')).toContainText(/1 \/ \d+/);
  await expect(page.getByRole('progressbar', { name: 'OCR progress' })).toHaveCount(0, { timeout: 120_000 });
  await readOcr(page);
  const recognized = await page.locator('[data-ocr-page="1"] .pdf-ocr-text').textContent();
  expect(recognized?.trim().length).toBeGreaterThan(20);
  await test.info().attach('scan-page-ocr', { body: recognized ?? '', contentType: 'text/plain' });
  await page.locator('[data-ocr-page="1"] .pdf-ocr-warning button').click();
  await expect(page.getByLabel('Current PDF page')).toContainText(/1 \/ \d+/);
  await expect(page.locator('.pdf-canvas').first()).toBeVisible();
});

test('keeps several body pages of the supplied text PDF readable without OCR @pdf', async ({ page }) => {
  test.skip(!textPdf, 'Set PDF_QA_TEXT_PATH to run the local sample');
  test.setTimeout(180_000);
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(textPdf!);
  await page.getByRole('button', { name: 'Reading', exact: true }).click();
  for (const number of [13, 14, 16]) {
    const body = (await page.locator(`[data-pdf-reading-page="${number}"]`).textContent()) ?? '';
    expect(body.trim().length).toBeGreaterThan(100);
  }
  await expect(page.locator('.pdf-ocr-page')).toHaveCount(0);
});

test('runs a bounded OCR slice on body pages of the supplied scan @pdf @heavy', async ({ page }) => {
  test.skip(!scanPdf, 'Set PDF_QA_SCAN_PATH to run the local sample');
  test.setTimeout(240_000);
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(scanPdf!);
  await expect(page.getByRole('progressbar', { name: 'OCR progress' })).toHaveCount(0, { timeout: 120_000 });
  await openDocumentTools(page);
  // The control's accessible name is the stable "OCR next"; the descriptive sentence is its title,
  // and `getByRole` matches the accessible name, so the name is the reliable handle.
  await page.getByRole('button', { name: 'OCR next' }).click();
    // The action closes the dialog via onClose(); re-open before reading its status paragraph.
      await openDocumentTools(page);
      // Scope to the dialog's own role="status"; the Reader renders other live regions elsewhere.
      // The paragraph only exists once a run has reported, and its copy is the localised
      // "Completed N/M" line (PdfModeSwitch.tsx), not the retired "no pages left" phrasing.
      await expect(page.getByRole('dialog', { name: /Document tools|Công cụ/ }).getByRole('status')).toContainText(/Completed \d+\/\d+/);
  await page.getByRole('button', { name: 'Reading', exact: true }).click();
  await expect(page.locator('.pdf-ocr-page').first()).toBeVisible();
  await expect(page.locator('.pdf-ocr-page')).toHaveCount(7);
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await expect(page.locator('.pdf-canvas').first()).toBeVisible();
});
