import { test, expect, type Page } from '@playwright/test';

async function beginOcr(page: Page) {
  await page.locator('.pdf-reading-options-toggle').click();
  await page.getByRole('menuitem', { name: 'Nhận dạng chữ trang này' }).click();
}

async function readOcr(page: Page) {
  await page.locator('.pdf-reading-options-toggle').click();
  const option = page.locator('.pdf-reading-options button').nth(1);
  await expect(option).toBeEnabled({ timeout: 10_000 });
  await option.click();
}

const textPdf = process.env.PDF_QA_TEXT_PATH;
const scanPdf = process.env.PDF_QA_SCAN_PATH;

test('reviews the supplied title page and manually compares OCR with PDF text', async ({ page }) => {
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

test('reads the supplied scan through OCR and returns to its original page', async ({ page }) => {
  test.skip(!scanPdf, 'Set PDF_QA_SCAN_PATH to run the local sample');
  test.setTimeout(240_000);
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(scanPdf!);
  await expect(page.getByLabel('Current PDF page')).toContainText(/1 \/ \d+/);
  await expect(page.locator('.pdf-queue-status')).toHaveCount(0, { timeout: 120_000 });
  await readOcr(page);
  const recognized = await page.locator('[data-ocr-page="1"] .pdf-ocr-text').textContent();
  expect(recognized?.trim().length).toBeGreaterThan(20);
  await test.info().attach('scan-page-ocr', { body: recognized ?? '', contentType: 'text/plain' });
  await page.locator('[data-ocr-page="1"] .pdf-ocr-warning button').click();
  await expect(page.getByLabel('Current PDF page')).toContainText(/1 \/ \d+/);
  await expect(page.locator('.pdf-canvas').first()).toBeVisible();
});

test('keeps several body pages of the supplied text PDF readable without OCR', async ({ page }) => {
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

test('runs a bounded OCR slice on body pages of the supplied scan', async ({ page }) => {
  test.skip(!scanPdf, 'Set PDF_QA_SCAN_PATH to run the local sample');
  test.setTimeout(240_000);
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(scanPdf!);
  await expect(page.locator('.pdf-queue-status')).toHaveCount(0, { timeout: 120_000 });
  await page.locator('.pdf-reading-options-toggle').click();
  await page.getByRole('menuitem', { name: 'OCR 3 trang tiếp' }).click();
  await expect(page.locator('.pdf-queue-status')).toContainText('Không có trang scan cần OCR');
  await page.getByRole('button', { name: 'Reading', exact: true }).click();
  await expect(page.locator('.pdf-ocr-page').first()).toBeVisible();
  await expect(page.locator('.pdf-ocr-page')).toHaveCount(7);
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await expect(page.locator('.pdf-canvas').first()).toBeVisible();
});
