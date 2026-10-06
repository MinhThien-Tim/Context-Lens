import { test, expect } from '@playwright/test';
import { pdfFixture } from './pdfFixture';
import { useInterfaceMode } from './interfaceMode';

// Contract §8.2/§8.3 (U3) and docs/desktop-reader.md §3: PDF zoom is a direct Header toolbar control at
// desktop (≥1024px) — decrease, level selector, increase. It is never a popup, never opens a menu, and
// never appears in More. This spec asserts behavior and ownership, not the retired `.pdf-toolbar`
// band or its `.pdf-more` preset popover.
const desktopWidths = [1024, 1280, 1366, 1440, 1920];

for (const mode of ['simple', 'advanced'] as const) {
  for (const width of desktopWidths) {
    test(`desktop ${mode} exposes a direct Header toolbar zoom stepper at ${width}px @pdf`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await useInterfaceMode(page, mode);
      await page.locator('input[type=file]').setInputFiles({ name: 'zoom-footer.pdf', mimeType: 'application/pdf', buffer: pdfFixture(2) });
      await page.getByRole('button', { name: 'Original', exact: true }).first().click();
      await expect(page.locator('[data-pdf-page="1"] .pdf-canvas')).toBeVisible();

      // Ownership: the stepper lives in the Header toolbar band, and the retired toolbar band is gone.
      const header = page.locator('.reader-header');
      const zoomOut = header.getByRole('button', { name: 'Zoom out' });
      const zoomIn = header.getByRole('button', { name: 'Zoom in' });
      const zoomSelector = header.locator('.zoom-selector select');
      await expect(zoomOut).toBeVisible();
      await expect(zoomIn).toBeVisible();
      await expect(zoomSelector).toBeVisible();
      await expect(page.locator('.pdf-toolbar')).toHaveCount(0);
      await expect(page.locator('.pdf-more-menu')).toHaveCount(0);

      // Verify selector has the expected options. §3.1 (docs/desktop-reader.md): the four fixed
      // percentages plus "Automatic" are always present; a sixth entry appears only while the
      // actual scale is off the fixed list, so the count is 5 or 6 and never a blank select.
      await expect.poll(async () => zoomSelector.locator('option').count()).toBeGreaterThanOrEqual(5);
      expect([5, 6]).toContain(await zoomSelector.locator('option').count());
      await expect(zoomSelector.locator('option[value="auto"]')).toHaveText('Automatic');
      await expect(zoomSelector.locator('option[value="75"]')).toHaveText('75%');
      await expect(zoomSelector.locator('option[value="100"]')).toHaveText('100%');
      await expect(zoomSelector.locator('option[value="125"]')).toHaveText('125%');
      await expect(zoomSelector.locator('option[value="150"]')).toHaveText('150%');

      // Stepping changes the level in both directions and stays inside the viewport.
      const boxes = await Promise.all([zoomOut, zoomSelector, zoomIn].map(control => control.boundingBox()));
      expect(boxes.every(box => box && box.x >= 0 && box.x + box.width <= width)).toBe(true);
      expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x);
      expect(boxes[1]!.x).toBeLessThan(boxes[2]!.x);

      // Initial value should be "auto" (fit-width) or a percentage, including a dynamic
      // stepped-to value (§3.1), never an empty string.
      const initialValue = await zoomSelector.inputValue();
      expect(initialValue).not.toBe('');
      expect(initialValue === 'auto' || /^\d+$/.test(initialValue)).toBe(true);

      // Changing zoom via the selector (the primary UI) updates the value
      // Select 150% - this is a discrete option in the selector
      await zoomSelector.selectOption('150');
      await expect.poll(async () => (await zoomSelector.inputValue()) === '150').toBeTruthy();

      // Select 75% - step down via selector
      await zoomSelector.selectOption('75');
      await expect.poll(async () => (await zoomSelector.inputValue()) === '75').toBeTruthy();

      // Select Automatic - returns to fit-width mode
      await zoomSelector.selectOption('auto');
      await expect.poll(async () => (await zoomSelector.inputValue()) === 'auto').toBeTruthy();

      // The stepper never behaves as a disclosure: no expansion, no menu, no preset options.
      await expect(zoomSelector).not.toHaveAttribute('aria-expanded', /.*/);
      await expect(zoomSelector).not.toHaveAttribute('aria-haspopup', /.*/);
      await page.keyboard.press('Escape');
      await expect(page.locator('.pdf-more-menu')).toHaveCount(0);

      // Zoom is never duplicated into More (§8.3/§9.4).
      await header.getByRole('button', { name: 'Reader menu' }).click();
      const menu = page.getByRole('menu', { name: 'Reader actions' });
      await expect(menu).toBeVisible();
      for (const forbidden of ['Zoom in', 'Zoom out', 'Zoom level', 'Fit width', 'Fit page', 'Default']) {
        await expect(menu.getByRole('menuitem', { name: forbidden, exact: true })).toHaveCount(0);
      }
      await page.keyboard.press('Escape');
    });
  }
}

// §8.2 says the Footer owns zoom at mobile density, so the mobile band keeps the same control.
test('mobile keeps the same direct Footer zoom stepper @pdf', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'zoom-footer-mobile.pdf', mimeType: 'application/pdf', buffer: pdfFixture(2) });
  await page.getByRole('button', { name: 'Original', exact: true }).first().click();
  await expect(page.locator('[data-pdf-page="1"] .pdf-canvas')).toBeVisible();

  const footer = page.locator('.reader-progress');
  const level = footer.getByLabel('Zoom level');
  await expect(footer.getByRole('button', { name: 'Zoom out' })).toBeVisible();
  await expect(footer.getByRole('button', { name: 'Zoom in' })).toBeVisible();
  await expect(level).toHaveText(/^\d+%$/);
  await expect(page.locator('.pdf-toolbar')).toHaveCount(0);
});

// docs/desktop-reader.md §2.2: PDF page navigation has exactly one owner per band and the
// page-count control is named `Current PDF page` in both. This is the same single-owner rule
// §3 applies to zoom, asserted for the stepper group, so the Header and the Footer can never
// both answer to `Next page` (the defect that made `getByRole('button', { name: 'Next page' })`
// ambiguous and fail in strict mode).
test('PDF page navigation is owned by the Header alone at 1280px @pdf', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'page-nav-1280.pdf', mimeType: 'application/pdf', buffer: pdfFixture(3) });
  await page.getByRole('button', { name: 'Original', exact: true }).first().click();
  await expect(page.locator('[data-pdf-page="1"] .pdf-canvas')).toBeVisible();

  // Exactly one stepper group, and it is the Header's.
  await expect(page.getByRole('navigation', { name: 'Page navigation' })).toHaveCount(1);
  await expect(page.locator('.reader-header').getByRole('navigation', { name: 'Page navigation' })).toHaveCount(1);
  // One of each control across the whole page: no duplicate answers for a screen reader.
  await expect(page.getByRole('button', { name: 'Next page' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Previous page' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Current PDF page' })).toHaveCount(1);
  // The Footer keeps its own reading navigation (progress/percentage) but no stepper.
  await expect(page.getByRole('contentinfo', { name: 'Reading navigation' })).toBeVisible();
  await expect(page.getByRole('contentinfo', { name: 'Reading navigation' }).getByRole('navigation', { name: 'Page navigation' })).toHaveCount(0);
  await expect(page.getByRole('contentinfo', { name: 'Reading navigation' }).getByRole('button', { name: 'Next page' })).toHaveCount(0);

  // The stable name is the same handle at both bands, and it still shows page/total.
  const pageCount = page.getByRole('button', { name: 'Current PDF page' });
  await expect(pageCount).toHaveText('1 / 3');
  // The full sentence moved to the description rather than being dropped.
  await expect(pageCount).toHaveAttribute('aria-description', 'Page 1 of 3');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(pageCount).toHaveText('2 / 3');
});

// docs/desktop-reader.md §2.2: `Current PDF page` is the sole opener of `Go to location` at >=1024px,
// so gating the Footer nav by `!desktop` cannot leave the dialog unreachable in that band. This
// asserts the control reaches the documented destination (not a direct jump), because the Footer
// that used to open it no longer exists here.
test('the Header Current PDF page button opens Go to location at 1280px @pdf', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'go-to-1280.pdf', mimeType: 'application/pdf', buffer: pdfFixture(3) });
  await page.getByRole('button', { name: 'Original', exact: true }).first().click();
  await expect(page.locator('[data-pdf-page="1"] .pdf-canvas')).toBeVisible();

  await page.getByRole('button', { name: 'Current PDF page' }).click();
  const dialog = page.getByRole('dialog', { name: 'Go to location' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('spinbutton').fill('3');
  await dialog.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-pdf-page="3"] .pdf-canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Current PDF page' })).toHaveText('3 / 3');
});

test('PDF page navigation is owned by the Footer alone at 390px @pdf', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'page-nav-390.pdf', mimeType: 'application/pdf', buffer: pdfFixture(3) });
  await page.getByRole('button', { name: 'Original', exact: true }).first().click();
  await expect(page.locator('[data-pdf-page="1"] .pdf-canvas')).toBeVisible();

  // Exactly one of each, and every one of them is inside the Footer contentinfo region.
  await expect(page.getByRole('button', { name: 'Next page' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Previous page' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Current PDF page' })).toHaveCount(1);
  const footerNav = page.getByRole('contentinfo', { name: 'Reading navigation' }).getByRole('navigation', { name: 'Page navigation' });
  await expect(footerNav).toHaveCount(1);
  await expect(footerNav.getByRole('button', { name: 'Next page' })).toHaveCount(1);
  await expect(footerNav.getByRole('button', { name: 'Current PDF page' })).toHaveCount(1);
  // The Header stepper is absent at this density.
  await expect(page.locator('.reader-header').getByRole('navigation', { name: 'Page navigation' })).toHaveCount(0);
});

// docs/desktop-reader.md §3 and docs/mobile-chrome.md §8.2: zoom has exactly one owner per density
// band, and the Footer owns it only at ≤1023px. App.tsx gates `.pdf-footer-zoom-host` on `!desktop`,
// restoring the contract wording that `40e807d` loosened to "every density".
test('the Footer zoom host exists exactly once at 390px and not at all at 1280px @pdf', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'zoom-owner-390.pdf', mimeType: 'application/pdf', buffer: pdfFixture(2) });
  await page.getByRole('button', { name: 'Original', exact: true }).first().click();
  await expect(page.locator('[data-pdf-page="1"] .pdf-canvas')).toBeVisible();
  await expect(page.locator('.pdf-footer-zoom-host')).toHaveCount(1);
  // One control, not two: the desktop preset <select> must not also be present in this band.
  await expect(page.locator('.reader-header .zoom-selector select')).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('.pdf-footer-zoom-host')).toHaveCount(0);
  await expect(page.locator('.reader-header .zoom-selector select')).toHaveCount(1);
});
