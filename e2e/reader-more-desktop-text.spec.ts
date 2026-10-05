import { test, expect, type Page } from '@playwright/test';

// docs/desktop-reader.md §2 + mobile-chrome.md §6/§12: exactly one More disclosure per density
// band, and at >=1024px it is the Header toolbar. The inventory of contract §9.3 belongs to the
// Reader, not to a document type — a text or EPUB document must still expose all eight items.
//
// Regression coverage for task 2026-10-05-desktop-text-document-has-no-more (regression of
// 40e807d): ReaderToolbar gated the whole desktop toolbar, ReaderMore included, on the PDF-only
// `page`/`totalPages` props. A text document therefore rendered no More trigger at >=1024px.
//
// One test per viewport, per the standing test-hygiene rule: no loop over widths inside one test.

async function openTextReader(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Paste and edit formatted text' })
    .fill('A quiet reader helps people understand a difficult passage.');
  await page.getByRole('button', { name: /Preview & read/ }).click();
  await expect(page.locator('.reader-text')).toBeVisible();
}

test('§9.2: a text document at 1280px has exactly one More trigger, in the Header', async ({ page }) => {
  await openTextReader(page, 1280, 900);

  // Exactly one disclosure overall, and it is the Header one at this band.
  await expect(page.getByRole('button', { name: 'Reader menu', exact: true })).toHaveCount(1);
  await expect(page.locator('.reader-header').getByRole('button', { name: 'Reader menu', exact: true })).toHaveCount(1);
  // The Footer owns More only at <=1023px (mobile-chrome.md §8.1/§12).
  await expect(page.locator('.reader-progress').getByRole('button', { name: 'Reader menu', exact: true })).toHaveCount(0);

  await page.locator('.reader-header').getByRole('button', { name: 'Reader menu', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Reader actions' })).toBeVisible();

  // §9.3 + mobile-chrome.md §6: the full eight-item inventory in the approved order, with the
  // 2026-10-05 labels. A document type never removes an item.
  const expected = ['Contents', 'Context', 'Notes', 'Markup', 'Text', 'Languages', 'Document', 'Click lookup'];
  await expect(page.getByRole('menu')).toContainText('Contents');
  const labels = await page.getByRole('menuitem').allInnerTexts();
  expect(labels.map(label => label.trim().split('\n')[0])).toEqual(expected);
  await expect(page.getByRole('menuitem', { name: 'Click lookup', exact: true })).toHaveCount(1);
});

test('§9.2: a text document at 1024px has exactly one More trigger, in the Header', async ({ page }) => {
  await openTextReader(page, 1024, 900);
  await expect(page.locator('.reader-header').getByRole('button', { name: 'Reader menu', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Reader menu', exact: true })).toHaveCount(1);
  await expect(page.locator('.reader-progress').getByRole('button', { name: 'Reader menu', exact: true })).toHaveCount(0);
});