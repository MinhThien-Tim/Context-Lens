import { test, expect } from '@playwright/test';

test('formatted Paste text exposes markup and applies it without changing the selection mid-drag', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Paste and edit formatted text' }).fill('A quiet reader understands a difficult passage.');
  await page.getByRole('button', { name: /Preview & read/ }).click();

  const markup = page.locator('.reader-highlight-button').first();
  await expect(markup).toBeVisible();
  await markup.click();
  await page.getByRole('dialog', { name: 'Markup tools' }).getByRole('button', { name: 'Highlight' }).click();
  await page.getByRole('button', { name: 'Done' }).click();

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

  await markup.click();
  await page.getByRole('dialog', { name: 'Markup tools' }).getByRole('button', { name: 'Highlight' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
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
