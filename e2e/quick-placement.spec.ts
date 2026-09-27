import { test, expect } from '@playwright/test';
for (const width of [1024, 1280, 1366, 1440]) test(`Quick placement at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto('/');
  await page.evaluate(async () => {
    const preactPath = '/node_modules/.vite/deps/preact.js';
    const componentPath = '/src/components/LookupBottomSheet.tsx';
    const fixturePath = '/src/test/fixtures.ts';
    const cssPath = '/src/reader-layout.css';
    const { h, render } = await import(/* @vite-ignore */ preactPath);
    const { LookupBottomSheet } = await import(/* @vite-ignore */ componentPath);
    const { validLookup } = await import(/* @vite-ignore */ fixturePath);
    await import(/* @vite-ignore */ cssPath);
    const root = document.createElement('div'); root.className = 'reader-shell'; document.body.append(root);
    let placement = { mode: 'auto' }; let displayMode = 'popup'; let open = true; let selectionKey = 'one';
    const noop = () => {};
    const draw = () => render(h(LookupBottomSheet, { open, displayMode, selectionKey, placement,
      anchor: { left: selectionKey === 'one' ? 100 : 600, right: selectionKey === 'one' ? 140 : 640, top: 220, bottom: 240 },
      result: validLookup, loading: false, error: null, mode: 'bilingual', saved: false,
      onPlacementChange: (next: any) => { placement = next; draw(); },
      onDisplayModeChange: (next: any) => { displayMode = next; draw(); },
      onClose: () => { open = false; draw(); }, onModeChange: noop, onOpenSettings: noop, onSpeak: noop, onToggleSave: noop,
    }), root);
    (window as any).nextQuick = () => { selectionKey = 'two'; open = true; draw(); }; draw();
  });
  const sheet = page.locator('.lookup-sheet'); const handle = page.locator('.lookup-drag-handle');
  await expect(sheet).toBeVisible(); expect((await sheet.boundingBox())!.width).toBe(340);
  const dragTo = async (x: number, y: number) => {
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + 15, box.y + 10); await page.mouse.down();
    await page.mouse.move(x, y, { steps: 5 }); await page.mouse.up();
  };
  await dragTo(width - 10, 850);
  const pinned = (await sheet.boundingBox())!;
  expect(pinned.x + pinned.width).toBeLessThanOrEqual(width - 11);
  expect(pinned.y + pinned.height).toBeLessThanOrEqual(889);
  await page.evaluate(() => (window as any).nextQuick());
  expect((await sheet.boundingBox())!.x).toBeCloseTo(pinned.x);
  await page.getByRole('button', { name: 'Close meaning', exact: true }).click();
  await page.evaluate(() => (window as any).nextQuick());
  expect((await sheet.boundingBox())!.x).toBeCloseTo(pinned.x);
  await page.getByRole('button', { name: 'Show more', exact: true }).click();
  await expect(handle).toHaveCount(0);
  await page.getByRole('button', { name: 'Show less', exact: true }).click();
  expect((await sheet.boundingBox())!.x).toBeCloseTo(pinned.x);
  await page.setViewportSize({ width: 1024, height: 700 });
  await expect.poll(async () => { const box = (await sheet.boundingBox())!; return box.x + box.width; }).toBeLessThanOrEqual(1013);
  await dragTo(-50, -50);
  expect((await sheet.boundingBox())!.x).toBe(12); expect((await sheet.boundingBox())!.y).toBeGreaterThanOrEqual(72);
  await page.getByLabel('More actions').click(); await page.getByLabel('Popup position', { exact: true }).selectOption('auto');
  await expect(sheet).toHaveCSS('left', '652px');
});
