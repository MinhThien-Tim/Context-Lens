import { test, expect, type Page } from '@playwright/test';

/**
 * Offline behaviour is only observable in the production build: `vite dev` installs no service worker
 * (docs/testing.md). Run with a completed `npm run build`:
 *   $env:QA_PRODUCTION='true'; npx playwright test e2e/offline.spec.ts
 * The default `laptop` and `mobile-chromium` projects cover one desktop and one mobile viewport.
 */
test.skip(!process.env.QA_PRODUCTION, 'Requires QA_PRODUCTION=true after npm run build.');

const PASSAGE = Array.from({ length: 40 }, (_, index) => `Paragraph ${index + 1}. A quiet reader understands a difficult passage about maintain public confidence.`).join('\n\n');

async function selectText(page: Page, text: string) {
  await page.locator('.reader-text').evaluate((root, value) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const start = node.textContent?.indexOf(value) ?? -1;
      if (start < 0) continue;
      const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + value.length);
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      root.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); break;
    }
  }, text);
}

test('starts, reads, and looks up a stored document while offline', async ({ page, context }) => {
  // 1. Open the app online and let the first visit finish installing the offline app shell.
  await page.goto('/');
  await expect(page.locator('.home-shell')).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

  // 2. Import a document while online; 3. reload once normally afterwards.
  await page.getByRole('button', { name: 'Plain text', exact: true }).click();
  await page.getByLabel('Paste and edit plain text').fill(PASSAGE);
  await page.getByRole('button', { name: /Preview & read/ }).click();
  await expect(page.locator('.reader-text')).toBeVisible();
  await page.getByRole('button', { name: 'Back to library' }).click();
  await expect(page.locator('.library-card').first()).toBeVisible();
  await expect(page.locator('.library-card .offline-badge').first()).toHaveText('✓ Available offline');
  await page.reload();
  await expect(page.locator('.home-shell')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  // 4. Lose the network; 5. the app must still start and say so.
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.home-shell')).toBeVisible();
  await expect(page.locator('.status-banner').first()).toContainText('Offline mode');

  // Network-only import fails immediately with a clear message instead of waiting for a timeout.
  await page.locator('#article-url').fill('https://example.com/article');
  await page.getByRole('button', { name: 'Import URL' }).click();
  await expect(page.locator('.import-error')).toContainText('needs an Internet connection');

  // 6. Open the locally stored document.
  await page.locator('.library-card .library-open').first().click();
  await expect(page.locator('.reader-text')).toBeVisible();
  await expect(page.locator('.reader-offline')).toHaveText('Offline · Local only');

  // 7. Read and navigate pages.
  await page.evaluate(() => scrollTo(0, 2000));
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(1500);
  await expect(page.locator('.reader-progress')).not.toHaveText('0%');
  await page.evaluate(() => scrollTo(0, 0));

  // 8. Local dictionary lookup resolves without any online provider.
  await selectText(page, 'quiet');
  await page.locator('.selection-actions').getByRole('button', { name: 'Define', exact: true }).click();
  const sheet = page.locator('.lookup-sheet');
  await expect(sheet).toContainText('Offline · Local results');
  await expect(sheet).not.toContainText('Finding meaning');
  await expect(sheet.locator('.sense-definition, .sense-vi, .meaning-en, .meaning-vi').first()).toBeVisible();
  await sheet.getByRole('button', { name: 'Close meaning', exact: true }).click();

  // 9. Highlight and note capture stay on the device and survive a reload without network.
  await page.getByRole('button', { name: 'Markup', exact: true }).click();
  await page.getByRole('dialog', { name: 'Markup tools' }).getByRole('button', { name: 'Highlight' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await selectText(page, 'difficult passage');
  await expect(page.locator('mark.reader-highlight-yellow').first()).toContainText('difficult passage');
  await page.reload();
  await expect(page.locator('.home-shell')).toBeVisible();
  await page.locator('.library-card .library-open').first().click();
  await expect(page.locator('mark.reader-highlight-yellow').first()).toContainText('difficult passage');

  // 11. Restoring the connection resumes the normal online state without a manual reload.
  await context.setOffline(false);
  await expect(page.locator('.reader-offline')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to library' }).click();
  await expect(page.locator('.status-banner', { hasText: 'Offline mode' })).toHaveCount(0);
});
