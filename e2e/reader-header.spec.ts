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
    // HDR-1 names the title element `.reader-title`; it is a plain label at this phase (FILE-1 P2c).
    await expect(header.locator('.reader-title')).toBeVisible();
    await expect(header.locator('.pdf-mode-switch')).toBeVisible();
    // Mobile Header owns exactly Back · title · `Text | PDF` — nothing else (HDR-3 asserts absences).
    await expect(header.locator('.pdf-zoom-stepper')).toHaveCount(0);
    await expect(header.getByRole('button', { name: 'Contents', exact: true })).toHaveCount(0);

    // desktop: the full HDR-1 list — Library (Back), title, Text | PDF, zoom, Contents,
    // Highlight/Underline/Erase, `Aa` (Theme), More.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.reload();
    await page.locator('input[type=file]').setInputFiles({ name: 'hdr1b.pdf', mimeType: 'application/pdf', buffer: pdfFixture(2) });
    await waitForReaderSurface(page);
    await expect(header.getByRole('button', { name: 'Back to library' })).toBeVisible();
    await expect(header.locator('.reader-title')).toBeVisible();
    await expect(header.locator('.pdf-mode-switch')).toBeVisible();
    await expect(header.getByRole('group', { name: 'Zoom' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Zoom out' })).toBeVisible();
    await expect(header.getByRole('combobox', { name: 'Zoom level' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Zoom in' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Contents', exact: true })).toBeVisible();
    await expect(header.getByRole('group', { name: 'Markup tools' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Reading settings' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Reader menu' })).toBeVisible();
  });
});

test.describe('HDR-2 — Title ellipsis at narrow widths', () => {
  test('Title shows the trimmed, ellipsized document name with the full name in title attribute @HDR-2 @pdf', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    // The PDF metadata title survives import (fileImport keeps `info.Title`), so the record title
    // carries both the extension and a `: subtitle` — exactly what HDR-2 trims for display.
    await page.locator('input[type=file]').setInputFiles({ name: 'hdr2.pdf', mimeType: 'application/pdf', buffer: pdfFixture(1, 0, 0, { title: 'hdr2.pdf: A subtitle' }) });
    await waitForReaderSurface(page);

    const title = page.locator('.reader-header .reader-title');
    await expect(title).toBeVisible();
    // HDR-2: extension and `: subtitle` trimmed from the label, full title kept in `title`.
    await expect(title).toHaveText('hdr2');
    await expect(title).toHaveAttribute('title', 'hdr2.pdf: A subtitle');
    // …and ellipsized rather than wrapped at narrow widths.
    await expect(title).toHaveCSS('text-overflow', 'ellipsis');
    await expect(title).toHaveCSS('white-space', 'nowrap');
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
