import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { pdfFixture } from './pdfFixture';

async function openPdf(page: Page, count = 64) {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'stability-fixture.pdf', mimeType: 'application/pdf', buffer: pdfFixture(count) });
  await expect(page.getByRole('button', { name: 'Original', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Original', exact: true }).first().click();
  await expect(page.locator('.pdf-text-layer').first().locator('span').first()).toBeVisible();
}

async function selectPhrase(page: Page, reverse = false) {
  const span = page.locator('.pdf-page-slot[data-pdf-page="1"] .pdf-text-layer span').filter({ hasText: 'The decision had surprised many voters.' });
  const box = await span.boundingBox();
  expect(box?.height).toBeGreaterThan(5);
  const start = { x: box!.x + 1, y: box!.y + box!.height / 2 };
  const end = { x: box!.x + box!.width - 1, y: start.y };
  if (test.info().project.use.isMobile) {
    // Dispatch a browser-level hold. Chromium may expose native selection; when it
    // does not, this exercises the same coordinate fallback available to users.
    const word = await span.evaluate(el => {
      const node = el.firstChild!, value = node.textContent ?? '';
      const from = value.indexOf('decision'), range = document.createRange();
      range.setStart(node, from); range.setEnd(node, from + 'decision'.length);
      const rect = range.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: word.x, y: word.y }] });
    await page.waitForTimeout(750);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move((reverse ? end : start).x, start.y);
    await page.mouse.down();
    await page.mouse.move((reverse ? start : end).x, end.y, { steps: 12 });
    await page.mouse.up();
  }
  await expect(page.getByRole('toolbar', { name: 'Selected text actions' })).toBeVisible();
  if (!test.info().project.use.isMobile) expect(await page.evaluate(() => window.getSelection()?.toString())).toContain('decision');
}

async function selectAcrossSpans(page: Page) {
  const first = page.locator('.pdf-page-slot[data-pdf-page="1"] .pdf-text-layer span').filter({ hasText: 'The decision had surprised' });
  const last = page.locator('.pdf-page-slot[data-pdf-page="1"] .pdf-text-layer span').filter({ hasText: 'The government struggled' });
  const [from, to] = await Promise.all([first.boundingBox(), last.boundingBox()]);
  expect(from).not.toBeNull(); expect(to).not.toBeNull();
  await page.mouse.move(from!.x + 1, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + to!.width - 1, to!.y + to!.height / 2, { steps: 20 });
  await page.mouse.up();
  await expect(page.getByRole('toolbar', { name: 'Selected text actions' })).toBeVisible();
}

test('native forward/reverse selection, Explain, Highlight restore, Note and Copy', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await openPdf(page, 3);
  for (const reverse of [false, true]) {
    await selectPhrase(page, reverse);
    await page.getByRole('button', { name: 'Close selection actions' }).click();
  }
  await selectPhrase(page);
  await page.getByRole('button', { name: 'Highlight', exact: true }).click();
  await expect(page.locator('.pdf-saved-highlight').first()).toBeVisible();
  await selectPhrase(page);
  await page.getByRole('button', { name: 'Explain', exact: true }).click();
  await expect(page.locator('.lookup-sheet,.context-panel')).toBeVisible();
  await expect(page.locator('.lookup-sheet')).toContainText('decision');
  await page.screenshot({ path: `tmp/pdf-${info.project.name}-lookup.png` });
  await page.locator('.lookup-sheet').getByRole('button', { name: 'Close meaning' }).click();
  await selectPhrase(page);
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('decision');
  await page.getByRole('toolbar', { name: 'Selected text actions' }).getByRole('button', { name: 'Note', exact: true }).click();
  await expect(page.locator('.note-selection')).toContainText('decision');
  await page.getByRole('textbox', { name: 'New note' }).fill('PDF stability regression note');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.locator('.notes-list')).toContainText('PDF stability regression note');
  await page.getByRole('button', { name: 'Go to location', exact: true }).click();
  await expect(page.locator('.pdf-scroll')).toBeVisible();
  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.locator('.recent-item').filter({ hasText: 'stability-fixture' }).click();
  await expect(page.locator('.pdf-saved-highlight').first()).toBeVisible();
  await selectPhrase(page);
  expect(errors).toEqual([]);
});

test('50-page scroll has bounded canvases and no passive programmatic scrolls', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const metrics = { writes: 0, scrollCommands: 0, longTasks: 0, longTaskMs: 0 };
    Object.assign(window, { pdfQa: metrics });
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, ...args) { if (this.name === 'documents' && value?.location) metrics.writes++; return put.call(this, value, ...args); };
    const property = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!;
    Object.defineProperty(Element.prototype, 'scrollTop', { ...property, set(value) { metrics.scrollCommands++; property.set!.call(this, value); } });
    const into = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function(...args) { metrics.scrollCommands++; return into.apply(this, args); };
    new PerformanceObserver(list => { for (const entry of list.getEntries()) { metrics.longTasks++; metrics.longTaskMs += entry.duration; } }).observe({ type: 'longtask', buffered: true });
  });
  await openPdf(page);
  const samples: unknown[] = [];
  const cdp = await page.context().newCDPSession(page);
  const sample = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    return page.evaluate(() => ({ ...((window as any).pdfQa), heap: (performance as any).memory?.usedJSHeapSize, canvases: document.querySelectorAll('.pdf-canvas').length, pixels: Array.from(document.querySelectorAll<HTMLCanvasElement>('.pdf-canvas')).map(c => c.width * c.height), top: document.querySelector('.pdf-scroll')!.scrollTop, page: document.querySelector('[aria-label="Current PDF page"]')?.textContent }));
  };
  await page.waitForTimeout(600); samples.push(await sample());
  const initialCommands = (samples[0] as any).scrollCommands;
  for (const direction of [1, -1]) {
    for (let n = 0; n < 55; n++) {
      // Wheel input, rather than setting scrollTop, exercises passive browser scrolling.
      await page.locator('.pdf-scroll').hover();
      const height = await page.locator('.pdf-page-slot').first().evaluate(el => el.getBoundingClientRect().height + 18);
      await page.mouse.wheel(0, direction * height);
      await page.waitForTimeout(80);
      if (!process.env.QA_BASELINE) expect(await page.locator('.pdf-canvas').count()).toBeLessThanOrEqual(3);
      if (n % 10 === 0) samples.push(await sample());
    }
  }
  await page.waitForTimeout(600); samples.push(await sample());
  await info.attach('metrics', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' });
  if (process.env.QA_BASELINE) return;
  expect(Math.max(...(samples as any[]).map(s => parseInt(s.page)))).toBeGreaterThanOrEqual(50);
  for (const entry of samples as any[]) {
    expect(Math.max(...entry.pixels)).toBeLessThanOrEqual(2_000_000);
    expect(entry.scrollCommands).toBe(initialCommands);
  }
  expect(errors).toEqual([]);
  await page.screenshot({ path: `tmp/pdf-${info.project.name}-scroll.png` });
});

test('zoom, links, multiline selection and five mode switches preserve interaction', async ({ page }, info) => {
  await openPdf(page, 8);
  await expect(page.locator('.pdf-annotation-layer a').first()).toHaveAttribute('href', 'https://example.com/');
  if (!info.project.use.isMobile) {
    for (const control of ['Zoom in', 'Zoom out', 'Fit width', 'Fit page']) {
      await page.getByRole('button', { name: control, exact: true }).click();
      await selectPhrase(page);
      await page.getByRole('button', { name: 'Close selection actions' }).click();
    }
  } else {
    for (const control of ['Zoom in', 'Zoom out', 'Fit page', 'Fit width']) {
      await page.getByRole('button', { name: 'PDF options' }).click();
      await page.getByRole('button', { name: control, exact: true }).click();
      await page.getByRole('button', { name: 'PDF options' }).click();
      await selectPhrase(page);
      await page.getByRole('button', { name: 'Close selection actions' }).click();
    }
  }
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(page.getByLabel('Current PDF page')).toHaveText('2 / 8');
    if (info.project.use.isMobile) {
      await page.getByRole('button', { name: 'PDF options' }).click();
      await page.getByRole('button', { name: 'Reading mode', exact: true }).click();
    } else await page.getByRole('button', { name: 'Reading', exact: true }).click();
    await expect(page.locator('.pdf-reading-navigation span')).toHaveText('Page 2 / 8');
    const top = await page.locator('.pdf-reading-scroll').evaluate(el => el.scrollTop);
    await page.waitForTimeout(250);
    expect(await page.locator('.pdf-reading-scroll').evaluate(el => el.scrollTop)).toBe(top);
    await page.getByRole('button', { name: 'Original', exact: true }).first().click();
    await expect(page.getByLabel('Current PDF page')).toHaveText('2 / 8');
    await page.getByRole('button', { name: 'Previous page', exact: true }).click();
    await selectPhrase(page);
    await page.getByRole('button', { name: 'Close selection actions' }).click();
  }
  await selectAcrossSpans(page);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toContain('government');
  await page.getByRole('button', { name: 'Close selection actions' }).click();
  for (let i = 0; i < 10; i++) {
    await selectPhrase(page);
    await page.getByRole('button', { name: 'Explain', exact: true }).click();
    await expect(page.locator('.lookup-sheet')).toContainText('decision');
    await page.locator('.lookup-sheet').getByRole('button', { name: 'Close meaning' }).click();
  }
  expect(await page.locator('.pdf-canvas').count()).toBeLessThanOrEqual(3);
});

test('local complex book imports and scrolls beyond fifty pages', async ({ page }, info) => {
  test.skip(!process.env.QA_BOOK, 'Set QA_BOOK to a locally owned complex PDF; books are not checked in.');
  test.setTimeout(180_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(process.env.QA_BOOK!);
  await expect(page.getByRole('button', { name: 'Original', exact: true }).first()).toBeVisible({ timeout: 90_000 });
  await page.getByRole('button', { name: 'Original', exact: true }).first().click();
  await expect(page.locator('.pdf-canvas').first()).toBeVisible({ timeout: 30_000 });
  const samples = [];
  const cdp = await page.context().newCDPSession(page);
  for (let cycle = 0; cycle < 2; cycle++) {
    for (const direction of [1, -1]) for (let n = 0; n < 55; n++) {
      const height = await page.locator('.pdf-page-slot').first().evaluate(el => el.getBoundingClientRect().height + 18);
      await page.locator('.pdf-scroll').hover(); await page.mouse.wheel(0, direction * height); await page.waitForTimeout(70);
      expect(await page.locator('.pdf-canvas').count()).toBeLessThanOrEqual(3);
      if (n % 10 === 0) {
        await cdp.send('HeapProfiler.collectGarbage');
        samples.push({ ...(await cdp.send('Runtime.getHeapUsage')), ...(await cdp.send('Memory.getDOMCounters')), ...(await page.evaluate(() => ({ heap: (performance as any).memory?.usedJSHeapSize, page: document.querySelector('[aria-label="Current PDF page"]')?.textContent, pixels: Array.from(document.querySelectorAll<HTMLCanvasElement>('.pdf-canvas')).map(c => c.width * c.height) }))) });
      }
    }
  }
  expect(Math.max(...samples.map(s => parseInt(s.page ?? '0')))).toBeGreaterThanOrEqual(50);
  if (process.env.QA_HEAP_SNAPSHOT) {
    const chunks: string[] = [];
    cdp.on('HeapProfiler.addHeapSnapshotChunk', ({ chunk }) => chunks.push(chunk));
    await cdp.send('HeapProfiler.takeHeapSnapshot');
    writeFileSync('tmp/pdf-final.heapsnapshot', chunks.join(''));
    console.log(await page.evaluate(() => ({ styles: document.querySelectorAll('style').length, canvases: document.querySelectorAll('canvas').length, filters: document.querySelectorAll('filter').length, fonts: ((document as any).fonts?.size ?? 0), elements: document.querySelectorAll('*').length })));
  }
  await info.attach('complex-book-metrics', { body: JSON.stringify(samples), contentType: 'application/json' });
  expect(errors).toEqual([]);
  await page.screenshot({ path: `tmp/pdf-${info.project.name}-complex-book.png` });
});

test('Contents issues one jump in each mode', async ({ page }, info) => {
  await openPdf(page, 8);
  await page.evaluate(() => {
    (window as any).navigationWrites = 0;
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!;
    Object.defineProperty(Element.prototype, 'scrollTop', { ...descriptor, set(value) { if (this.matches('.pdf-scroll,.pdf-reading-scroll')) (window as any).navigationWrites++; descriptor.set!.call(this, value); } });
  });
  for (const mode of ['original', 'reading']) {
    if (mode === 'reading') {
      if (info.project.use.isMobile) { await page.getByRole('button', { name: 'PDF options' }).click(); await page.getByRole('button', { name: 'Reading mode', exact: true }).click(); }
      else await page.getByRole('button', { name: 'Reading', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Contents', exact: true }).click();
    await expect(page.locator('.contents-item')).toHaveText('Chapter 3p. 3');
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => (window as any).navigationWrites);
    await page.locator('.contents-item').click();
    await expect(mode === 'original' ? page.getByLabel('Current PDF page') : page.locator('.pdf-reading-navigation span')).toContainText('3 / 8');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as any).navigationWrites)).toBe(before + 1);
    if (!info.project.use.isMobile) await page.locator('.contents-panel').getByRole('button', { name: 'Close', exact: true }).click();
  }
});
