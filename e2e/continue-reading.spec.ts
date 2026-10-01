import { test, expect } from '@playwright/test';
import { useInterfaceMode } from './interfaceMode';

for (const mode of ['simple', 'advanced'] as const) {
  test(`Continue reading disclosure and safe dismissal (${mode})`, async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Advanced', exact: true })).toBeEnabled();
    await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('context-lens');
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('documents', 'readwrite');
        for (let i = 0; i < 10; i++) transaction.objectStore('documents').put({ id: `compact-${i}`, title: `Compact book ${i}`, kind: 'pdf', content: 'Text', data: new Blob(['original file']), highlights: [], createdAt: i + 1, updatedAt: i + 1, location: { kind: 'pdf', page: 2, scrollY: 0, progress: 0.2, updatedAt: 1 }, pageOffsets: [0, 1, 2, 3, 4] });
        transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    });
    await page.reload();
    await useInterfaceMode(page, mode);
    const disclosure = page.locator('.continue-disclosure');
    await expect(disclosure.locator('.continue-count')).toHaveText('10');
    await expect(disclosure.locator('.continue-card').first()).not.toBeVisible();
    await expect(disclosure).not.toHaveAttribute('open');
    await disclosure.locator('summary').click();
    await expect(disclosure.locator('.continue-card').first()).toBeVisible();
    const list = disclosure.locator('.continue-grid');
    expect(await list.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    expect((await list.boundingBox())!.height).toBeLessThanOrEqual(324);
    await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
    expect(await list.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await list.evaluate(element => { element.scrollTop = 0; });
    await disclosure.getByRole('button', { name: 'Remove from Continue reading: Compact book 9', exact: true }).click();
    await expect(disclosure.locator('.continue-count')).toHaveText('9');
    await expect(page.locator('.home-shell')).toBeVisible();
    await expect(page.locator('.library-card').filter({ hasText: 'Compact book 9' })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `tmp/continue-reading-${mode}-${test.info().project.name}.png`, fullPage: true });
    await disclosure.locator('summary').click();
    await expect(disclosure.locator('.continue-card').first()).not.toBeVisible();
    await page.reload();
    await expect(page.locator('.continue-count')).toHaveText('9');
    await expect(page.locator('.continue-disclosure')).not.toHaveAttribute('open');
    expect(await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('context-lens'); request.onsuccess = () => resolve(request.result); });
      const doc = await new Promise<any>(resolve => { const request = database.transaction('documents').objectStore('documents').get('compact-9'); request.onsuccess = () => resolve(request.result); });
      database.close();
      return { file: await doc.data.text(), page: doc.location.page, progress: doc.location.progress, highlights: doc.highlights, dismissed: doc.continueReadingDismissed };
    })).toEqual({ file: 'original file', page: 2, progress: 0.2, highlights: [], dismissed: true });
  });
}
