import { test, expect } from '@playwright/test';
import { pdfFixture } from './pdfFixture';

test('Original PDF default page matches native mobile DPR within the pixel budget @pdf', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile-chromium');
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'native-dpr.pdf', mimeType: 'application/pdf', buffer: pdfFixture(8) });
  await page.getByRole('button', { name: 'Original', exact: true }).first().click();
  await expect(page.locator('[data-pdf-page="1"] .pdf-canvas')).toBeVisible();
  const result = await page.locator('[data-pdf-page="1"] .pdf-canvas').evaluate(element => {
    const canvas = element as HTMLCanvasElement;
    return { dpr: devicePixelRatio, cssWidth: canvas.getBoundingClientRect().width, backingWidth: canvas.width,
      pixels: canvas.width * canvas.height };
  });
  console.log('native mobile dpr', JSON.stringify(result));
  expect(result.backingWidth / result.cssWidth).toBeGreaterThan(result.dpr - .05);
  expect(result.pixels).toBeLessThanOrEqual(20_000_000);
  const wordSpan = page.locator('[data-pdf-page="1"] .pdf-text-layer span').filter({ hasText: 'Paragraph 3 on page 1' });
  await expect(wordSpan).toBeVisible();
  const word = await wordSpan.evaluate(element => {
    const node = element.firstChild!, start = node.textContent!.indexOf('Paragraph');
    const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + 9);
    const rect = range.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: word.x, y: word.y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.lookup-sheet')).toContainText('Paragraph');
  await page.locator('.lookup-sheet').getByRole('button', { name: 'Close meaning' }).click();
  await page.getByRole('button', { name: 'PDF options' }).click();
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'PDF options' }).click();
  const zoomed = await page.locator('[data-pdf-page="1"] .pdf-canvas').evaluate(element => {
    const canvas = element as HTMLCanvasElement;
    return { dpr: devicePixelRatio, cssWidth: canvas.getBoundingClientRect().width, backingWidth: canvas.width,
      pixels: canvas.width * canvas.height };
  });
  console.log('native mobile zoomed', JSON.stringify(zoomed));
  expect(zoomed.backingWidth / zoomed.cssWidth).toBeGreaterThan(zoomed.dpr - .05);
  expect(zoomed.pixels).toBeLessThanOrEqual(20_000_000);
});
