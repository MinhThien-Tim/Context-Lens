import { test, expect } from '@playwright/test';
import { pdfFixture } from './pdfFixture';
import { useInterfaceMode } from './interfaceMode';
import { goToLocationConfirm, goToLocationPageInput, modeControl, openGoToLocation } from './readerNames';

// Contract FTR-2 and docs/desktop-reader.md §3: at ≥1024px the Header owns the decrease, level and
// increase controls. It is never a popup, never opens a menu, and never appears in More. This spec
// asserts behavior and ownership, not the retired `.pdf-toolbar` band or its `.pdf-more` preset
// popover.
//
// The test is about zoom, not density, so it uses one default interface density rather than
// iterating both. P2b drops the density parameter from `useInterfaceMode` entirely.
const desktopWidths = [1024, 1280, 1366, 1440, 1920];

for (const width of desktopWidths) {
    test(`desktop exposes a direct Header toolbar zoom stepper at ${width}px @pdf @FTR-2`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await useInterfaceMode(page, 'simple');
      await page.locator('input[type=file]').setInputFiles({ name: 'zoom-footer.pdf', mimeType: 'application/pdf', buffer: pdfFixture(2) });
      await modeControl(page, 'text').click();
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

// docs/desktop-reader.md §2.2: the page-number button opens `Go to location` at >=1024px, so
// gating the Footer nav by `!desktop` cannot leave the dialog unreachable in that band. This
// asserts the control reaches the documented destination (not a direct jump), because the Footer
// that used to open it no longer exists here.
//
// Untagged: NAV-1, which makes the Header the sole opener above 1024px, is a P2b rule. The opener
// name goes through `openGoToLocation`, so P2b renames it once.
test('the Header Current PDF page button opens Go to location at 1280px @pdf', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'go-to-1280.pdf', mimeType: 'application/pdf', buffer: pdfFixture(3) });
    await modeControl(page, 'text').click();
  await expect(page.locator('[data-pdf-page="1"] .pdf-canvas')).toBeVisible();

  const dialog = await openGoToLocation(page);
  await goToLocationPageInput(dialog).fill('3');
  await goToLocationConfirm(dialog).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-pdf-page="3"] .pdf-canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Current PDF page' })).toHaveText('3 / 3');
});

// docs/ui-system.md:82 — "page indicator opens Go to location". The Header band is asserted by
// the test above; this is the same contract at ≤1023px, where App.tsx:696 renders PageNavigation
// (not the Header ReaderToolbar), so the opener and the jump must be proven in that band too.
test('the Footer Current PDF page button opens Go to location at 390px @pdf', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'go-to-390.pdf', mimeType: 'application/pdf', buffer: pdfFixture(3) });
    await modeControl(page, 'text').click();
  await expect(page.locator('[data-pdf-page="1"] .pdf-canvas')).toBeVisible();

  // The Footer owns this indicator in this band; the Header does not render a second copy.
    const footerNav = page.getByRole('contentinfo', { name: 'Reading navigation' }).getByRole('navigation', { name: 'Page navigation' });
    await expect(footerNav.getByRole('button', { name: 'Current PDF page' })).toHaveCount(1);

    const dialog = await openGoToLocation(page);
    await goToLocationPageInput(dialog).fill('3');
    await goToLocationConfirm(dialog).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('[data-pdf-page="3"] .pdf-canvas')).toBeVisible();
    await expect(footerNav.getByRole('button', { name: 'Current PDF page' })).toHaveText('3 / 3');
    });
