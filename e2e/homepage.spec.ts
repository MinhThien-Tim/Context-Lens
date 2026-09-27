import { test, expect } from '@playwright/test';

for (const width of [320, 360, 390, 430, 768, 1280]) {
  test(`homepage controls fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    const paste = await page.locator('#paste-text').boundingBox();
    const imports = await page.locator('#import-document').boundingBox();
    expect(paste).not.toBeNull();
    expect(imports).not.toBeNull();
    if (width > 900) {
      expect(paste!.x).toBeLessThan(imports!.x);
      expect(Math.abs(paste!.y - imports!.y)).toBeLessThan(2);
    } else {
      expect(paste!.y + paste!.height).toBeLessThanOrEqual(imports!.y);
    }
    await page.getByRole('button', { name: 'Advanced', exact: true }).click();
    await expect(page.locator('.home-shell')).toHaveAttribute('data-interface-mode', 'advanced');
    await expect(page.getByRole('heading', { name: 'Start reading.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keep formatting' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Plain text' })).toBeVisible();
    await expect(page.getByLabel('Search library')).toBeVisible();
    await expect(page.getByLabel('Filter document type')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Interface density' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const name of ['Keep formatting', 'Plain text', 'Import URL', 'Advanced']) {
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
  test(`homepage utilities remain operable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Advanced', exact: true }).click();
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

test('phase 4 reading shelf and themes preserve document entry', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Plain text' }).click();
  await page.getByLabel('Paste and edit plain text').fill(Array.from({ length: 50 }, () => 'A quiet reading sample with room to understand the passage.').join('\n\n'));
  await page.getByRole('button', { name: /Preview & read/ }).click();
  await expect(page.locator('.reader-text')).toBeVisible();
  await page.evaluate(() => scrollTo(0, 500));
  await page.getByRole('button', { name: 'Back to library' }).click();
  await expect(page.locator('.continue-card')).toHaveCount(1);
  await expect(page.locator('.document-cover')).toHaveCount(0);
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await expect(page.locator('.document-cover').first()).toBeVisible();
  for (const width of [1366, 1024, 768, 390, 320, 844]) {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 900 });
    for (const theme of ['light', 'dark', 'system']) {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.getByLabel('Appearance', { exact: true }).selectOption(theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const mode of ['simple', 'advanced'] as const) {
        await page.getByRole('group', { name: 'Interface density' }).getByRole('button', { name: mode === 'simple' ? 'Simple' : 'Advanced', exact: true }).click();
        const card = await page.locator('.continue-card').boundingBox();
        if (mode === 'advanced') expect(card!.height).toBeLessThanOrEqual(104);
        else await expect(page.getByRole('heading', { name: 'Pick up where you left off' })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: `tmp/phase4/modes-${width}-${theme}-${mode}.png`, fullPage: true });
      }
    }
  }
  await page.locator('.continue-card').click();
  await expect(page.locator('.reader-text')).toBeVisible();
  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.getByRole('group', { name: 'Interface density' }).getByRole('button', { name: 'Simple', exact: true }).click();
  await page.getByRole('button', { name: 'Lookup statistics' }).click();
  await expect(page.getByRole('dialog', { name: 'Lookup statistics' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Translation', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close statistics' }).click();
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await page.getByRole('button', { name: 'Typography', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Reader settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Close reader settings' }).click();
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

test('reader presets and manual typography controls fit one phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Plain text', exact: true }).click();
  await page.getByLabel('Paste and edit plain text').fill('A phone reading sample with enough words to check its visible width.');
  await page.getByRole('button', { name: /Preview & read/ }).click();
  const reader = page.locator('.reader-text');
  await expect(reader).toBeVisible();
  await page.getByRole('button', { name: 'Reading appearance', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Reader settings' });
  await settings.getByRole('button', { name: 'News', exact: true }).click();
  await expect(reader).toHaveCSS('font-size', '18px');
  expect(await reader.evaluate(element => getComputedStyle(element).fontFamily)).toContain('ui-sans-serif');
  const newsWidth = await reader.evaluate(element => element.getBoundingClientRect().width);
  await settings.getByRole('button', { name: 'Wide', exact: true }).click();
  const wideWidth = await reader.evaluate(element => element.getBoundingClientRect().width);
  expect(wideWidth).toBeLessThan(newsWidth);
  await settings.getByLabel('Text size').fill('23');
  await expect(reader).toHaveCSS('font-size', '23px');
  await expect(settings.getByRole('button', { name: 'News', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).resolves.toBe(true);
});


test('density switch preserves rich and plain drafts, URL and reader preferences', async ({ page }) => {
  await page.goto('/');
  const modes = page.getByRole('group', { name: 'Interface density' });
  await page.getByLabel('Title', { exact: true }).fill('My reading draft');
  await page.getByRole('textbox', { name: 'Paste and edit formatted text' }).fill('A draft with words to keep.');
  await page.locator('#article-url').fill('https://example.com/reading');
  await page.getByLabel('Appearance', { exact: true }).selectOption('dark');
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await page.getByRole('button', { name: 'Typography', exact: true }).click();
  await page.getByLabel('Text size').fill('22');
  await page.getByLabel('Line height').fill('1.8');
  await page.getByRole('button', { name: 'Sans', exact: true }).click();
  await page.getByRole('button', { name: 'Close reader settings' }).click();
  for (const mode of ['Advanced', 'Simple']) {
    await modes.getByRole('button', { name: mode, exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Paste and edit formatted text' })).toHaveText('A draft with words to keep.');
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('My reading draft');
    await expect(page.locator('#article-url')).toHaveValue('https://example.com/reading');
    await expect(page.getByLabel('Appearance', { exact: true })).toHaveValue('dark');
  }
  await page.getByRole('button', { name: 'Plain text', exact: true }).click();
  await modes.getByRole('button', { name: 'Advanced', exact: true }).click();
  await expect(page.getByLabel('Paste and edit plain text')).toHaveValue('A draft with words to keep.');
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await page.getByRole('button', { name: 'Typography', exact: true }).click();
  await expect(page.getByLabel('Text size')).toHaveValue('22');
  await expect(page.getByLabel('Line height')).toHaveValue('1.8');
  await expect(page.getByRole('button', { name: 'Sans', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Close reader settings' }).click();
  await page.reload();
  await expect(modes.getByRole('button', { name: 'Advanced', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Appearance', { exact: true })).toHaveValue('dark');
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await page.getByRole('button', { name: 'Typography', exact: true }).click();
  await expect(page.getByLabel('Text size')).toHaveValue('22');
  await expect(page.getByLabel('Line height')).toHaveValue('1.8');
});


test('switching density in reader preserves reading position', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Plain text', exact: true }).click();
  await page.getByLabel('Paste and edit plain text').fill(Array.from({ length: 100 }, (_, i) => `Paragraph ${i + 1}. A quiet reading sample with room to understand the passage.`).join('\n\n'));
  await page.getByRole('button', { name: /Preview & read/ }).click();
  await expect(page.locator('.reader-text')).toBeVisible();
  await page.evaluate(() => scrollTo(0, 1800));
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(1500);
  await expect(page.locator('.reader-progress')).not.toHaveText('0%');
  for (const mode of ['Advanced', 'Simple']) {
    const before = await page.evaluate(() => scrollY);
    const position = await page.locator('.reader-progress').innerText();
    await page.getByRole('button', { name: 'Reading appearance', exact: true }).click();
    await page.getByRole('dialog', { name: 'Reader settings' }).getByRole('button', { name: mode, exact: true }).click();
    await page.getByRole('button', { name: 'Close reader settings', exact: true }).click();
    expect(Math.abs(await page.evaluate(() => scrollY) - before)).toBeLessThan(2);
    await expect(page.locator('.reader-progress')).toHaveText(position);
  }
  const position = await page.locator('.reader-progress').innerText();
  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.getByRole('group', { name: 'Interface density' }).getByRole('button', { name: 'Advanced', exact: true }).click();
  await page.locator('.continue-card').click();
  await expect(page.locator('.reader-progress')).toHaveText(position);
});
