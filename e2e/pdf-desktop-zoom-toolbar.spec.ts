import { test, expect } from '@playwright/test';
import { pdfFixture } from './pdfFixture';
import { useInterfaceMode } from './interfaceMode';

for (const mode of ['simple', 'advanced'] as const) test(`desktop ${mode} exposes direct PDF zoom controls`, async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto('/');
  await useInterfaceMode(page, mode);
  await page.locator('input[type=file]').setInputFiles({ name: 'zoom-toolbar.pdf', mimeType: 'application/pdf', buffer: pdfFixture(2) });
  await page.getByRole('button', { name: 'Original', exact: true }).first().click();
  await expect(page.locator('[data-pdf-page="1"] .pdf-canvas')).toBeVisible();

  const toolbar = page.locator('.pdf-toolbar');
  const out = toolbar.getByRole('button', { name: 'Zoom out' });
  const presets = toolbar.getByRole('button', { name: 'PDF zoom presets' });
  const zoomIn = toolbar.getByRole('button', { name: 'Zoom in' });
  await expect(out).toBeVisible();
  await expect(presets).toHaveText(/^\d+%$/);
  await expect(zoomIn).toBeVisible();
  const boxes = await Promise.all([out, presets, zoomIn].map(control => control.boundingBox()));
  expect(boxes.every(box => box && box.x >= 0 && box.x + box.width <= 1024)).toBe(true);
  expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x);
  expect(boxes[1]!.x).toBeLessThan(boxes[2]!.x);

  const initial = Number((await presets.textContent())!.replace('%', ''));
  await zoomIn.click();
  await expect.poll(async () => Number((await presets.textContent())!.replace('%', ''))).toBeGreaterThan(initial);
  const increased = Number((await presets.textContent())!.replace('%', ''));
  await out.click();
  await expect.poll(async () => Number((await presets.textContent())!.replace('%', ''))).toBeLessThan(increased);

  for (const option of ['Fit width', 'Fit page', 'Default']) {
    await presets.click();
    await expect(presets).toHaveAttribute('aria-expanded', 'true');
    await toolbar.getByRole('button', { name: option, exact: true }).click();
    await expect(presets).toHaveAttribute('aria-expanded', 'false');
    await expect(presets).toHaveText(/^\d+%$/);
  }
  await presets.click();
  await page.keyboard.press('Escape');
  await expect(presets).toHaveAttribute('aria-expanded', 'false');
  await expect(presets).toBeFocused();
});
