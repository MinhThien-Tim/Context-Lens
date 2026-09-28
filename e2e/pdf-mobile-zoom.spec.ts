import { test, expect } from '@playwright/test';
import { pdfFixture } from './pdfFixture';

test('Original mobile zoom preserves reading and selection geometry', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'mobile-zoom.pdf', mimeType: 'application/pdf', buffer: pdfFixture(8) });
  await page.locator('.pdf-mode-switch').getByRole('button', { name: /Original|Trang gốc/ }).click();
  const slot = page.locator('[data-pdf-page="1"]');
  const width = () => slot.evaluate(el => el.getBoundingClientRect().width);
  await expect(page.locator('.pdf-text-layer span').first()).toBeVisible();
  await page.getByRole('button', { name: 'PDF options' }).click();
  await page.getByRole('button', { name: 'Fit width', exact: true }).click();
  const fitted = await width();
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect.poll(width).toBeLessThan(fitted);
  const smaller = await width();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(width).toBeGreaterThan(smaller);
  await page.getByRole('button', { name: 'Fit page', exact: true }).click();
  expect(await slot.evaluate(el => el.getBoundingClientRect().height)).toBeLessThanOrEqual(await page.locator('.pdf-scroll').evaluate(el => el.clientHeight));
  await page.getByRole('button', { name: 'Fit width', exact: true }).click();
  await page.getByRole('button', { name: 'PDF options' }).click();
  await page.getByRole('button', { name: 'Current PDF page', exact: true }).click();
  await page.getByRole('dialog', { name: 'Go to location', exact: true }).getByRole('spinbutton').fill('3');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  const position = page.getByRole('button', { name: 'Current PDF page', exact: true });
  await expect(position).toHaveText('3 / 8');
  for (const viewport of [{ width: 320, height: 850 }, { width: 850, height: 393 }, { width: 393, height: 850 }]) {
    await page.setViewportSize(viewport);
    await expect(position).toHaveText('3 / 8');
    expect(await page.locator('.pdf-canvas').count()).toBeLessThanOrEqual(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  for (const zoom of ['Fit width', 'Zoom in']) {
    await page.getByRole('button', { name: 'PDF options' }).click();
    await page.getByRole('button', { name: zoom, exact: true }).click();
    await page.getByRole('button', { name: 'PDF options' }).click();
    const text = page.locator('[data-pdf-page="3"] .pdf-text-layer span').filter({ hasText: 'The decision' }).first();
    await expect(text).toBeVisible();
    await text.evaluate(el => {
      const range = document.createRange(); range.setStart(el.firstChild!, 4); range.setEnd(el.firstChild!, 12);
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await expect(page.getByRole('toolbar', { name: 'Selected text actions' })).toBeVisible();
    const scroll = page.locator('.pdf-scroll');
    const before = await scroll.evaluate(el => el.scrollTop);
    await page.getByRole('button', { name: 'Close selection actions' }).click();
    expect(await scroll.evaluate(el => el.scrollTop)).toBe(before);
    await expect(position).toHaveText('3 / 8');
  }
  await page.getByRole('button', { name: 'PDF options' }).click();
  for (let n = 0; n < 20; n++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'PDF options' }).click();
  await expect.poll(() => page.locator('[data-pdf-page="3"]').evaluate(el => el.getBoundingClientRect().width)).toBeCloseTo(612 * 3, 0);
  const pan = await page.locator('.pdf-scroll').evaluate(el => {
    const top = el.scrollTop; el.scrollLeft = el.scrollWidth;
    const right = el.scrollLeft; el.scrollLeft = 0;
    return { top, after: el.scrollTop, right, left: el.scrollLeft };
  });
  expect(pan.right).toBeGreaterThan(0); expect(pan.left).toBe(0); expect(pan.after).toBe(pan.top);
  await expect(position).toHaveText('3 / 8');
  expect(await page.locator('.pdf-canvas').count()).toBeLessThanOrEqual(3);
  for (const size of await page.locator('.pdf-canvas').evaluateAll(elements => elements.map(el => ({ page: Number(el.closest<HTMLElement>('[data-pdf-page]')?.dataset.pdfPage), width: (el as HTMLCanvasElement).width, height: (el as HTMLCanvasElement).height })))) {
    expect(size.width * size.height).toBeLessThanOrEqual(size.page === 3 ? 20_000_000 : 2_000_000);
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(size.page === 3 ? 8192 : 4096);
  }
  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.locator('.library-open').filter({ hasText: 'mobile-zoom' }).click();
  await expect(position).toHaveText('3 / 8');
});
