/**
 * Phase 2 — MobileChrome. Proves the frozen contract behaviour that only becomes
 * observable on the mobile presentation band (docs/reader-behavior-contract.md).
 *
 * Locator style follows §15.1: surfaces are found by role or accessible name and
 * assertions are stated in product terms. Input is real (§15.3) — wheel and CDP
 * touch only; `scrollTop` is never written and no synthetic `scroll` event is
 * dispatched anywhere in this file (§15.0).
 *
 * Bands (§15.6): 320, 390, 767, 768, 1023, 1024, plus the landscape pairs
 * 844x390 and 915x412. 1024px is the sole responsive authority and there is no
 * tablet variant, so 768x900 and 1023x900 are asserted to present identically to
 * 390x844 rather than to any separate layout.
 *
 * Execution tier: READER
 *   PW_TIER=reader npx playwright test --config playwright.tiers.config.ts e2e/mobile-chrome.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import { pdfFixture } from './pdfFixture';
import { expectMobileChrome, readerScrollBy, readerGeometry, openMore, closeMore, togglePdfMode } from './readerO';

/** §15.6 responsive matrix. 900 is the repository portrait convention; landscape uses real device heights. */
const MATRIX = [
  { name: '320x900 (narrowest)', width: 320, height: 900 },
  { name: '390x900 (phone)', width: 390, height: 900 },
  { name: '767x900 (phone boundary)', width: 767, height: 900 },
  { name: '768x900 (above the phone band)', width: 768, height: 900 },
  { name: '1023x900 (desktop boundary - 1)', width: 1023, height: 900 },
  { name: '844x390 (landscape)', width: 844, height: 390 },
  { name: '915x412 (landscape)', width: 915, height: 412 },
] as const;

const PASSAGE = Array.from({ length: 80 }, (_, i) =>
  `Paragraph ${i + 1}. A quiet reader gives this passage room to breathe.`).join('\n\n');

/** Opens the Reader on a text document at the given viewport. */
async function openTextReader(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Paste and edit formatted text' }).fill(PASSAGE);
  await page.getByRole('button', { name: /Preview & read/ }).click();
  await expect(page.locator('.reader-text')).toBeVisible();
  // U1: open -> geometry reconciliation at scrollTop 0 -> settle. The reference state is
  // observed once the layout has settled, never by writing scrollTop. The settle signal is
  // the first readable line clearing the overlaid Header.
  await expect
    .poll(async () => page.evaluate(() => {
      const line = document.querySelector<HTMLElement>('.reader-text p');
      const header = document.querySelector<HTMLElement>('.reader-header');
      return line && header ? line.getBoundingClientRect().top - header.getBoundingClientRect().bottom : NaN;
    }), { timeout: 10_000 })
    .toBeGreaterThan(-0.5);
}

/** Opens the Reader on a PDF in Original mode, where the Footer owns the zoom stepper (§8.2). */
async function openPdfReader(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await page.locator('input[type=file]')
    .setInputFiles({ name: 'mobile-chrome.pdf', mimeType: 'application/pdf', buffer: pdfFixture(12) });
  await togglePdfMode(page, 'Original');
  await expect(page.locator('.pdf-page-slot').first()).toBeVisible();
  await page.waitForTimeout(300);
}

test.describe('MobileChrome — presentation band', () => {
  for (const size of MATRIX) {
    test(`mobile Chrome presents and stays usable at ${size.name}`, async ({ page }) => {
      test.setTimeout(90_000);
      await openTextReader(page, size.width, size.height);

      // §7.1/§7.2 — the Header owns Back, the title, and (PDF only) Original/Reading. Nothing else.
      const header = page.locator('.reader-header');
      await expect(header.getByRole('button', { name: 'Back to library' })).toBeVisible();
      for (const action of ['Contents', 'Context', 'Notes', 'Markup', 'Text', 'Languages', 'Document', 'Click lookup', 'OCR next', 'Search']) {
        await expect(header.getByRole('button', { name: action, exact: true })).toHaveCount(0);
      }

      // §9.1/§9.4 — one More disclosure, in the Footer, owning the whole §9.3 inventory.
      await expect(page.locator('.reader-progress').getByRole('button', { name: 'Reader menu' })).toBeVisible();
      await openMore(page);
      for (const action of ['Contents', 'Context', 'Notes', 'Markup', 'Text', 'Languages', 'Document', 'Click lookup']) {
        await expect(page.getByRole('menuitem', { name: action, exact: true })).toHaveCount(1);
      }
      // §8.3 — zoom is a direct Footer control and MUST NOT appear in More.
      await expect(page.getByRole('menuitem', { name: /Zoom/ })).toHaveCount(0);
      // §9.5 — a bottom sheet inside the viewport, with no horizontal overflow.
      const sheet = await page.getByRole('menu', { name: 'Reader actions' }).boundingBox();
      expect(sheet!.x).toBeGreaterThanOrEqual(0);
      expect(sheet!.x + sheet!.width).toBeLessThanOrEqual(size.width + 1);
      expect(sheet!.y + sheet!.height).toBeLessThanOrEqual(size.height + 1);
      await closeMore(page);

      // §8.6/§9.5 — Footer stays laid out and the page never overflows horizontally.
      await expect(page.locator('.reader-progress')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }

  test('1024px is the responsive authority: the Header is a Desktop overlay band there', async ({ page }) => {
    test.setTimeout(90_000);
    await openTextReader(page, 1024, 900);
    // §4.3 — quiet/reveal is a mobile-only model; at 1024 the chrome never quiets.
      const before = await textChrome(page);
      await page.mouse.move(512, 450);
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(250);
      await page.mouse.wheel(0, -600);
      await page.waitForTimeout(250);
      expect((await textChrome(page)).headerOpacity).toBeGreaterThan(0.9);
      expect((await textChrome(page)).footerOpacity).toBeGreaterThan(0.9);
      // §4.2 — desktop chrome is always visible, so it is never a geometry event either.
      expect((await textChrome(page)).contentHeight).toBe(before.contentHeight);
      // §9.2 — More is a popover at >=1024, still the same single disclosure.
      await openMore(page);
      const popover = await page.getByRole('menu', { name: 'Reader actions' }).boundingBox();
      // A popover sits inside the viewport and does not span it as a bottom sheet would.
      expect(popover!.height).toBeLessThan(450);
      expect(popover!.y).toBeGreaterThan(0);
    });
});

/** Reads the chrome and geometry facts the text surface exposes. The PDF-only
    `readerGeometry` helper is not applicable here, so this reads the same
    product semantics from the text surface directly. */
async function textChrome(page: Page) {
  return page.evaluate(() => {
    const box = (sel: string) => {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) throw new Error(`text surface element missing: ${sel}`);
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height, opacity: Number(getComputedStyle(el).opacity) };
    };
    const header = box('.reader-header');
    const footer = box('.reader-progress');
    const firstLine = document.querySelector<HTMLElement>('.reader-text p');
    return {
      headerBottom: header.bottom,
      headerOpacity: header.opacity,
      footerTop: footer.top,
      footerOpacity: footer.opacity,
      firstLineTop: firstLine ? firstLine.getBoundingClientRect().top : NaN,
            // Scroll-invariant form of the same fact: the offset of the first line inside the
            // reading container. `firstLineTop` alone moves with the viewport whenever the user
            // scrolls, which is not a geometry change (A12 G1-G3 only forbid chrome-induced ones).
            firstLineInContent: firstLine ? firstLine.getBoundingClientRect().top + window.scrollY : NaN,
            contentHeight: document.querySelector<HTMLElement>('.reader-text')?.scrollHeight ?? 0,
            scrollY: window.scrollY,
            overflowX: document.documentElement.scrollWidth > innerWidth,
          };
        });
      }
      /** §4.1/§4.2 — quiet is a two-state visual model and it never touches the reading box. */
      async function expectQuietVisualOnly(page: Page, before: Awaited<ReturnType<typeof textChrome>>) {
        const after = await textChrome(page);
        // §4.2/A12 G1-G3 — quiet is visual-only: it hides the Header overlay but must not move
        // or resize the reading box, change content height, change the scroll position, or reflow.
        // Every compared value is scroll-invariant, so a real user scroll in between cannot mask or
        // fake a geometry change. The Header's own offset is deliberately NOT compared: sliding it
        // out of the viewport is the quiet transition itself, not a geometry event.
        expect(after.contentHeight).toBe(before.contentHeight);
        expect(after.firstLineInContent).toBeCloseTo(before.firstLineInContent, 0);
        expect(after.footerTop).toBeCloseTo(before.footerTop, 0);
        expect(after.footerOpacity).toBeGreaterThan(0.9);
        expect(after.overflowX).toBe(false);
        return after;
      }

test.describe('MobileChrome — quiet and reveal', () => {
  test('real user scroll quiets the Header while the Footer stays visible (§4.1/§8.4)', async ({ page }) => {
    test.setTimeout(90_000);
    await openTextReader(page, 390, 900);
    const before = await textChrome(page);

    await page.mouse.move(195, 450);
    await page.mouse.wheel(0, 600);
    await expect.poll(async () => (await textChrome(page)).headerOpacity, { timeout: 5_000 }).toBeLessThan(0.1);

    const quiet = await expectQuietVisualOnly(page, before);
    // §4.2 — quiet hides the Header only. The Footer is never quieted with it.
    expect(quiet.footerOpacity).toBeGreaterThan(0.9);
  });

  test('real upward scroll reveals the Header (§6.0/§6.1/§6.3)', async ({ page }) => {
    test.setTimeout(90_000);
    await openTextReader(page, 390, 900);
    await page.mouse.move(195, 450);
    await page.mouse.wheel(0, 600);
    await expect.poll(async () => (await textChrome(page)).headerOpacity, { timeout: 5_000 }).toBeLessThan(0.1);
    const before = await textChrome(page);

    // §6.3 — reveal needs the shared 32px accumulated travel, not a single small delta.
    await page.mouse.wheel(0, -120);
    await expect.poll(async () => (await textChrome(page)).headerOpacity, { timeout: 5_000 }).toBeGreaterThan(0.9);
    await expectQuietVisualOnly(page, before);
  });

  test('a small upward correction below the travel threshold does not reveal (§6.3)', async ({ page }) => {
    test.setTimeout(90_000);
    await openTextReader(page, 390, 900);
    await page.mouse.move(195, 450);
    await page.mouse.wheel(0, 600);
    await expect.poll(async () => (await textChrome(page)).headerOpacity, { timeout: 5_000 }).toBeLessThan(0.1);

    // §6.3 — the old single-delta rule (`delta < -8` revealed) is gone; an incidental
    // upward twitch under the accumulated threshold must leave the chrome quiet.
    await page.mouse.wheel(0, -10);
    await page.waitForTimeout(150);
    expect((await textChrome(page)).headerOpacity).toBeLessThan(0.1);
  });

  test('touch scroll quiets and reveals exactly like wheel (§5.4)', async ({ page }) => {
    test.setTimeout(90_000);
    await openTextReader(page, 390, 900);
    // On the text Reader the reading text is the scroll surface (the window scrolls), so the
        // gesture must start and end on it. Its box is far taller than the viewport, so both touch
        // points are clamped into the visible intersection: a touch dispatched outside the viewport
        // is not a user gesture at all.
        const swipe = async (dy: number) => {
          const box = (await page.locator('.reader-text').boundingBox())!;
          const x = box.x + box.width / 2;
          const top = Math.max(box.y, 0) + 8;
          const bottom = Math.min(box.y + box.height, page.viewportSize()!.height) - 8;
          const startY = dy > 0 ? bottom - (bottom - top) * 0.25 : top + (bottom - top) * 0.25;
          const endY = Math.min(Math.max(startY - dy, top), bottom);
          const cdp = await page.context().newCDPSession(page);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: startY }] });
          for (let step = 1; step <= 12; step++) {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: startY + ((endY - startY) * step) / 12 }] });
            await page.waitForTimeout(16);
          }
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await page.waitForTimeout(120);
        };
    await swipe(600);
    await expect.poll(async () => (await textChrome(page)).headerOpacity, { timeout: 5_000 }).toBeLessThan(0.1);
    await swipe(-160);
    await expect.poll(async () => (await textChrome(page)).headerOpacity, { timeout: 5_000 }).toBeGreaterThan(0.9);
  });

  test('a tap does not toggle or reveal chrome (§5.3/§6.7/§15.11)', async ({ page }) => {
    test.setTimeout(90_000);
    await openTextReader(page, 390, 900);
    await page.mouse.move(195, 450);
    await page.mouse.wheel(0, 600);
    await expect.poll(async () => (await textChrome(page)).headerOpacity, { timeout: 5_000 }).toBeLessThan(0.1);
    const before = await textChrome(page);
    const box = (await page.locator('.reader-text').boundingBox())!;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;

    await page.mouse.click(cx, cy);
    await page.mouse.dblclick(cx, cy);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();

    expect((await textChrome(page)).headerOpacity).toBeLessThan(0.1);
    await expectQuietVisualOnly(page, before);
  });

  test('the dedicated reveal control is a one-way, non-toggling escape (§6.5/§6.6/§6.7)', async ({ page }) => {
    test.setTimeout(90_000);
    await openTextReader(page, 390, 900);
    await page.mouse.move(195, 450);
    await page.mouse.wheel(0, 600);
    await expect.poll(async () => (await textChrome(page)).headerOpacity, { timeout: 5_000 }).toBeLessThan(0.1);
    const before = await textChrome(page);

    const reveal = page.getByRole('button', { name: 'Show reading controls' });
    await expect(reveal).toBeVisible();
    await expect(reveal).not.toHaveAttribute('aria-haspopup', /.*/);
    await expect(reveal).not.toHaveAttribute('aria-expanded', /.*/);
    await expect(page.getByRole('menu')).toHaveCount(0);

    // §16.1/§6.9 — the control anchors directly above the reserved Footer band.
    const control = await reveal.evaluate(el => { const r = el.getBoundingClientRect(); return { bottom: r.bottom, height: r.height }; });
    expect(control.height).toBeGreaterThanOrEqual(44);
    expect(control.bottom).toBeLessThanOrEqual(before.footerTop + 0.5);

    await reveal.click();
    await expect.poll(async () => (await textChrome(page)).headerOpacity, { timeout: 5_000 }).toBeGreaterThan(0.9);
    // §6.6 — reveal only, never toggle: the control does not survive the reveal.
    await expect(reveal).toHaveCount(0);
    await expectQuietVisualOnly(page, before);
  });

  test('the reveal control stays operable at 320px and in both landscape pairs (§6.9)', async ({ page }) => {
    for (const [width, height] of [[320, 700], [844, 390], [915, 412]] as const) {
      await openTextReader(page, width, height);
      await page.mouse.move(width / 2, height / 2);
      await page.mouse.wheel(0, 600);
      await expect.poll(async () => (await textChrome(page)).headerOpacity, { timeout: 5_000 }).toBeLessThan(0.1);
      const quiet = await textChrome(page);
      const reveal = page.getByRole('button', { name: 'Show reading controls' });
      await expect(reveal).toBeVisible();
      const box = await reveal.boundingBox();
      // §6.9 — inside the viewport and clear of the Footer band at every mobile width.
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(quiet.footerTop + 0.5);
    }
  });

  test('focus entering the Chrome reveals it; focus in the reading surface does not (§6.4)', async ({ page }) => {
    test.setTimeout(90_000);
    await openTextReader(page, 390, 900);
    await page.mouse.move(195, 450);
    await page.mouse.wheel(0, 600);
    await expect.poll(async () => (await textChrome(page)).headerOpacity, { timeout: 5_000 }).toBeLessThan(0.1);

    // §6.4 — focus entering real chrome reveals it.
    await page.locator('.reader-progress').getByRole('button', { name: 'Reader menu' }).focus();
    await expect.poll(async () => (await textChrome(page)).headerOpacity, { timeout: 5_000 }).toBeGreaterThan(0.9);

    await page.mouse.move(195, 450);
    await page.mouse.wheel(0, 600);
    await expect.poll(async () => (await textChrome(page)).headerOpacity, { timeout: 5_000 }).toBeLessThan(0.1);
        // §6.4 — the reading surface is not chrome and must never reveal it. The reading text is
        // keyboard focusable in its own right (§14.2), so focus is moved by keyboard semantics rather
        // than by a click, which would instead create a text selection (§4.4 selection gate).
        await page.getByRole('article', { name: /Document content/ }).focus();
        await page.waitForTimeout(150);
        expect((await textChrome(page)).headerOpacity).toBeLessThan(0.1);
      });

  test('a page jump through Contents does not drive chrome state (§4.4/§5.1/§5.2)', async ({ page }) => {
    test.setTimeout(90_000);
    await openTextReader(page, 390, 900);
    await page.mouse.move(195, 450);
    await page.mouse.wheel(0, 600);
    await expect.poll(async () => (await textChrome(page)).headerOpacity, { timeout: 5_000 }).toBeLessThan(0.1);

      // §4.4 — a blocking overlay holds the chrome revealed, so opening Contents reveals it.
      // That reveal belongs to the overlay, not to the navigation, which is what the rest of this
      // test isolates: the programmatic page jump itself must neither reveal nor quiet the chrome.
      await openMore(page);
      await page.getByRole('menuitem', { name: 'Contents', exact: true }).click();
      await expect(page.locator('.contents-panel')).toBeVisible();
      await expect.poll(async () => (await textChrome(page)).headerOpacity, { timeout: 5_000 }).toBeGreaterThan(0.9);

      const beforeJump = await textChrome(page);
      await page.locator('.contents-panel').getByRole('button', { name: 'Go to location' }).click();
      const goto = page.getByRole('dialog', { name: /Go to|Lookup/ }).first();
      if (await goto.count()) {
        const field = goto.getByRole('spinbutton').first();
              // The field is a percentage, not a page number: a text document has no page offsets, so the
              // value must fall inside 0-100 for the jump to be applicable at all.
              if (await field.count()) { await field.fill('75'); await field.press('Enter'); }
              await page.keyboard.press('Escape');
            }
            await expect.poll(async () => (await textChrome(page)).scrollY, { message: 'Contents jump never moved the reading position', timeout: 5_000 })
              .not.toBe(beforeJump.scrollY);
            // §5.1/§5.2 — the jump moved the reading position but must not have driven the chrome.
            const afterJump = await textChrome(page);
            expect(afterJump.headerOpacity).toBeGreaterThan(0.9);
      await expectQuietVisualOnly(page, beforeJump);
            // §9.5 — the mobile Contents sheet is dismissed by Escape. Asserting the dismissal is the
            // real post-condition; an unconditional click would instead wait out the full test timeout on
            // a locator that is legitimately gone.
            await expect(page.locator('.contents-panel')).toBeHidden();
          });

    test('a mode switch does not drive chrome state (§5.1/§10.2)', async ({ page }) => {
      test.setTimeout(90_000);
      await openPdfReader(page, 390, 900);
      await readerScrollBy(page, 600, 'wheel');
      await expectMobileChrome(page, 'quiet');
      // §6.7/§6.5 — while quiet the Header is off-screen, so the sanctioned escape to the mode
      // control is the reveal control. This is not tap-to-toggle: quiet was reached by real scroll
      // and the reveal control is a one-way reveal (§6.6).
      await page.getByRole('button', { name: 'Show reading controls' }).click();
      await expectMobileChrome(page, 'revealed');

      // §10.1/§10.2 — the mode control is a single PDF-only presentation control. Switching it
      // re-renders the whole surface and performs a programmatic scroll; per §5.1/§5.2 that must
      // not quiet or re-reveal the chrome.
      await togglePdfMode(page, 'Reading');
            await expectMobileChrome(page, 'revealed');
            await togglePdfMode(page, 'Original');
            await expectMobileChrome(page, 'revealed');

      // The accumulator is still purely user-driven after two programmatic navigations: real
      // accumulated scroll quiets it again exactly as it did before the mode switches (§6.3).
      await readerScrollBy(page, 600, 'wheel');
      await expectMobileChrome(page, 'quiet');
    });

    test('a zoom change does not drive chrome state (§5.1/§8.2)', async ({ page }) => {
      test.setTimeout(90_000);
      await openPdfReader(page, 390, 900);
      await readerScrollBy(page, 600, 'wheel');
      await expectMobileChrome(page, 'quiet');
      await page.getByRole('button', { name: 'Show reading controls' }).click();
      await expectMobileChrome(page, 'revealed');

      // §8.2 — zoom is a direct Footer control (decrease / level / increase), so it is focusable
      // and always operable, which is exactly why the reveal control above was required. Zoom
      // re-paginates and performs a programmatic scroll (§5.1/§5.2).
      const before = await readerGeometry(page);
      await page.getByRole('button', { name: 'Zoom in' }).click();
            await expectMobileChrome(page, 'revealed');
            // Zooming re-paginates, so the surface is rebuilt and the reading position re-anchored. Waiting
            // for that movement to become observable avoids asserting against the pre-re-pagination DOM.
            await expect.poll(async () => (await readerGeometry(page)).scrollTop, { message: 'zoom never re-paginated the surface', timeout: 10_000 })
              .not.toBe(before.scrollTop);

            await page.getByRole('button', { name: 'Zoom out' }).click();
      await expectMobileChrome(page, 'revealed');

      // §5.2 — neither programmatic re-navigation poisoned or pre-loaded the travel accumulator.
      await readerScrollBy(page, 600, 'wheel');
      await expectMobileChrome(page, 'quiet');
    });

    test('scrolling inside More does not drive Reader chrome state (§4.4/§9.8)', async ({ page }) => {
      test.setTimeout(90_000);
      await openTextReader(page, 320, 900);
      await page.mouse.move(160, 450);
      await page.mouse.wheel(0, 600);
      await expect.poll(async () => (await textChrome(page)).headerOpacity, { timeout: 5_000 }).toBeLessThan(0.1);

      // §4.4 — More is a blocking overlay, so it holds the chrome revealed while it is open.
      await openMore(page);
      await expect.poll(async () => (await textChrome(page)).headerOpacity, { timeout: 5_000 }).toBeGreaterThan(0.9);
      const before = await textChrome(page);
      const sheet = (await page.getByRole('menu', { name: 'Reader actions' }).boundingBox())!;
      await page.mouse.move(sheet.x + sheet.width / 2, sheet.y + sheet.height / 2);
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(250);
      // §5.2/§9.8 — scroll inside the disclosure is not reading-surface travel: it must not quiet
      // the Reader chrome it is overlaying.
      expect((await textChrome(page)).headerOpacity).toBeGreaterThan(0.9);
      await expectQuietVisualOnly(page, before);
      await closeMore(page);
      await expect(page.getByRole('menu', { name: 'Reader actions' })).toHaveCount(0);
    });
});

test.describe('MobileChrome — geometry invariants (A12 / U1)', () => {
  test('the first readable line is clear of the Header at the reconciliation reference state (U1/§13 G4-G5)', async ({ page }) => {
    test.setTimeout(120_000);
    for (const size of MATRIX) {
      await openTextReader(page, size.width, size.height);
      // §13.4.2 — A12-G5 is evaluated at the SETTLED scrollTop 0 reconciliation state, not
      // at a mid-document position and never by writing scrollTop.
      let guard = 0;
      while ((await textChrome(page)).scrollY > 1 && guard++ < 20) {
        await page.mouse.move(size.width / 2, size.height / 2);
        await page.mouse.wheel(0, -300);
        await page.waitForTimeout(60);
      }
      const atTop = await textChrome(page);
      expect(atTop.scrollY, `did not settle at scrollTop 0 at ${size.name}`).toBeLessThanOrEqual(1);
      // U1 — after reconciliation and settlement at scrollTop 0, the first readable
      // content must not be covered by the overlaid Header (§3.2: overlay, not push-down).
      expect(atTop.firstLineTop, `first readable line is covered by the header at ${size.name}`)
        .toBeGreaterThan(atTop.headerBottom - 0.5);
      expect(atTop.overflowX, `horizontal overflow at ${size.name}`).toBe(false);
    }
  });

  test('quiet and reveal never change content geometry, height or position (§4.2/A12 G1-G3)', async ({ page }) => {
    test.setTimeout(120_000);
    for (const size of [{ width: 320, height: 900 }, { width: 768, height: 900 }, { width: 1023, height: 900 }]) {
      await openTextReader(page, size.width, size.height);
      const before = await textChrome(page);
      await page.mouse.move(size.width / 2, size.height / 2);
      await page.mouse.wheel(0, 600);
      await expect.poll(async () => (await textChrome(page)).headerOpacity, { timeout: 5_000 }).toBeLessThan(0.1);
      await expectQuietVisualOnly(page, before);
      await page.mouse.wheel(0, -120);
      await expect.poll(async () => (await textChrome(page)).headerOpacity, { timeout: 5_000 }).toBeGreaterThan(0.9);
      await expectQuietVisualOnly(page, before);
    }
  });

  test('the Footer band is reserved in both chrome states (§3.4)', async ({ page }) => {
    test.setTimeout(90_000);
    await openTextReader(page, 390, 900);
    const revealed = await textChrome(page);
    await page.mouse.move(195, 450);
    await page.mouse.wheel(0, 600);
    await expect.poll(async () => (await textChrome(page)).headerOpacity, { timeout: 5_000 }).toBeLessThan(0.1);
    const quiet = await textChrome(page);
    // §3.4/§4.2 — the Footer is visible and reserved whether or not the Header is quiet.
    expect(quiet.footerTop).toBeCloseTo(revealed.footerTop, 0);
    expect(quiet.footerOpacity).toBeGreaterThan(0.9);
    expect(quiet.footerTop).toBeLessThanOrEqual(901);
  });
});
test.describe('MobileChrome — Footer and zoom ownership', () => {
  // §8.1/§9.4 and docs/desktop-reader.md §2: one More trigger per density band, in the band that
  // owns the surrounding chrome. App.tsx gates the Footer trigger on `!desktop`, so restoring it
  // must give mobile the Footer disclosure and desktop the Header one — never two, never none.
  test('exactly one Reader menu trigger per band: Footer at 390px, Header at 1280px', async ({ page }) => {
    test.setTimeout(90_000);
    await openPdfReader(page, 390, 900);
    // §8.1 — mobile Header owns Back/title/Original-Reading only; More lives in the Footer.
    await expect(page.locator('.reader-header').getByRole('button', { name: 'Reader menu' })).toHaveCount(0);
    await expect(page.locator('.reader-progress').getByRole('button', { name: 'Reader menu' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Reader menu' })).toHaveCount(1);
    await openMore(page);
    await expect(page.getByRole('menu', { name: 'Reader actions' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Document', exact: true })).toHaveCount(1);
    await closeMore(page);

    await page.setViewportSize({ width: 1280, height: 900 });
    // docs/desktop-reader.md §2 — desktop More is the Header toolbar disclosure; the Footer is status-only.
    await expect(page.locator('.reader-header').getByRole('button', { name: 'Reader menu' })).toHaveCount(1);
    await expect(page.locator('.reader-progress').getByRole('button', { name: 'Reader menu' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reader menu' })).toHaveCount(1);
    await page.locator('.reader-header').getByRole('button', { name: 'Reader menu' }).click();
    await expect(page.getByRole('menu', { name: 'Reader actions' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Document', exact: true })).toHaveCount(1);
  });

      // Contract §9.3 + mobile-chrome.md §6: the inventory is exactly eight items in a fixed order,
      // with the labels fixed by the 2026-10-05 rename (Document, Text, Languages, Click lookup).
      // `Document` is the single OCR entry (§9.7), so a separate `OCR` item must not appear.
      test('More exposes exactly the eight §9.3 items, in order, with the §6 labels', async ({ page }) => {
        test.setTimeout(90_000);
        const expected = ['Contents', 'Context', 'Notes', 'Markup', 'Text', 'Languages', 'Document', 'Click lookup'];

        for (const width of [390, 1280]) {
          await openPdfReader(page, width, 900);
          await openMore(page);
          const items = page.getByRole('menu', { name: 'Reader actions' }).getByRole('menuitem');
          // The accessible name of each item is its label, and the label is also the visible text,
          // so a plain ordered text assertion pins both the membership and the order.
          await expect(items).toHaveCount(8);
          await expect(items).toHaveText(expected);

          // OCR is reachable only through `Document` (§9.7), never as its own entry (§12.11).
          await expect(page.getByRole('menuitem', { name: /^OCR/ })).toHaveCount(0);
          await expect(page.getByRole('menuitem', { name: 'Zoom' })).toHaveCount(0);
          await closeMore(page);
        }
      });

      test('the More layer stays usable at every band it presents (§9.2/§9.5/§9.6)', async ({ page }) => {
    test.setTimeout(120_000);

    // Regression lock for the portal-scope defect: the menu is portaled to <body>, so every
    // rule that styled it used to be scoped `.reader-shell.reader-shell` (or sat in a
    // min-width:1024px query) and silently stopped matching. The symptom was not a thrown
    // error — it was a 190px-wide absolute menu rendered below the viewport, with the backdrop
    // above it. These two computed values are the contract the defect broke.
    const layerGeometry = async () => page.evaluate(() => {
      const menu = document.querySelector<HTMLElement>('.reader-more-menu');
      if (!menu) throw new Error('More menu is not in the DOM');
      const backdrop = document.querySelector<HTMLElement>('.reader-more-layer .more-backdrop');
      const rect = menu.getBoundingClientRect();
      const cs = getComputedStyle(menu);
      const atCentre = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      const base = {
        position: cs.position,
        menuZ: Number(cs.zIndex),
        backdropZ: backdrop ? Number(getComputedStyle(backdrop).zIndex) : null,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        withinViewport: rect.x >= 0 && rect.y >= 0
          && rect.right <= innerWidth && rect.bottom <= innerHeight,
        centreHitsMenu: !!atCentre?.closest('.reader-more-menu'),
      };
      // A missing icon would otherwise compare as null !== 20, which reports the same failure as a
      // wrong width for two different causes; throw so the cause is named.
      const icon = menu.querySelector<SVGElement>('.more-item-icon svg');
      if (!icon) throw new Error('More item icon is not rendered');
      return { ...base, iconWidth: icon.getBoundingClientRect().width };
    });

    for (const size of [{ width: 390, height: 900 }, { width: 768, height: 900 }]) {
      await openPdfReader(page, size.width, size.height);
      const trigger = page.getByRole('button', { name: 'Reader menu' });
      await trigger.click();
      const menu = page.getByRole('menu', { name: 'Reader actions' });
      await expect(menu).toBeVisible();

      const geometry = await layerGeometry();
      // Viewport-anchored sheet, not an absolutely positioned box tied to the Footer.
      expect(geometry.position).toBe('fixed');
      // The menu must outrank its own backdrop, or every tap on an item lands on the backdrop.
      expect(geometry.menuZ).toBeGreaterThan(geometry.backdropZ ?? -1);
      expect(geometry.withinViewport).toBe(true);
      expect(geometry.centreHitsMenu).toBe(true);
      // A 20px icon is not cosmetic here: unconstrained, the SVG absorbed the row's leftover
      // flex space (measured 156px) and squeezed every label in the inventory.
      expect(geometry.iconWidth).toBe(20);

      // §9.8 — an item is reachable and actually acts. `Click lookup` is used deliberately: it
            // flips its own pressed state, so activation is observable without opening a panel that
            // would legitimately take focus away from the trigger. Its starting value is not asserted —
            // the toggle persists across bands, so only the flip itself is a stable contract.
            const lookup = menu.getByRole('menuitem', { name: 'Click lookup' });
            const pressedBefore = await lookup.getAttribute('aria-pressed');
            await lookup.click();
            await expect(menu).toBeHidden();
            await trigger.click();
            await expect(menu).toBeVisible();
            await expect(menu.getByRole('menuitem', { name: 'Click lookup' }))
              .not.toHaveAttribute('aria-pressed', String(pressedBefore));

            // Escape closes and returns focus to the trigger it belongs to (§9.5).
            await page.keyboard.press('Escape');
            await expect(menu).toBeHidden();
            await expect(trigger).toBeFocused();

            // The backdrop is a real dismiss target on the sheet, and it must not swallow item taps.
            await trigger.click();
            await expect(menu).toBeVisible();
            await page.locator('.reader-more-layer .more-backdrop').click({ position: { x: 5, y: 5 } });
            await expect(menu).toBeHidden();
            await expect(page.locator('.reader-more-menu')).toHaveCount(0);
    }

    // §9.2 — at >=1024px the same component presents as a popover in the Header, with no backdrop.
    await openPdfReader(page, 1280, 900);
    await page.locator('.reader-header').getByRole('button', { name: 'Reader menu' }).click();
    const desktopMenu = page.getByRole('menu', { name: 'Reader actions' });
    await expect(desktopMenu).toBeVisible();
    const desktopGeometry = await layerGeometry();
    expect(desktopGeometry.position).toBe('fixed');
    expect(desktopGeometry.withinViewport).toBe(true);
    expect(desktopGeometry.centreHitsMenu).toBe(true);
    expect(desktopGeometry.iconWidth).toBe(20);
    expect(desktopGeometry.backdropZ).toBe(null);
        await desktopMenu.getByRole('menuitem', { name: 'Click lookup' }).click();
    await expect(desktopMenu).toBeHidden();
  });

      test('the mobile Footer owns a direct zoom stepper and never a zoom menu (§8.2/§8.3)', async ({ page }) => {
    test.setTimeout(90_000);
    await openPdfReader(page, 390, 900);
    const footer = page.locator('.reader-progress');
    // §8.2 — decrease, level readout, increase: three direct Footer controls. The readout is a
        // live-region label rather than a button, so it is addressed by its accessible name.
        await expect(footer.getByRole('button', { name: 'Zoom out' })).toBeVisible();
        await expect(footer.getByLabel('Zoom level')).toBeVisible();
        await expect(footer.getByRole('button', { name: 'Zoom in' })).toBeVisible();
    // §8.3 — the retired popup is gone and zoom is not reachable from More.
    await expect(page.getByRole('button', { name: 'PDF options' })).toHaveCount(0);
    await openMore(page);
    await expect(page.getByRole('menuitem', { name: /Zoom|PDF options/ })).toHaveCount(0);
    await closeMore(page);
  });

  test('every Footer control meets the 44px hit target (§7.5/§8.6)', async ({ page }) => {
    test.setTimeout(90_000);
    await openPdfReader(page, 320, 900);
    const small = await page.locator('.reader-progress').evaluate(footer =>
      Array.from(footer.querySelectorAll<HTMLElement>('button')).map(button => {
        const r = button.getBoundingClientRect();
        return { name: button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '', width: r.width, height: r.height };
      }));
    expect(small.length).toBeGreaterThan(0);
    for (const button of small) {
      expect(button.width, `Footer control "${button.name}" is only ${Math.round(button.width)}px wide`).toBeGreaterThanOrEqual(44);
      expect(button.height, `Footer control "${button.name}" is only ${Math.round(button.height)}px tall`).toBeGreaterThanOrEqual(44);
    }
  });

  test('OCR next lives only in the document-tools surface reached from More (§9.7/§12.11)', async ({ page }) => {
    test.setTimeout(90_000);
    await openPdfReader(page, 390, 900);
    // §7.2/§9.4 — not in the Header, not in the Footer, not a More entry of its own.
    await expect(page.locator('.reader-header').getByRole('button', { name: 'OCR next' })).toHaveCount(0);
    await expect(page.locator('.reader-progress').getByRole('button', { name: 'OCR next' })).toHaveCount(0);
    // §9.7 — document tools and OCR controls are ONE More action opening ONE surface.
    await openMore(page);
    await expect(page.getByRole('menuitem', { name: 'OCR next', exact: true })).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'Document', exact: true }).click();
    await expect(page.getByRole('dialog', { name: /Document tools|Công cụ/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'OCR next' })).toBeVisible();
  });

  test('progress and location are owned by the Footer at every mobile width (§8.1/§8.5)', async ({ page }) => {
    test.setTimeout(90_000);
    for (const width of [320, 390, 768, 1023]) {
      await openPdfReader(page, width, 900);
      const footer = page.locator('.reader-progress');
      await expect(footer).toBeVisible();
      await expect(footer.locator('.reader-progress-location')).toBeVisible();
      await expect(footer.locator('.reading-progress-track')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
});
