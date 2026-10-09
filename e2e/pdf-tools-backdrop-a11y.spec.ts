/**
 * §15.x / accessibility — a modal backdrop is decorative.
 *
 * The document-tools backdrop (`src/reader/pdf/PdfModeSwitch.tsx`) used to share the
 * `Close document tools` accessible name with the dialog's real close button. On the
 * mobile band that made `getByRole('button', { name: 'Close document tools' })` resolve to
 * 2 elements and hard-failed every spec that closed the sheet (e2e/pdf-ocr.spec.ts,
  * e2e/pdf-ocr-raster.spec.ts).
 *
 * The backdrop is now `aria-hidden` and out of the tab order: it is a click-to-dismiss
 * surface, not a control a keyboard or screen-reader user needs to reach, because the
 * dialog's own close button and Escape already cover dismissal. Exactly ONE element may
 * carry that accessible name.
 *
 * Execution tier: fast — no OCR, no network, fixture-generated PDF.
 *   npx playwright test --config playwright.tiers.config.ts e2e/pdf-tools-backdrop-a11y.spec.ts
 */
import { test, expect } from '@playwright/test';
import { pdfFixture } from './pdfFixture';

test('§15.x: only the dialog close button is exposed, the backdrop is decorative @pdf', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'backdrop.pdf', mimeType: 'application/pdf', buffer: pdfFixture(3) });

  await page.getByRole('button', { name: 'Reader menu' }).click();
  await page.getByRole('menuitem', { name: 'Document', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: /Document tools|Công cụ/ });
  await expect(dialog).toBeVisible();

  // The regression: the backdrop used to be a second `Close document tools` button.
  await expect(page.getByRole('button', { name: 'Close document tools', exact: true })).toHaveCount(1);

  // The backdrop still exists as a dismiss surface, it is just no longer exposed.
  await expect(page.locator('.pdf-tools-backdrop')).toHaveCount(1);

  // And the one exposed element really closes the dialog.
  await page.getByRole('button', { name: 'Close document tools', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});