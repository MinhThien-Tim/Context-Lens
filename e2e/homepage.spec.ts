import { test, expect } from '@playwright/test';

for (const width of [320, 360, 390, 430, 768, 1280]) {
  test(`homepage controls fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Bright' }).click();
    await expect(page.locator('.home-shell')).toHaveCSS('background-color', 'rgb(247, 248, 251)');
    await expect(page.getByRole('heading', { name: 'Start reading.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keep formatting' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Plain text' })).toBeVisible();
    await expect(page.getByLabel('Search library')).toBeVisible();
    await expect(page.getByLabel('Filter document type')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Homepage color theme' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const name of ['Keep formatting', 'Plain text', 'Import URL', 'Bright']) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole('button', { name: 'Plain text' }).click();
    await expect(page.getByRole('button', { name: 'Plain text' })).toHaveClass(/active/);
    await page.getByLabel('Search library').fill('sample');
    await expect(page.getByLabel('Search library')).toHaveValue('sample');
  });
}

for (const width of [390, 1280]) {
  test(`bright homepage utilities remain operable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Bright' }).click();
    for (const [button, dialog, close] of [
      ['Saved words', 'Saved in context', 'Close saved vocabulary'],
      ['Storage', 'Data & storage', 'Close data management'],
      ['Settings', 'Language engines', 'Close settings'],
      ['Guide', 'Read → Save → Review', 'Close how Context Lens works'],
    ]) {
      await page.getByRole('button', { name: button }).click();
      await expect(page.getByRole('dialog', { name: dialog })).toBeVisible();
      await page.getByRole('dialog').getByRole('button', { name: close }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    await page.getByRole('group', { name: 'Guide language' }).getByRole('button', { name: 'VN' }).click();
    await expect(page.getByRole('button', { name: 'VN' })).toHaveAttribute('aria-pressed', 'true');
  });
}

test('bright homepage theme persists and stays off the reader', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Bright' }).click();
  await expect(page.locator('.home-shell')).toHaveAttribute('data-home-theme', 'bright');
  await page.reload();
  await expect(page.locator('.home-shell')).toHaveAttribute('data-home-theme', 'bright');
  await page.getByRole('button', { name: 'Plain text' }).click();
  await page.getByLabel('Paste and edit plain text').fill('A bright reading sample.');
  await page.getByRole('button', { name: /Preview & read/ }).click();
  await expect(page.locator('.home-shell')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to library' }).click();
  await expect(page.locator('.home-shell')).toHaveAttribute('data-home-theme', 'bright');
});

test('plain text creates a persistent library item that can be searched, opened and deleted', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Plain text' }).click();
  await page.getByLabel('Paste and edit plain text').fill('A small passage for reading.');
  await page.getByRole('button', { name: /Preview & read/ }).click();
  await expect(page.getByRole('button', { name: 'Back to library' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.reload();
  await page.getByLabel('Search library').fill('Untitled reading');
  await expect(page.locator('.library-card')).toHaveCount(1);
  await page.getByLabel('Filter document type').selectOption('text');
  await expect(page.locator('.library-card')).toHaveCount(1);
  await page.locator('.library-card .library-open').click();
  await expect(page.getByRole('button', { name: 'Back to library' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to library' }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete Untitled reading' }).click();
  await expect(page.locator('.library-card')).toHaveCount(0);
});
