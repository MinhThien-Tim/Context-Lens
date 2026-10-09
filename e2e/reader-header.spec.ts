import { test, expect } from '@playwright/test';
import { pdfFixture } from './pdfFixture';
import { modeControl } from './readerNames';
import { waitForReaderSurface } from './readerO';

test.describe('HDR-1 — Header item sets per band', () => {
  test('Header owns exactly the per-band item sets: mobile Back · title · mode control; desktop the full HDR-1 list @HDR-1 @pdf', async ({ page }) => {
    // mobile
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('input[type=file]').setInputFiles({ name: 'hdr1.pdf', mimeType: 'application/pdf', buffer: pdfFixture(1) });
    await waitForReaderSurface(page);

    const header = page.locator('.reader-header');
    await expect(header.getByRole('button', { name: /Back/i })).toBeVisible();
    await expect(header.locator('.reader-document h1')).toBeVisible();
    await expect(header.locator('.pdf-mode-switch')).toBeVisible();

    // desktop
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.reload();
    await page.locator('input[type=file]').setInputFiles({ name: 'hdr1b.pdf', mimeType: 'application/pdf', buffer: pdfFixture(2) });
    await waitForReaderSurface(page);
    await expect(header.locator('.pdf-mode-switch')).toBeVisible();
  });
});

test.describe('HDR-2 — Title ellipsis at narrow widths', () => {
  test('Title shows the trimmed, ellipsized document name with the full name in title attribute @HDR-2 @pdf', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await page.locator('input[type=file]').setInputFiles({ name: 'hdr2.pdf', mimeType: 'application/pdf', buffer: pdfFixture(1) });
    await waitForReaderSurface(page);

    const title = page.locator('.reader-header .reader-document h1');
    await expect(title).toBeVisible();
    const titleAttr = await title.getAttribute('title');
    expect(titleAttr).toBeTruthy();
    const text = await title.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
    // HDR-2: the title is not interactive on mobile. FILE-1 makes it the desktop File-switcher
    // trigger at >=1024px; until P2c it carries no activation affordance at any band.
    await expect(title).not.toHaveAttribute('role', 'button');
    await expect(title).not.toHaveAttribute('tabindex', /\S/);
    expect(await title.evaluate(el => el.closest('button, a, [role="button"]'))).toBeNull();
  });
});

test.describe('HDR-3 — Desktop Header constraints', () => {
  for (const width of [1024, 1280] as const) {
    test(`Desktop Header never contains Search, FAB, Notes, Print, Markup-dialog, prev/next, page number or a second mode bar at ${width}px @HDR-3 @pdf`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await page.locator('input[type=file]').setInputFiles({ name: 'hdr3.pdf', mimeType: 'application/pdf', buffer: pdfFixture(2) });
      await waitForReaderSurface(page);

      const header = page.locator('.reader-header');
      await expect(header.getByRole('button', { name: 'Search', exact: true })).toHaveCount(0);
      await expect(header.getByRole('button', { name: 'Notes', exact: true })).toHaveCount(0);
      await expect(header.getByRole('button', { name: 'Print', exact: true })).toHaveCount(0);
      await expect(header.getByRole('button', { name: 'Previous page', exact: true })).toHaveCount(0);
      await expect(header.getByRole('button', { name: 'Next page', exact: true })).toHaveCount(0);
      await expect(header.getByRole('button', { name: 'Current PDF page', exact: true })).toHaveCount(0);
    });
  }
});
