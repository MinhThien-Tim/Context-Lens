import { test, expect } from '@playwright/test';

for (const width of [320, 360, 390, 430]) {
  test(`reading controls remain reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Start reading.' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Paste and edit formatted text' }).fill('A quiet reader helps people understand a difficult passage.');
    await page.getByRole('button', { name: /Preview & read/ }).click();
    await expect(page.getByRole('button', { name: 'Back to library' })).toBeVisible();
    await page.getByRole('button', { name: 'Reader menu' }).click();
    await expect(page.getByRole('menuitem', { name: 'Text and theme' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Text and theme' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
