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
    test(`desktop ${mode} exposes a direct Header toolbar zoom stepper at ${width}px`, async ({ page }) => {
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

      // Verify selector has the expected options
      await expect(zoomSelector.locator('option')).toHaveCount(5);
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

      // Initial value should be "auto" (fit-width) or a percentage
      const initialValue = await zoomSelector.inputValue();
      expect(['auto', '75', '100', '125', '150']).toContain(initialValue);

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
test('mobile keeps the same direct Footer zoom stepper', async ({ page }) => {
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
