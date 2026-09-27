import { test, expect } from '@playwright/test';

test('desktop Quick stays contained at selection edges with long bilingual content', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 850 });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Paste and edit formatted text' }).fill('We maintain public confidence through careful work.');
  await page.getByRole('button', { name: /Preview & read/ }).click();
  const sheet = page.locator('.lookup-sheet');
  for (const [left, top] of [[12, 80], [720, 80], [12, 740], [720, 740]]) {
    await page.locator('.reader-text').evaluate((el, position) => {
      const paragraph = el as HTMLElement;
      Object.assign(paragraph.style, { position: 'fixed', left: `${position[0]}px`, top: `${position[1]}px`, width: '280px', margin: '0', padding: '0' });
    }, [left, top]);
    await page.locator('.reader-text').evaluate(root => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode()!;
      while (!node.textContent!.includes('maintain')) node = walker.nextNode()!;
      const start = node.textContent!.indexOf('maintain');
      const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + 8);
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      root.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    });
    await page.locator('.selection-actions').getByRole('button', { name: 'Define', exact: true }).click();
    await expect(sheet.locator('.sense-definition').first()).toBeVisible();
    await sheet.locator('.sense-definition,.sense-vi').evaluateAll(elements => {
      for (const el of elements) el.textContent += ' Long English definition và nghĩa tiếng Việt liên kết.'.repeat(50);
    });
    const bounds = await sheet.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(12);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1012);
    expect(bounds!.y).toBeGreaterThanOrEqual(72);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(838);
    expect(bounds!.height).toBeLessThanOrEqual(520);
    expect(await sheet.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const header = await sheet.locator('.inspector-header').boundingBox();
    await sheet.locator('.inspector-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
    expect((await sheet.locator('.inspector-header').boundingBox())!.y).toBe(header!.y);
    await sheet.locator('.inspector-sources > summary').click();
    await expect(sheet.locator('.inspector-sources')).toHaveAttribute('open', '');
    await sheet.getByRole('button', { name: 'Close meaning', exact: true }).click();
  }
});

for (const width of [1366, 320]) {
  test(`lookup Vietnamese meanings and saved view at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    const openReading = async () => {
      await page.goto('/');
      await page.getByRole('textbox', { name: 'Paste and edit formatted text' }).fill('The movement of the points on the page is obvious.');
      await page.getByRole('button', { name: /Preview & read/ }).click();
      await expect(page.locator('.reader-text')).toBeVisible();
    };
    const define = async (word: string) => {
      await page.evaluate(text => {
        const root = document.querySelector('.reader-text')!;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const start = node.textContent?.indexOf(text) ?? -1;
          if (start < 0) continue;
          const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + text.length);
          const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
          root.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); break;
        }
      }, word);
      await page.locator('.selection-actions').getByRole('button', { name: 'Define', exact: true }).click();
    };
    await openReading();
    await define('movement');
    const sheet = page.locator('.lookup-sheet');
    await expect(sheet).toHaveClass(/quick/);
    await expect(sheet.locator('.entry-glosses')).toBeVisible();
    expect(await sheet.locator('.entry-glosses').evaluate(el => el.closest('details'))).toBeNull();
    expect((await sheet.locator('.language-cycle').boundingBox())!.width).toBeLessThanOrEqual(72);
    expect(await sheet.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `tmp/phase3/vietnamese-quick-${width}.png` });
    await sheet.getByRole('button', { name: 'Show more', exact: true }).click();
    await expect(sheet).toHaveClass(/expanded/);
    const glosses = sheet.locator('.deep-explanation>.unpaired-meanings');
    await expect(glosses).toBeVisible();
    expect(await glosses.evaluate(el => el.closest('details'))).toBeNull();
    expect(await sheet.locator('.sense-group[open]>ol>li').count()).toBeLessThanOrEqual(2);
    await expect(sheet.locator('.sense-group[open] .more-group-meanings')).toBeVisible();
    const colors = await sheet.locator('.deep-explanation').evaluate(el => ['.inspector-sentence', '.expanded-senses', '.unpaired-meanings'].map(selector => getComputedStyle(el.querySelector(selector)!).backgroundColor));
    expect(new Set(colors).size).toBe(3);
    await page.screenshot({ path: `tmp/phase3/vietnamese-full-${width}.png` });
    await sheet.getByRole('button', { name: 'Close meaning', exact: true }).click();
    await define('points');
    await expect(sheet).toHaveClass(/expanded/);
    await page.reload();
    await openReading();
    await define('movement');
    await expect(sheet).toHaveClass(/expanded/);
    await sheet.locator('.explain-more-actions>summary').click();
    await expect(sheet.getByLabel('Default lookup view')).toHaveValue('full');
    await sheet.getByLabel('Default lookup view').selectOption('quick');
    await expect(sheet).toHaveClass(/quick/);
    await sheet.getByRole('button', { name: 'Close meaning', exact: true }).click();
    await define('points');
    await expect(sheet).toHaveClass(/quick/);
    expect(await sheet.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  });
}

for (const width of [1366, 320, 360, 390, 430]) {
  test(`phase 3 context Quick and Full at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Paste and edit formatted text' }).fill(Array.from({ length: 24 }, () => 'We maintain public confidence through careful work.').join('\n\n'));
    await page.getByRole('button', { name: /Preview & read/ }).click();
    await expect(page.locator('.reader-text')).toBeVisible();
    await page.evaluate(() => {
      const root = document.querySelector('.reader-text')!;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const start = node.textContent?.indexOf('maintain') ?? -1;
        if (start < 0) continue;
        const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + 8);
        const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
        root.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); break;
      }
    });
    await page.locator('.selection-actions').getByRole('button', { name: 'Define', exact: true }).click();
    const sheet = page.locator('.lookup-sheet');
    await expect(sheet.getByRole('button', { name: 'Show more', exact: true })).toBeVisible();
    await expect(sheet).toHaveClass(/quick/);
    await expect(sheet.getByRole('button', { name: 'Pronounce word' })).toBeVisible();
    await expect(sheet.locator('.inspector-pronunciation .language-cycle')).toContainText('EN+VI');
    await expect(sheet.locator('.inspector-pronunciation .language-cycle span')).toHaveText('↻');
    await expect(sheet.locator('.inspector-header-actions [aria-label="Add note"]')).toHaveText('Note');
    const position = await page.evaluate(() => scrollY);
    await sheet.getByRole('button', { name: 'Save word', exact: true }).click();
    await expect(sheet.getByRole('button', { name: 'Remove saved word' })).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: `tmp/phase3/quick-${width}.png` });
    await sheet.getByRole('button', { name: 'Show more', exact: true }).click();
    await expect(sheet).toHaveClass(/expanded/);
    const language = sheet.locator('.language-cycle');
    const cycle = [['EN+VI', 'bilingual'], ['EN', 'en'], ['VI', 'vi'], ['EN+VI', 'bilingual']];
    for (let index = 0; index < cycle.length; index++) {
      const [label, mode] = cycle[index];
      await expect(language).toContainText(label);
      await expect(sheet.locator('.deep-explanation')).toHaveAttribute('data-language', mode);
      if (index < cycle.length - 1) await language.click();
    }
    const note = sheet.locator('.inspector-header-actions').getByRole('button', { name: 'Add note' });
    await expect(note).toHaveText('Note');
    expect(await note.evaluate(el => el.nextElementSibling?.getAttribute('aria-label'))).toBe('Remove saved word');
    if (width >= 1024) {
      for (const viewportWidth of [1024, 1366]) {
        await page.setViewportSize({ width: viewportWidth, height: 850 });
        expect(await sheet.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
        expect(await sheet.locator('.inspector-header-actions').evaluate(el => el.getBoundingClientRect().right <= el.closest('.lookup-sheet')!.getBoundingClientRect().right)).toBe(true);
      }
    }
    await page.screenshot({ path: `tmp/phase3/full-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const headerBefore = await sheet.locator('.inspector-header').boundingBox();
    if (width === 320) {
      await page.emulateMedia({ colorScheme: 'dark' });
      for (const theme of ['light', 'dark', 'system']) {
        await page.locator('html').evaluate((el, value) => el.setAttribute('data-theme', value), theme);
        await sheet.locator('.sense-definition,.sense-vi,.unpaired-meanings li').evaluateAll(elements => {
          for (const el of elements) el.textContent = `${el.textContent} ${'Long English definition và nghĩa tiếng Việt liên kết '.repeat(12)} ${'unbroken'.repeat(30)}`;
        });
        expect(await sheet.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
        expect(await sheet.locator('.inspector-body').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
        await sheet.locator('.inspector-sources').evaluate(el => { (el as HTMLDetailsElement).open = true; });
        await sheet.locator('.inspector-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
        await page.screenshot({ path: `tmp/mobile-reader/sources-long-${theme}.png` });
        await sheet.locator('.inspector-sources').evaluate(el => { (el as HTMLDetailsElement).open = false; });
      }
      await page.locator('html').evaluate(el => el.setAttribute('data-theme', 'light'));
    }
    await sheet.locator('.inspector-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
    expect((await sheet.locator('.inspector-header').boundingBox())!.y).toBe(headerBefore!.y);
    await sheet.getByRole('button', { name: 'Close meaning', exact: true }).click();
    await expect(sheet).toHaveCount(0);
    expect(await page.evaluate(() => scrollY)).toBe(position);
    expect(await page.evaluate(() => document.querySelector('.sheet-backdrop'))).toBeNull();
    await page.getByRole('button', { name: 'Reader menu' }).click();
    await page.getByRole('menuitem', { name: 'Context panel', exact: true }).click();
    await expect(page.locator('.lookup-sheet')).toBeVisible();
    await expect(page.locator('.lookup-sheet').getByRole('button', { name: 'Remove saved word' })).toBeVisible();
  });
}

test('interface density and appearance remain independent and persist', async ({ page }) => {
  await page.goto('/');
  const advanced = page.getByRole('button', { name: 'Advanced', exact: true });
  await expect(advanced).toBeEnabled();
  await advanced.click();
  await page.getByLabel('Appearance', { exact: true }).selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('textbox', { name: 'Paste and edit formatted text' }).fill('A quiet reader helps people understand a difficult passage.');
  await page.getByRole('button', { name: /Preview & read/ }).click();
  await expect(page.locator('.reader-shell')).toHaveAttribute('data-interface-mode', 'advanced');
  await page.reload();
  await expect(advanced).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Appearance', { exact: true })).toHaveValue('dark');
  await page.getByRole('button', { name: 'Simple', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByLabel('Appearance', { exact: true }).selectOption('system');
  expect(await page.locator('html').evaluate(el => getComputedStyle(el).colorScheme)).toBe('dark');
  await page.getByLabel('Appearance', { exact: true }).selectOption('light');
  expect(await page.locator('html').evaluate(el => getComputedStyle(el).colorScheme)).toBe('light');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [320, 360, 390, 430]) {
  test(`reading controls remain reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Start reading.' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Paste and edit formatted text' }).fill('A quiet reader helps people understand a difficult passage.');
    await page.getByRole('button', { name: /Preview & read/ }).click();
    await expect(page.getByRole('button', { name: 'Back to library' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Contents', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Markup', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Markup tools' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Highlight', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Note', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByRole('button', { name: 'Reader menu' }).click();
    await expect(page.getByRole('menuitem', { name: 'Text and theme' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Text and theme' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const width of [1024, 1280, 1366, 1440, 1920, 390]) {
  for (const mode of ['Simple', 'Advanced']) {
    test(`reader shell ${mode} at ${width}px keeps panels independent and navigation usable`, async ({ page }) => {
      await page.setViewportSize({ width, height: 850 });
      await page.goto('/');
      await expect(page.getByRole('button', { name: mode, exact: true })).toBeEnabled();
      await page.getByRole('button', { name: mode, exact: true }).click();
      await page.getByRole('textbox', { name: 'Paste and edit formatted text' }).fill('A quiet reader helps people understand a difficult passage.');
      await page.getByRole('button', { name: /Preview & read/ }).click();
      const shell = page.locator('.reader-shell');
      const desktopAdvanced = width >= 1024 && mode === 'Advanced';
      await expect(shell).toHaveClass(desktopAdvanced ? /has-contents/ : /^(?!.*has-contents).*$/);
      await expect(shell).not.toHaveClass(/has-context/);
      await page.screenshot({ path: `tmp/phase2/reader-${mode.toLowerCase()}-${width}.png` });
      const action = async (panel: 'Document' | 'Context') => {
        if (desktopAdvanced) await page.locator('.reader-header').getByRole('button', { name: panel === 'Document' ? 'Contents' : 'Context panel', exact: true }).click();
        else {
          await page.getByRole('button', { name: 'Reader menu', exact: true }).click();
          await page.getByRole('menuitem', { name: panel === 'Document' ? 'Document / Contents' : 'Context panel', exact: true }).click();
        }
      };
      if (desktopAdvanced) await action('Document');
      await action('Document');
      await expect(page.locator('.contents-panel')).toBeVisible();
      if (width < 1024) await page.locator('.contents-panel').getByRole('button', { name: 'Close document panel', exact: true }).click();
      await action('Context');
      await expect(page.locator('.context-panel')).toBeVisible();
      await page.screenshot({ path: `tmp/phase2/panels-${mode.toLowerCase()}-${width}.png` });
      if (width >= 1024) {
        await expect(shell).toHaveClass(/has-contents/);
        expect(await page.locator('.reader-viewport').evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(width / 2);
        expect(await page.locator('.reader-text').evaluate(el => {
          const content = el.getBoundingClientRect();
          const viewport = el.closest('.reader-viewport')!.getBoundingClientRect();
          return content.left >= viewport.left && content.right <= viewport.right;
        })).toBe(true);
      } else {
        await expect(page.locator('.contents-panel')).toHaveCount(0);
        await expect(page.locator('.context-panel')).toHaveAttribute('aria-modal', 'true');
      }
      await page.getByRole('button', { name: 'Open notes', exact: true }).click();
      await expect(page.locator('.notes-panel')).toBeVisible();
      await page.locator('.notes-panel').getByRole('button', { name: 'Close notes', exact: true }).click();
      if (width >= 1024) await expect(shell).toHaveClass(/has-contents/);
      await page.getByRole('button', { name: 'Reading appearance', exact: true }).click();
      await page.getByRole('dialog', { name: 'Reader settings' }).getByRole('button', { name: mode === 'Simple' ? 'Advanced' : 'Simple', exact: true }).click();
      await expect(shell).toHaveAttribute('data-interface-mode', mode === 'Simple' ? 'advanced' : 'simple');
      await page.getByRole('button', { name: 'Close reader settings', exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const footer = await page.locator('.reader-progress').boundingBox();
      expect(footer!.y + footer!.height).toBeLessThanOrEqual(851);
    });
  }
}

test('mobile reading chrome hides on scroll and reveals without changing position', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Paste and edit formatted text' }).fill(Array.from({ length: 60 }, (_, index) => `Paragraph ${index + 1}. A quiet reader gives this passage room to breathe.`).join('\n\n'));
  await page.getByRole('button', { name: /Preview & read/ }).click();
  await expect(page.locator('.reader-text')).toBeVisible();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
  await page.mouse.move(150, 350);
  await page.mouse.wheel(0, 500);
  await expect(page.getByRole('button', { name: 'Show reading controls', exact: true })).toBeVisible();
  const position = await page.evaluate(() => scrollY);
  await page.getByRole('button', { name: 'Show reading controls', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Back to library' })).toBeVisible();
  expect(await page.evaluate(() => scrollY)).toBe(position);
});
