import { test, expect, type Page } from '@playwright/test';
import { pdfFixture } from './pdfFixture';

// docs/desktop-reader.md §3.1: "The displayed value always represents the actual PDF rendering
// scale." §6.1 names the observable form of that rule: `Zoom in` increases the rendered slot
// width, `Zoom out` decreases it, and the displayed percentage equals slotWidth / pageWidth.
// These tests measure the DOM instead of the stored preference, so a regression that kept the
// label in sync with a stale value still fails here.

// pdfFixture's default MediaBox is [0 0 612 792]; the slot width is pageWidth * scale.
const FIXTURE_PAGE_WIDTH = 612;

const slotWidth = (page: Page) =>
  page.locator('.pdf-scroll .pdf-page-slot[data-pdf-page="1"]').evaluate(el => el.getBoundingClientRect().width);

const openOriginalPdf = async (page: Page, name: string) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'application/pdf', buffer: pdfFixture(2) });
  await page.getByRole('button', { name: 'Original', exact: true }).first().click();
  await expect(page.locator('.pdf-scroll .pdf-page-slot[data-pdf-page="1"]')).toBeVisible();
  await expect(page.locator('[data-pdf-page="1"] .pdf-canvas')).toBeVisible();
};

test('§3.1: Header Zoom in increases and Zoom out decreases the rendered slot width at 1280px @pdf', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openOriginalPdf(page, 'zoom-actual-1280.pdf');

  const header = page.locator('.reader-header');
  const zoomIn = header.getByRole('button', { name: 'Zoom in' });
  const zoomOut = header.getByRole('button', { name: 'Zoom out' });
  const level = header.getByLabel('Zoom level');

  // Measure in Automatic first: it is the stored default, and slot width is the only baseline a
  // step can be compared against.
  const start = await slotWidth(page);

  await zoomIn.click();
  await expect.poll(async () => slotWidth(page)).toBeGreaterThan(start);

  const afterIn = await slotWidth(page);
  await zoomOut.click();
  await expect.poll(async () => slotWidth(page)).toBeLessThan(afterIn);

  // No round-trip assertion: `stepDesktopPdfScale` deliberately snaps upward to
  // `fitWidthScale * 1.25` before it starts stepping, so up-then-down is not symmetric.
  // Only the two directions §6.1 names are asserted, plus the displayed percentage.

  // §6.1: the displayed percentage is the actual rendered scale, not the stored preference.
  const displayed = Number((await level.inputValue()).replace('%', ''));
  const measured = (await slotWidth(page)) / FIXTURE_PAGE_WIDTH;
  expect(Math.round(measured * 100)).toBe(displayed);
});

test('§3.1: each fixed selector choice sets the actual scale, and a stepped-to scale stays visible @pdf', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openOriginalPdf(page, 'zoom-select-1280.pdf');

  const header = page.locator('.reader-header');
  const zoomIn = header.getByRole('button', { name: 'Zoom in' });
  const level = header.getByLabel('Zoom level');

  // Automatic is the default; every explicit choice renders at that scale and labels itself with it.
  for (const percent of ['75', '100', '125', '150']) {
    await level.selectOption(percent);
    await expect.poll(async () => Number((await level.inputValue()).replace('%', ''))).toBe(Number(percent));
    const measured = (await slotWidth(page)) / FIXTURE_PAGE_WIDTH;
    expect(Math.round(measured * 100)).toBe(Number(percent));
  }

  // Stepping off the fixed list must not blank the select: exactly one dynamic option appears,
  // labelled with the actual scale, and it disappears once a fixed choice is selected again.
  await level.selectOption('100');
  await expect.poll(async () => slotWidth(page)).toBeCloseTo(FIXTURE_PAGE_WIDTH, 0);
  await zoomIn.click();

  const dynamicCount = await level.locator('option').count();
  expect(dynamicCount).toBe(6);
  const displayed = await level.inputValue();
  expect(displayed).not.toBe('');
  expect(displayed).not.toBe('auto');
  expect(Number(displayed)).not.toBe(100);
  // The dynamic label is the actual scale, so it matches the measured slot width.
  const measured = (await slotWidth(page)) / FIXTURE_PAGE_WIDTH;
  expect(Number(displayed)).toBe(Math.round(measured * 100));

  await level.selectOption('150');
  await expect(level.locator('option')).toHaveCount(5);
  expect(await level.inputValue()).toBe('150');
});
