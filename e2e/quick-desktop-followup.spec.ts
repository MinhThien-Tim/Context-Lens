import { test, expect } from '@playwright/test';

test('desktop Quick split Unicode and long sense fixtures', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/');
  for (const word of ['meaning', 'attitude', 'attitudes', 'maintain']) {
    await page.evaluate(async word => {
      const preactPath = '/node_modules/.vite/deps/preact.js';
      const componentPath = '/src/components/QuickExplain.tsx';
      const { h, render } = await import(/* @vite-ignore */ preactPath);
      const { QuickExplain } = await import(/* @vite-ignore */ componentPath);
      await import(/* @vite-ignore */ '/src/reader-layout.css');
      document.querySelector('#quick-fixture')?.remove();
      const root = document.createElement('div'); root.id = 'quick-fixture'; root.className = 'reader-shell'; document.body.append(root);
      const senses = ['noun', 'verb', 'adjective'].map((pos, i) => ({ id: String(i), pos, definitionEn: 'A long English definition with an unbroken word ' + 'definition'.repeat(35), meaningsVi: i === 2 ? [] : ['Vietnamese Unicode: ' + '\u0111\u1ecbnh ngh\u0129a ti\u1ebfng Vi\u1ec7t '.repeat(30)], source: 'local', contextMatch: false, contextScore: 0 }));
      const result = { selection: { surface: word }, context: { sentence: word }, quick: { meaning_vi: [], definition_en: '' }, dictionary: { senses, senseStatus: 'ambiguous', contextPos: 'noun', unpairedMeaningsVi: ['Unmatched: ' + '\u00fd ngh\u0129a ch\u01b0a gh\u00e9p '.repeat(40)] }, lens: { selection: {}, sense: { diagnostics: [{ senseId: '0', semanticScore: 3, reasons: [] }, { senseId: '1', semanticScore: 3, reasons: [] }] } } };
      // Two same-POS senses trigger the real ambiguous-context UI branch.
      senses[1].pos = 'noun';
      (window as any).renderQuickFixture = (mode: string) => render(h('section', { class: 'lookup-sheet word-popup quick', style: 'position:fixed;left:100px;top:80px' }, h('div', { class: 'inspector-body' }, h(QuickExplain, { result, mode }))), root);
      (window as any).renderQuickFixture('bilingual');
    }, word);
    const quick = page.locator('#quick-fixture .quick-explanation');
    await expect(quick.locator('.lookup-note')).toContainText('Context is not strong enough');
    const status = await quick.locator('.lookup-note').textContent();
    expect(status).not.toMatch(/\?|\uFFFD|Ã|Â/);
    expect(await quick.locator('.lookup-note').evaluate(el => getComputedStyle(el).fontFamily)).toContain('Segoe UI');
    const pair = quick.locator('.paired-columns').first();
    const en = await pair.locator('.sense-definition').boundingBox();
    const vi = await pair.locator('.sense-vi').boundingBox();
    expect(vi!.x).toBeGreaterThan(en!.x + en!.width);
    const gloss = await quick.locator('.entry-glosses').boundingBox();
    expect(gloss!.x).toBeGreaterThan(en!.x + en!.width);
    expect(await quick.evaluate(el => [...el.querySelectorAll('*'), el].every(node => node.scrollWidth <= node.clientWidth + 1))).toBe(true);
    await page.screenshot({ path: `tmp/quick-followup-${word}.png` });
    for (const mode of ['en', 'vi']) {
      await page.evaluate(mode => (window as any).renderQuickFixture(mode), mode);
      await expect(quick).toHaveAttribute('data-language', mode);
      await expect(quick.locator('.has-bilingual-content')).toHaveCount(0);
      expect(await quick.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
  }
});
