import { test, expect } from '@playwright/test';
import { pdfFixture } from './pdfFixture';
import { modeControl } from './readerNames';

test('visible PDF text, mode return and selection-to-card keep the reading position', async ({ page }, info) => {
  test.skip(!info.project.use.isMobile, 'This regression targets the phone reader.');
  test.setTimeout(60_000);
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(info.project.use.baseURL!).origin ? route.continue() : route.abort());
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'reader-p0.pdf', mimeType: 'application/pdf', buffer: pdfFixture(8) });
  await modeControl(page, 'pdf').click();
  await expect(page.locator('.pdf-text-layer span').first()).toBeVisible();
  const original = page.locator('.pdf-scroll');
  await original.evaluate(root => { root.scrollTop = 350; });
  await original.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.getByLabel('Current PDF page')).toHaveText('1 / 8');
  // Page 1 is still visible above the midpoint; it must retain its text/canvas.
  await expect(page.locator('[data-pdf-page="1"] .pdf-canvas')).toBeVisible();
  const originalTop = await original.evaluate(root => root.scrollTop);
  const pageBefore = await page.getByLabel('Current PDF page').textContent();
  await modeControl(page, 'text').click();
  await expect(page.getByLabel('Current PDF page')).toHaveText(pageBefore!);
  await modeControl(page, 'pdf').click();
  await expect.poll(() => original.evaluate(root => root.scrollTop)).toBeCloseTo(originalTop, 0);
  const originalReturnTop = await original.evaluate(root => root.scrollTop);
  await expect(page.getByLabel('Current PDF page')).toHaveText(pageBefore!);
  expect(await page.locator('.pdf-canvas').count()).toBeLessThanOrEqual(3);

  await modeControl(page, 'text').click();
  await page.evaluate(async () => {
    const path = '/src/lookup/service.ts';
    const { lookupService } = await import(/* @vite-ignore */ path);
    const immediate = lookupService.immediate.bind(lookupService);
    const quick = lookupService.quick.bind(lookupService);
    const metrics = { quickCalls: 0, reusedImmediate: true, tapAt: 0, usefulAt: 0 };
    (window as any).readerP0 = metrics;
    let first: unknown;
    lookupService.immediate = (...args: any[]) => { first = immediate(...args); return first; };
    lookupService.quick = (...args: any[]) => { metrics.quickCalls++; metrics.reusedImmediate &&= args[4] === first; return quick(...args); };
    document.addEventListener('click', event => {
      if ((event.target as Element)?.closest('.pdf-reading-scroll')) { metrics.tapAt = performance.now(); metrics.usefulAt = 0; }
    }, true);
    new MutationObserver(() => {
      if (metrics.tapAt && !metrics.usefulAt && Array.from(document.querySelectorAll('.lookup-sheet .sense-definition,.lookup-sheet .sense-vi,.lookup-sheet .entry-glosses li')).some(el => el.textContent?.trim())) metrics.usefulAt = performance.now();
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  const scroll = page.locator('.pdf-reading-scroll');
  // Construct the native range to exercise the long-press selection handler;
  // OS selection handles themselves require Android hardware verification.
  const paragraph = page.locator('[data-pdf-reading-page="3"] [data-offset]').filter({ hasText: 'The decision had surprised many voters.' }).first();
  await paragraph.evaluate(el => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const from = node.textContent!.indexOf('decision'); if (from < 0) continue;
      const range = document.createRange(); range.setStart(node, from); range.setEnd(node, from + 8);
      const root = el.closest('.pdf-reading-scroll')!;
      root.scrollTop += range.getBoundingClientRect().top - root.getBoundingClientRect().top - 180;
      window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
      document.dispatchEvent(new Event('selectionchange')); break;
    }
  });
  await scroll.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const topBefore = await scroll.evaluate(root => root.scrollTop);
  expect(topBefore).toBeGreaterThan(0);
  const readingPage = await page.getByLabel('Current PDF page').textContent();
  await page.getByRole('toolbar', { name: 'Selected text actions' }).getByRole('button', { name: 'Define', exact: true }).click();
  const sheet = page.locator('.lookup-sheet');
  await expect(sheet).toContainText('decision');
  await expect(sheet.locator('.sense-definition,.sense-vi,.entry-glosses li').first()).toBeVisible();
  const quickHeight = (await sheet.boundingBox())!.height;
  await expect.poll(() => page.evaluate(() => (window as any).readerP0.quickCalls)).toBe(1);
  await sheet.getByRole('button', { name: 'Use Standard Quick card' }).click();
  await expect(sheet).toHaveAttribute('data-quick-mode', 'standard');
  await sheet.getByRole('button', { name: 'Use Simple Quick card' }).click();
  const simpleHeight = (await sheet.boundingBox())!.height;
  await sheet.getByRole('button', { name: 'Show more', exact: true }).click();
  await expect(sheet).toHaveClass(/expanded/);
  const fullHeight = (await sheet.boundingBox())!.height;
  const topWithCard = await scroll.evaluate(root => root.scrollTop);
  expect(topWithCard).toBe(topBefore);
  expect(await page.evaluate(() => (window as any).readerP0.quickCalls)).toBe(1);
  await sheet.getByRole('button', { name: 'Show less', exact: true }).click();
  await sheet.getByRole('button', { name: 'Close meaning', exact: true }).click();
  await expect(page.locator('.pdf-reading-selection-actions')).toHaveCount(0);
  const topAfterClose = await scroll.evaluate(root => root.scrollTop);
  expect(topAfterClose).toBe(topBefore);
  await expect(page.getByLabel('Current PDF page')).toHaveText(readingPage!);
  const point = await paragraph.evaluate(el => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const from = node.textContent!.indexOf('decision'); if (from < 0) continue;
      const range = document.createRange(); range.setStart(node, from); range.setEnd(node, from + 8);
      const rect = range.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    throw new Error('decision text missing');
  });
  await page.touchscreen.tap(point.x, point.y);
  await expect(sheet).toContainText('decision');
  await expect.poll(() => page.evaluate(() => (window as any).readerP0.usefulAt)).toBeGreaterThan(0);
  const measured = await page.evaluate(() => { const m = (window as any).readerP0; return { tapToUsefulMs: m.usefulAt - m.tapAt, reusedImmediate: m.reusedImmediate }; });
  expect(measured.reusedImmediate).toBe(true);
  await sheet.getByRole('button', { name: 'Close meaning', exact: true }).click();
  expect(await scroll.evaluate(root => root.scrollTop)).toBe(topBefore);
  const metrics = { ...measured, originalTop, originalReturnTop, pageBefore, topBefore, topWithCard, topAfterClose, quickHeight, simpleHeight, fullHeight, showMoreQuickCalls: 1 };
  console.log('reader-p0-metrics', JSON.stringify(metrics));
  await info.attach('reader-p0-metrics', { body: JSON.stringify(metrics), contentType: 'application/json' });
});

