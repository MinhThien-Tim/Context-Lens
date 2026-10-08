import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { pdfFixture } from './pdfFixture';

async function selectWord(page: import('@playwright/test').Page, surface: '.pdf-text-layer' | '.pdf-reading-page') {
  const root = page.locator(surface).first();
  await expect(root).toBeVisible();
  await root.evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const start = node.textContent?.indexOf('maintain') ?? -1;
      if (start < 0) continue;
      const range = document.createRange();
      range.setStart(node, start); range.setEnd(node, start + 'maintain'.length);
      const selection = window.getSelection()!;
      selection.removeAllRanges(); selection.addRange(range);
      element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      return;
    }
    throw new Error('maintain not found in reader surface');
  });
  await expect(page.getByRole('toolbar', { name: /Selected text actions/ })).toBeVisible();
}

test('save the same PDF word in both modes, reopen, and export once', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'vocabulary-flow.pdf', mimeType: 'application/pdf', buffer: pdfFixture(2) });
  await page.locator('button', { hasText: 'Original' }).click();
  await expect(page.locator('.pdf-text-layer').first()).toBeVisible();

  await selectWord(page, '.pdf-text-layer');
  await page.getByRole('toolbar', { name: /Selected text actions/ }).getByRole('button', { name: /Explain|Define/ }).click();
  const lookup = page.locator('.lookup-sheet');
  await expect(lookup).toContainText('maintain');
  for (const name of ['Add note', 'Save word', 'Close meaning']) {
    const box = await lookup.getByRole('button', { name, exact: true }).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await lookup.getByRole('button', { name: 'Save word', exact: true }).click();
  await expect(lookup.getByRole('button', { name: 'Remove saved word' })).toHaveAttribute('aria-pressed', 'true');
  await lookup.getByRole('button', { name: 'Close meaning' }).click();

  await page.locator('button', { hasText: 'Reading' }).click();
  await selectWord(page, '.pdf-reading-page');
  await page.getByRole('toolbar', { name: /Selected text actions/ }).getByRole('button', { name: /Explain|Define/ }).click();
  await expect(lookup).toContainText('maintain');
  await expect(lookup.getByRole('button', { name: 'Remove saved word' })).toHaveAttribute('aria-pressed', 'true');
  await lookup.getByRole('button', { name: 'Close meaning' }).click();

  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.locator('.continue-card').filter({ hasText: 'vocabulary-flow' }).click();
  await expect(page.getByLabel('Current PDF page')).toContainText('1 / 2');
  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.getByRole('button', { name: 'Saved words' }).click();
  const library = page.getByRole('dialog', { name: 'Saved in context' });
  await expect(library.locator('.vocabulary-card')).toHaveCount(1);
  await expect(library.locator('.vocabulary-card').first()).toContainText('maintain');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    library.getByRole('button', { name: 'Export to English101' }).click()
  ]);
  const payload = JSON.parse(await readFile(await download.path()!, 'utf8'));
  expect(payload).toMatchObject({ schema: 'english101.context-vocabulary', version: 2 });
  expect(payload.entries).toHaveLength(1);
  expect(payload.entries[0]).toMatchObject({ lemma: 'maintain', context: { selectedText: 'maintain' } });
});
