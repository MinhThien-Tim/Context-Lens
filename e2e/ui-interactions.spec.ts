import { test, expect } from '@playwright/test';

test('Bright homepage keeps readable text with dark reader preference on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/');
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await page.getByRole('button', { name: 'Bright' }).click();
  await page.getByRole('textbox', { name: 'Paste and edit formatted text' }).fill('A short reading passage.');
  await page.getByRole('button', { name: /Preview & read/ }).click();
  await page.getByRole('button', { name: 'Back to library' }).click();
  await expect(page.locator('.library-open').first()).toBeVisible();
  const colors = await page.evaluate(() => {
    const color = (selector: string) => getComputedStyle(document.querySelector(selector)!).color;
    return {
      heading: color('.library-section .section-heading h2'),
      card: color('.library-open'),
      filter: color('.library-tools select'),
      text: getComputedStyle(document.querySelector('.home-shell')!).getPropertyValue('--text').trim(),
    };
  });
  expect(colors.heading).toBe('rgb(23, 32, 51)');
  expect(colors.card).toBe(colors.heading);
  expect(colors.filter).toBe(colors.heading);
  expect(colors.text).toBe('#172033');
});

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
