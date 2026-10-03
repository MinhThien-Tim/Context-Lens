import { test, expect } from '@playwright/test';
import { pdfFixture } from './pdfFixture';

test('Original PDF reclaims mobile header space without a toolbar gap', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'chrome.pdf', mimeType: 'application/pdf', buffer: pdfFixture(8) });
  // On mobile, mode switch is a button in header with aria-label
  await page.getByRole('button', { name: /Switch to Reading mode|Switch to Original mode/ }).click();
  await expect(page.locator('.pdf-page-slot').first()).toBeVisible();

  for (const [width, height] of [[320, 700], [360, 780], [390, 844], [393, 852], [430, 932], [640, 360]]) {
    await page.setViewportSize({ width, height });
    await page.locator('.reader-shell').evaluate(el => el.classList.remove('chrome-quiet'));
    await page.waitForTimeout(150);
    const geometry = () => page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const header = rect('.reader-header');
      const viewport = rect('.reader-viewport');
      const scroll = rect('.pdf-scroll');
      const pageSlot = rect('.pdf-page-slot');
      const footer = rect('.reader-progress');
      return { headerBottom: header.bottom, viewportTop: viewport.top, scrollTop: scroll.top,
        scrollBottom: scroll.bottom, pageTop: pageSlot.top, footerTop: footer.top,
        page: document.querySelector('[aria-label="Current PDF page"]')?.textContent,
        percent: document.querySelector('.reading-progress-track')?.getAttribute('aria-valuenow'),
        documentOverflowX: document.documentElement.scrollWidth > innerWidth,
        documentOverflowY: document.documentElement.scrollHeight > innerHeight };
    });
    const visible = await geometry();
    expect(visible.viewportTop).toBeCloseTo(visible.headerBottom, 0);
    expect(visible.scrollTop).toBeCloseTo(visible.headerBottom, 0);
    expect(visible.pageTop - visible.scrollTop).toBeLessThanOrEqual(5);
    expect(visible.scrollBottom).toBeLessThanOrEqual(height + 1);
    expect(visible.documentOverflowX).toBe(false);
    expect(visible.documentOverflowY).toBe(false);
    await page.locator('.reader-shell').evaluate(el => el.classList.add('chrome-quiet'));
    const hidden = await geometry();
    // Stable-viewport contract: hiding chrome must not move or resize the reading box.
    expect(hidden.viewportTop).toBeCloseTo(visible.viewportTop, 0);
    expect(hidden.scrollTop).toBeCloseTo(visible.scrollTop, 0);
    expect(hidden.pageTop - hidden.scrollTop).toBeCloseTo(visible.pageTop - visible.scrollTop, 0);
    expect(hidden.scrollBottom).toBeLessThanOrEqual(height + 1);
    expect(hidden.documentOverflowX).toBe(false);
    expect(hidden.documentOverflowY).toBe(false);
    expect(hidden.page).toBe(visible.page);
    expect(hidden.percent).toBe(visible.percent);
    expect(hidden.footerTop).toBe(visible.footerTop);
    await page.locator('.reader-shell').evaluate(el => el.classList.remove('chrome-quiet'));
    const restored = await geometry();
    expect(restored.viewportTop).toBeCloseTo(visible.viewportTop, 0);
    expect(restored.scrollTop).toBeCloseTo(visible.scrollTop, 0);
    expect(restored.pageTop - restored.scrollTop).toBeLessThanOrEqual(5);
    expect(restored.page).toBe(visible.page);
    expect(restored.percent).toBe(visible.percent);
    // The last page must still be fully reachable with chrome revealed.
    await page.locator('.pdf-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
    const atBottom = await geometry();
    expect(atBottom.scrollBottom).toBeLessThanOrEqual(height + 1);
    expect(atBottom.documentOverflowY).toBe(false);
  }
});

test('Original mobile Lookup open and close do not move the PDF reading position', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'lookup-jump.pdf', mimeType: 'application/pdf', buffer: pdfFixture(8) });
  // On mobile, mode switch is a button in header with aria-label
  await page.getByRole('button', { name: /Switch to Reading mode|Switch to Original mode/ }).click();
  await expect(page.locator('.pdf-page-slot').first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });

  const scroll = page.locator('.pdf-scroll');
  await scroll.evaluate(el => { el.scrollTop = 0; });
  await page.waitForTimeout(200);
  await expect(page.locator('.pdf-page-slot[data-pdf-page="1"]')).toBeVisible();

  // `controlsLocked` reveals the chrome when Lookup opens; the reading box must not follow it.
  const position = () => page.evaluate(() => {
    const slot = document.querySelector('.pdf-page-slot')!.getBoundingClientRect();
    return {
      viewportTop: document.querySelector('.reader-viewport')!.getBoundingClientRect().top,
      viewportHeight: document.querySelector('.reader-viewport')!.getBoundingClientRect().height,
      scrollTop: (document.querySelector('.pdf-scroll') as HTMLElement).scrollTop,
      slotTop: slot.top,
      page: document.querySelector('[aria-label="Current PDF page"]')?.textContent,
      percent: document.querySelector('.reading-progress-track')?.getAttribute('aria-valuenow'),
    };
  });

  const before = await position();
  // Mobile Chromium has no real selection from a synthetic drag, so drive the
  // same single-word click-lookup path `pdf-click-mobile.spec.ts` covers.
  const span = page.locator('.pdf-page-slot[data-pdf-page="1"] .pdf-text-layer span').filter({ hasText: 'The decision had surprised many voters.' });
  await expect(span).toBeVisible();
  const word = await span.evaluate(el => {
    const node = el.firstChild!, value = node.textContent ?? '', from = value.indexOf('decision');
    const range = document.createRange(); range.setStart(node, from); range.setEnd(node, from + 'decision'.length);
    const rect = range.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: word.x, y: word.y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  await expect(page.locator('.lookup-sheet')).toBeVisible();
  const opened = await position();
  expect(opened.viewportTop).toBeCloseTo(before.viewportTop, 0);
  expect(opened.viewportHeight).toBeCloseTo(before.viewportHeight, 0);
  expect(opened.scrollTop).toBe(before.scrollTop);
  expect(opened.slotTop).toBeCloseTo(before.slotTop, 0);
  expect(opened.page).toBe(before.page);
  expect(opened.percent).toBe(before.percent);

  await page.locator('.lookup-sheet').getByRole('button', { name: 'Close meaning' }).click();
  await expect(page.locator('.lookup-sheet')).toBeHidden();
  const closed = await position();
  expect(closed.viewportTop).toBeCloseTo(before.viewportTop, 0);
  expect(closed.viewportHeight).toBeCloseTo(before.viewportHeight, 0);
  expect(closed.scrollTop).toBe(before.scrollTop);
  expect(closed.slotTop).toBeCloseTo(before.slotTop, 0);
  expect(closed.page).toBe(before.page);
  expect(closed.percent).toBe(before.percent);
});
