import { test, expect } from '@playwright/test';

test('Simple Quick responsive languages, height and Full return', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const preactPath = '/node_modules/.vite/deps/preact.js';
    const componentPath = '/src/components/LookupBottomSheet.tsx';
    const fixturePath = '/src/test/fixtures.ts';
    const cssPath = '/src/reader-layout.css';
    const { h, render } = await import(/* @vite-ignore */ preactPath);
    const { LookupBottomSheet } = await import(/* @vite-ignore */ componentPath);
    const { validLookup } = await import(/* @vite-ignore */ fixturePath);
    await import(/* @vite-ignore */ cssPath);
    const root = document.createElement('div'); root.id = 'simple-fixture'; root.className = 'reader-shell'; document.body.append(root);
    let result = { ...validLookup, quick: { ...validLookup.quick, lexical_unit: null }, dictionary: { senses: Array.from({ length: 8 }, (_, i) => ({ id: String(i), pos: i < 4 ? 'verb' : 'noun', definitionEn: String(i) + ' English definition ' + 'longword '.repeat(24), meaningsVi: [String(i) + ' Vietnamese meaning ' + 'long '.repeat(30)], source: 'local', contextMatch: false, contextScore: 0 })), contextPos: 'verb', senseStatus: 'common', unpairedMeaningsVi: ['fallback one', 'fallback two', 'fallback three'] } };
    let quickMode = 'standard'; let mode = 'bilingual'; let displayMode = 'popup';
    const noop = () => {};
    const draw = () => render(h(LookupBottomSheet, { open: true, result, loading: false, error: null, saved: false, mode, quickMode, displayMode,
      onQuickModeChange: (next: string) => { quickMode = next; draw(); }, onModeChange: (next: string) => { mode = next; draw(); },
      onDisplayModeChange: (next: string) => { displayMode = next; draw(); }, onSpeak: noop, onToggleSave: noop, onAddNote: noop, onClose: noop, onOpenSettings: noop }), root);
    (window as any).setSimpleFixture = (short: boolean, fallback: boolean) => {
      result = { ...result, dictionary: { ...result.dictionary, senses: result.dictionary.senses.map((sense, i) => ({ ...sense, definitionEn: `${i} ${short ? 'short meaning' : 'verbose definition '.repeat(14)}`, meaningsVi: fallback ? [] : [`${i} ${short ? 'short gloss' : 'verbose gloss '.repeat(14)}`] })), unpairedMeaningsVi: fallback ? ['entry one', 'entry two', 'entry three', 'entry four', 'entry five', 'entry six', 'entry seven'] : [] } }; draw();
    }; draw();
  });
  const sheet = page.locator('#simple-fixture .lookup-sheet');
  for (const width of [320, 360, 390, 430, 1024, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(sheet).toHaveAttribute('data-quick-mode', 'standard');
    const expand = sheet.locator('.quick-more-meanings');
    if (await expand.getAttribute('aria-expanded') === 'false') await expand.click();
    const standardHeight = await sheet.locator('.inspector-body').evaluate(el => el.scrollHeight);
    await sheet.getByRole('button', { name: 'Use Simple Quick card' }).click();
    await expect(sheet).toHaveAttribute('data-quick-mode', 'simple');
    expect(await sheet.locator('.inspector-body').evaluate(el => el.scrollHeight)).toBeLessThan(standardHeight);
    for (const name of ['Add note', 'Save word', 'Pronounce word', 'Show more']) await expect(sheet.getByRole('button', { name, exact: true })).toBeVisible();
    for (const short of [false, true]) for (const fallback of [false, true]) {
    await page.evaluate(({short, fallback}) => (window as any).setSimpleFixture(short, fallback), { short, fallback });
    for (const mode of ['bilingual', 'en', 'vi']) {
      await expect(sheet.locator('.quick-explanation')).toHaveAttribute('data-language', mode);
      expect(await sheet.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      if (!fallback || mode !== 'vi') await expect(sheet.locator('.sense-row')).toHaveCount(short ? 6 : 3);
      if (fallback && mode !== 'en') await expect(sheet.locator('.entry-glosses li')).toHaveCount(6);
      if (!fallback && mode === 'bilingual') {
        const pair = sheet.locator('.sense-row .paired-columns').first();
        const en = (await pair.locator('.sense-definition').boundingBox())!;
        const vi = (await pair.locator('.sense-vi').boundingBox())!;
        if (width >= 430) { expect(vi.x).toBeGreaterThan(en.x); expect(Math.abs(vi.y - en.y)).toBeLessThan(2); }
        else { expect(vi.y).toBeGreaterThan(en.y); }
      }
      const menu = sheet.locator('.explain-more-actions');
      await menu.locator('summary').click();
      await menu.locator('.language-cycle').click();
      await menu.locator('summary').click();
    }
    }
    await sheet.getByRole('button', { name: 'Show more', exact: true }).click();
    await expect(sheet).toHaveClass(/expanded/);
    await sheet.getByRole('button', { name: 'Show less', exact: true }).click();
    await expect(sheet).toHaveAttribute('data-quick-mode', 'simple');
    await page.evaluate(() => (window as any).setSimpleFixture(false, false));
    await sheet.getByRole('button', { name: 'Use Standard Quick card' }).click();
  }
});
