import { test, expect } from '@playwright/test';
import { pdfFixture } from './pdfFixture';
test.use({ deviceScaleFactor: 2 });

test('first desktop canvas uses real bounds and dominant DPR before zoom @pdf', async ({ page }) => {
  await page.setViewportSize({ width: 1728, height: 900 });
  await page.goto('/');
  await page.evaluate(() => {
    (window as typeof window & { pdfCanvasSamples?: unknown[] }).pdfCanvasSamples = [];
    new MutationObserver(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-pdf-page="1"] canvas');
      const root = document.querySelector<HTMLElement>('.pdf-scroll');
      if (canvas && root && canvas.style.width && canvas.width > 1) {
        const samples = (window as typeof window & { pdfCanvasSamples: unknown[] }).pdfCanvasSamples;
        const sample = { backing: canvas.width, height: canvas.height, css: canvas.getBoundingClientRect().width, root: root.clientWidth, dpr: devicePixelRatio };
        if (JSON.stringify(samples.at(-1)) !== JSON.stringify(sample)) samples.push(sample);
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['width', 'height', 'style'] });
  });
  await page.locator('input[type=file]').setInputFiles({ name: 'first-render.pdf', mimeType: 'application/pdf', buffer: pdfFixture(4) });
  await page.getByRole('button', { name: 'Original', exact: true }).first().click();
  const canvas = page.locator('[data-pdf-page="1"] canvas');
  await expect.poll(() => canvas.evaluate(el => (el as HTMLCanvasElement).width)).toBeGreaterThan(1800);
  const initial = await canvas.evaluate(el => { const c = el as HTMLCanvasElement; return { backing: c.width, height: c.height, css: c.getBoundingClientRect().width, dpr: devicePixelRatio }; });
  const samples = await page.evaluate(() => (window as typeof window & { pdfCanvasSamples: unknown[] }).pdfCanvasSamples);
  console.log('first-render', JSON.stringify({ initial, samples }));
  expect(initial.backing / initial.css).toBeGreaterThan(initial.dpr - .02);
  expect(initial.backing * initial.height).toBeLessThanOrEqual(20_000_000);
  expect(samples.every((s: any) => s.backing / s.css > s.dpr - .02)).toBe(true);
  const neighborPixels = await page.locator('[data-pdf-page="2"] canvas').evaluate(el => { const c = el as HTMLCanvasElement; return c.width * c.height; });
  expect(neighborPixels).toBeLessThanOrEqual(2_000_000);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(() => canvas.evaluate(el => (el as HTMLCanvasElement).getBoundingClientRect().width)).toBeGreaterThan(initial.css);
  const zoomed = await canvas.evaluate(el => { const c = el as HTMLCanvasElement; return { backing: c.width, height: c.height, css: c.getBoundingClientRect().width, dpr: devicePixelRatio }; });
  console.log('zoomed-render', JSON.stringify(zoomed));
  expect(zoomed.backing * zoomed.height).toBeLessThanOrEqual(20_000_000);
  expect(zoomed.backing / zoomed.css).toBeGreaterThan(1);
});


/**
 * Contract §8.1/§8.2: PDF zoom is a direct Footer control (decrease, level readout, increase) and
 * §8.3 forbids a zoom popup or any menu in the mobile band. Zoom is never reachable from More (§8.3).
 * The Footer must stay usable down to 320px without horizontal overflow (§8.6).
 */
test('mobile Footer keeps a direct zoom stepper operable down to 320px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'footer.pdf', mimeType: 'application/pdf', buffer: pdfFixture(2) });
  await page.getByRole('button', { name: 'Original', exact: true }).first().click();
  for (const width of [320, 360, 390, 393, 430]) {
    await page.setViewportSize({ width, height: 850 });
    await expect(page.getByRole('button', { name: 'Zoom out' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zoom level' })).toBeVisible();
    // §8.3 — the retired mobile zoom popup and More-hosted zoom must both be gone.
    await expect(page.getByRole('button', { name: 'PDF options' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Reader menu', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'Zoom out', exact: true })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Zoom in', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    const layout = await page.evaluate(() => {
      const footer = document.querySelector<HTMLElement>('.reader-progress')!;
      const location = footer.querySelector<HTMLElement>('.reader-progress-location')!;
      const status = footer.querySelector<HTMLElement>('.reader-progress-status')!;
      const a = location.getBoundingClientRect(), b = status.getBoundingClientRect();
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewport: innerWidth,
        sameLine: Math.abs(a.top - b.top) < 3,
        separated: a.right <= b.left + 1,
        inside: b.right <= innerWidth + 1,
        zoomReachable: !!footer.querySelector('[aria-label="Zoom in"]'),
      };
    });
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport);
    expect(layout.sameLine && layout.separated && layout.inside).toBe(true);
    expect(layout.zoomReachable).toBe(true);
    const before = await page.evaluate(() => scrollY);
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.getByRole('button', { name: 'Zoom out' }).click();
    // §8.2 + §13: a zoom change is programmatic movement; it must not move the reader or its chrome.
    expect(await page.evaluate(() => scrollY)).toBe(before);
  }
});

/**
 * §9.3/§9.4 — the §9.3 inventory is reachable exactly once through the single More disclosure,
 * and no §9.3 action is duplicated in the Header or Footer. §9.5 — at 320px the More disclosure is a
 * dismissible bottom sheet with no horizontal overflow.
 */
test('mobile More is the only host of the secondary actions and is a dismissible sheet at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 850 });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Paste and edit formatted text' }).fill(Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1}. A quiet reader gives this passage room to breathe.`).join('\n\n'));
  await page.getByRole('button', { name: /Preview & read/ }).click();
  await expect(page.locator('.reader-text')).toBeVisible();
  const header = page.locator('.reader-header');
  await page.getByRole('button', { name: 'Reader menu', exact: true }).click();
  const sheet = page.getByRole('menu', { name: 'Reader actions' });
  await expect(sheet).toBeVisible();
  for (const action of ['Contents', 'Context', 'Notes', 'Markup', 'Text', 'Languages', 'Document', 'Click lookup']) {
    await expect(sheet.getByRole('menuitem', { name: action, exact: true })).toHaveCount(1);
    await expect(header.getByRole('button', { name: action, exact: true })).toHaveCount(0);
    await expect(page.locator('.reader-progress').getByRole('button', { name: action, exact: true })).toHaveCount(0);
  }
  const sheetBox = await sheet.boundingBox();
  expect(sheetBox!.x).toBeGreaterThanOrEqual(0);
  expect(sheetBox!.x + sheetBox!.width).toBeLessThanOrEqual(321);
  expect(sheetBox!.y + sheetBox!.height).toBeLessThanOrEqual(851);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});