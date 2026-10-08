/**
 * Rules whose subject is the Reader chrome surface itself rather than one
 * chrome band. Grouped here because each is small and each would otherwise be a
 * one-test file with a name that repeats its rule ID.
 *
 * Coverage (docs/reader-behavior-contract.md v2):
 *   ARCH-5  no Reader FAB, Search or Form Fill entry at any band; the
 *           Context-panel-entry half waits for P2b
 *   MODE-1  changing Text <-> PDF never alters content, extraction, OCR state,
 *           page identity, geometry or chrome state
 *   MODE-2  with no readable text the mode control is hidden or disabled with a
 *           programmatically perceivable state, never an enabled no-op
 *   FTR-3   at >=1024px the Header Markup group is the direct control: Highlight,
 *           Underline and Erase are in the group and no dialog button duplicates
 *           them (desktop half; the mobile palette is FTR-3's other half)
 *
 * Every control name reached here goes through `readerNames`, so P2b renames a
 * name once. Nothing in this spec asserts the retired reserved-strip chrome.
 *
 * Execution tier: split by tag, as always. ARCH-5 uses a text document and
  * carries no @pdf, so it runs in FAST; MODE-1, MODE-2 and FTR-3 are PDF-bound:
  *   PW_TIER=fast       npx playwright test --config playwright.tiers.config.ts e2e/reader-contract-surface.spec.ts --grep @ARCH-5
  *   PW_TIER=pdf-normal npx playwright test --config playwright.tiers.config.ts e2e/reader-contract-surface.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import { pdfFixture } from './pdfFixture';
import { pdfScanFixture } from './pdfScanFixture';
import { readerGeometry, expectViewportStable, expectLocationIdentical } from './readerO';
import { modeControl } from './readerNames';

/** Opens a PDF reader in its native Original view at the given viewport. */
async function openOriginalPdf(page: Page, name: string, buffer: Buffer, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'application/pdf', buffer });
  await modeControl(page, 'text').click();
  await expect(page.locator('.pdf-page-slot').first()).toBeVisible();
}

test.describe('ARCH-5 — no FAB, Search or Form Fill in the Reader', () => {
  // ARCH-5 has three present-absent subjects in this commit. The Context-panel
  // entry is deliberately absent from this list: it is not true until P2b
  // removes it, and asserting it now would commit a red test.
  const forbidden = [
    'FAB', 'Floating action button', 'Open menu', 'Search', 'Search document',
    'Form Fill', 'Fill form', 'Fill and sign',
  ];

  for (const [band, width, height] of [
    ['mobile 390px', 390, 844],
    ['desktop 1280px', 1280, 900],
  ] as const) {
    test(`the Reader exposes no FAB, Search or Form Fill at ${band} @ARCH-5`, async ({ page }) => {
      test.setTimeout(90_000);
      const passage = Array.from({ length: 20 }, (_, i) => `Paragraph ${i + 1}. A quiet reader needs no extra surface.`).join('\n\n');
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await page.getByRole('textbox', { name: 'Paste and edit formatted text' }).fill(passage);
      await page.getByRole('button', { name: /Preview & read/ }).click();
      await expect(page.locator('.reader-text')).toBeVisible();

      // Read by role over the whole shell, not a band, so a control added to
      // either band fails here.
      const shell = page.locator('.reader-shell');
      for (const name of forbidden) {
        await expect(shell.getByRole('button', { name, exact: true })).toHaveCount(0);
        await expect(shell.getByRole('link', { name, exact: true })).toHaveCount(0);
        await expect(shell.getByRole('menuitem', { name, exact: true })).toHaveCount(0);
      }
      // A FAB has no accessible name of its own, so it is asserted structurally:
      // the shell owns exactly one sticky-positioned surface, the chrome band,
      // and no fixed/absolute button floats over the content.
      const floating = await shell.evaluate(root =>
        Array.from(root.querySelectorAll<HTMLElement>('button, a')).filter(el => {
          const position = getComputedStyle(el).position;
          if (position !== 'fixed' && position !== 'sticky') return false;
          return !el.closest('.reader-header, .reader-progress, .reader-reveal');
        }).map(el => el.getAttribute('aria-label') ?? el.textContent?.trim() ?? el.className));
      expect(floating, 'a Reader control floats over the content outside the chrome bands').toEqual([]);
      // No floating action is reachable from More either.
      await page.getByRole('button', { name: 'Reader menu' }).click();
      await expect(page.getByRole('menu', { name: 'Reader actions' })).toBeVisible();
      for (const name of forbidden) {
        await expect(page.getByRole('menuitem', { name, exact: true })).toHaveCount(0);
      }
    });
  }
});

test.describe('MODE-1 — Text <-> PDF changes presentation only', () => {
  for (const [band, width, height] of [
    ['mobile 390px', 390, 844],
    ['desktop 1280px', 1280, 900],
  ] as const) {
    test(`switching Text <-> PDF leaves content, page identity and geometry unchanged at ${band} @pdf @MODE-1`, async ({ page }) => {
      test.setTimeout(120_000);
      await openOriginalPdf(page, 'mode-1.pdf', pdfFixture(6), width, height);

      // Content: the same pages stay rendered, with the same text layer, so the
      // round trip changed presentation and nothing about the document.
      const before = await readerGeometry(page);
      const pagesBefore = await page.locator('.pdf-page-slot').count();
      const textBefore = await page.locator('[data-pdf-page="1"] .pdf-text-layer').innerText();

            await modeControl(page, 'pdf').click();
            await expect(page.locator('.pdf-reading-page').first()).toBeVisible();

            // Reading state, not geometry: the Reading view owns its own scroll
            // container, so `expectViewportStable` would compare the wrong box. The
            // invariants MODE-1 names are content, extraction and OCR state, plus page
            // identity; page geometry is asserted on the leg that keeps it. The same
            // pages are extracted in Reading form: no canvas survives the switch
            // (Reading renders text, not bitmaps), no page is dropped and no OCR page
            // appears for a document with extractable text.
            await expect(page.locator('.pdf-canvas')).toHaveCount(0);
            await expect(page.locator('.pdf-reading-page')).toHaveCount(pagesBefore);
            await expect(page.locator('.pdf-ocr-page')).toHaveCount(0);
            expect(await page.locator('.pdf-page-slot').count()).toBe(0);
            expect((await page.locator('.pdf-reading-scroll').innerText()).length, 'the Reading view lost the document text').toBeGreaterThan(0);

      await modeControl(page, 'text').click();
      await expect(page.locator('[data-pdf-page="1"] .pdf-canvas')).toBeVisible();

      // Back in Original at the top of the same document: page identity and the
      // reading box are untouched, and the extracted text is byte-identical, so
      // extraction was not recomputed into something else.
      const after = await readerGeometry(page);
      expect(after.slotIds, 'rendered page identity changed across a mode round trip').toBe(before.slotIds);
      expect(await page.locator('.pdf-page-slot').count()).toBe(pagesBefore);
      expect(await page.locator('[data-pdf-page="1"] .pdf-text-layer').innerText()).toBe(textBefore);
      await expectViewportStable(page, before);
      await expectLocationIdentical(page, before);
    });
  }
});

test('with no readable text the mode control is disabled, not an enabled no-op @pdf @MODE-2', async ({ page }) => {
  test.setTimeout(120_000);
  // An image-only page: extraction finds no text layer, so `canRead` is false
  // and the Reading member has nothing to switch to.
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 612; canvas.height = 792;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#111'; context.font = 'bold 36px Arial';
    context.fillText('A SCANNED PAGE WITH NO TEXT LAYER', 40, 200);
    return canvas.toDataURL('image/jpeg', .9).split(',')[1];
  });
  await openOriginalPdf(page, 'mode-2.pdf', pdfScanFixture(Buffer.from(jpeg, 'base64'), 612, 792), 390, 844);

  // MODE-2 admits either form, but never an enabled no-op. Whichever form the
  // UI takes, the Reading member must carry a state a screen reader can read.
  const reading = modeControl(page, 'pdf');
  if (await reading.count()) {
    await expect(reading, 'the Reading mode control is offered on a page with no readable text and is enabled').toBeDisabled();
    // `disabled` is the perceivable state. A visually-disabled control that only
    // looked grey would fail this.
    await expect(reading).toHaveAttribute('disabled', '');
  } else {
    // Hidden is the other allowed form: the group must not offer a member that
    // silently does nothing.
    await expect(page.locator('.pdf-mode-switch').getByRole('button')).toHaveCount(1);
  }

  // The original view is untouched by that, so the reader is not stranded.
  await expect(page.locator('[data-pdf-page="1"] .pdf-canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Current PDF page' })).toHaveText('1 / 1');
});

test('at 1280px the Header Markup group is the direct Highlight, Underline and Erase control @pdf @FTR-3', async ({ page }) => {
  test.setTimeout(90_000);
  await openOriginalPdf(page, 'markup-desktop.pdf', pdfFixture(4), 1280, 900);

  // FTR-3 desktop half: the three tools are in the Header group, reachable
  // directly. No second Markup entry, and no dialog button standing in for the
  // group.
  const group = page.getByRole('group', { name: 'Markup tools' });
  await expect(group).toBeVisible();
  for (const tool of ['Highlight', 'Underline', 'Erase']) {
    await expect(group.getByRole('button', { name: tool, exact: true })).toBeVisible();
  }

  // Each carries its own pressed state, so a tool is one tool state rather than
  // three unrelated actions.
  await group.getByRole('button', { name: 'Highlight', exact: true }).click();
  await expect(group.getByRole('button', { name: 'Highlight', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await group.getByRole('button', { name: 'Underline', exact: true }).click();
  await expect(group.getByRole('button', { name: 'Underline', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(group.getByRole('button', { name: 'Highlight', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await group.getByRole('button', { name: 'Erase', exact: true }).click();
  await expect(group.getByRole('button', { name: 'Erase', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(group.getByRole('button', { name: 'Underline', exact: true })).toHaveAttribute('aria-pressed', 'false');

  // The direct control means no dialog stands in for the group: pressing a tool
    // must not open a Markup surface.
    await expect(page.getByRole('dialog', { name: 'Markup tools' })).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

test('at 390px the Footer Markup action opens the palette above the bar and returns focus @pdf @FTR-3 @A11Y-3', async ({ page }) => {
  test.setTimeout(90_000);
  await openOriginalPdf(page, 'markup-mobile.pdf', pdfFixture(4), 390, 844);

  // FTR-3 mobile half: the Footer owns the single Markup opener. It is a dialog
  // disclosure, not a tool toggle, and it is the only Markup entry at this band.
  const trigger = page.getByRole('button', { name: 'Markup', exact: true });
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('menuitem', { name: 'Markup', exact: true })).toHaveCount(0);

  await trigger.click();
  const palette = page.getByRole('dialog', { name: 'Markup tools' });
  await expect(palette).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  for (const tool of ['Highlight', 'Underline', 'Erase']) {
    await expect(palette.getByRole('button', { name: tool, exact: true })).toBeVisible();
  }
  // ARCH-7: Notes is not a chrome action, so the palette offers no Note entry.
  await expect(palette.getByRole('button', { name: 'Note', exact: true })).toHaveCount(0);

  // FTR-3: the palette opens ABOVE the Footer bar.
  const [paletteBox, footerBox] = await Promise.all([palette.boundingBox(), page.locator('.reader-progress').boundingBox()]);
  expect(paletteBox!.y + paletteBox!.height, 'the Markup palette is not above the Footer bar').toBeLessThanOrEqual(footerBox!.y + 1);

  // A11Y-3: dismissing the palette returns focus to its opener.
  await palette.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(palette).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});