import { test, expect } from '@playwright/test';

// FTR-3: Markup is one tool state (Highlight, Underline, Erase, colour). At ≤1023px the Footer
// Markup action opens the compact palette; the tool is chosen there and the selection then applies
// it. The old `.reader-highlight-button` opener was removed with the chrome it belonged to.
test('formatted Paste text exposes markup and applies it without changing the selection mid-drag @FTR-3', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Paste and edit formatted text' }).fill('A quiet reader understands a difficult passage.');
  await page.getByRole('button', { name: /Preview & read/ }).click();

  const openPalette = async () => {
    await page.getByRole('button', { name: 'Markup', exact: true }).click();
    const palette = page.getByRole('dialog', { name: 'Markup tools' });
    await expect(palette).toBeVisible();
    return palette;
  };

  let palette = await openPalette();
  await palette.getByRole('button', { name: 'Highlight', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  await page.locator('.article-content').evaluate(root => {
    const text = root.firstChild!;
    const source = text.textContent!;
    const range = document.createRange();
    range.setStart(text, source.indexOf('quiet'));
    range.setEnd(text, source.indexOf('reader') + 'reader'.length);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    root.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });

  await expect(page.locator('mark.reader-highlight-yellow')).toHaveText('quiet reader');

  palette = await openPalette();
  await palette.getByRole('button', { name: 'Highlight', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('.article-content').evaluate(root => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let text: Node | null = null;
    while ((text = walker.nextNode())) if (text.textContent?.includes('difficult')) break;
    const source = text!.textContent!;
    const range = document.createRange();
    range.setStart(text!, source.indexOf('difficult'));
    range.setEnd(text!, source.indexOf('passage') + 'passage'.length);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    root.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
  await expect(page.locator('.selection-actions')).toBeVisible();
  await expect(page.locator('mark.reader-highlight-yellow')).toHaveCount(1);
});
