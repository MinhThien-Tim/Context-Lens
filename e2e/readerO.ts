/**
 * Minimal semantic helpers for the Overlay (O) reader-chrome contract.
 *
 * These are intentionally not a Page Object framework: each helper names one
 * product action or one product invariant, and nothing else. They are
 * selector-independent where the product exposes an accessible name, and they
 * never fake user input — `readerScrollBy` drives real browser input only.
 */
import { expect, type Page } from '@playwright/test';

export type ReaderGeometry = {
  viewportTop: number;
  viewportHeight: number;
  scrollTop: number;
  firstLineTop: number;
  scrollTopInset: number;
  footerTop: number;
  headerBottom: number;
  headerOpacity: number;
  page: string | null;
  percent: string | null;
  slotIds: string;
};

const SCROLL_SELECTOR = '.pdf-scroll, .pdf-reading-scroll';

/** Reads the product-relevant geometry of the PDF reading surface. */
export async function readerGeometry(page: Page): Promise<ReaderGeometry> {
  return page.evaluate(selector => {
    const box = (el: Element | null) => el?.getBoundingClientRect() ?? null;
    const viewport = document.querySelector('.reader-viewport');
    const scroll = document.querySelector<HTMLElement>(selector);
    if (!viewport || !scroll) throw new Error('reader surface not mounted');
    const viewportRect = box(viewport)!;
    const scrollRect = scroll.getBoundingClientRect();
    const header = document.querySelector('.reader-header');
    const footer = document.querySelector('.reader-progress');
    // Tag each rendered page slot so a re-navigation (geometryKey change) is
    // observable as lost identity rather than inferred from coordinates.
    let slotIds = '';
    const slots = document.querySelectorAll('.pdf-page-slot');
    for (let index = 0; index < slots.length; index++) {
      const el = slots[index] as HTMLElement;
      if (!el.dataset.probeId) el.dataset.probeId = `probe-${index}`;
      slotIds += `${el.dataset.probeId}:${el.getAttribute('data-pdf-page')};`;
    }
    const firstLine = document.querySelector('.pdf-text-layer span, .pdf-reading-text');
        const firstRect = box(firstLine);
        return {
          viewportTop: viewportRect.top,
      viewportHeight: viewportRect.height,
      scrollTop: scroll.scrollTop,
      firstLineTop: firstRect ? firstRect.top : NaN,
      scrollTopInset: firstRect ? firstRect.top - scrollRect.top : NaN,
      footerTop: box(footer)?.top ?? NaN,
      headerBottom: box(header)?.bottom ?? NaN,
      headerOpacity: header ? Number(getComputedStyle(header).opacity) : NaN,
      page: document.querySelector('[aria-label="Current PDF page"]')?.textContent ?? null,
      percent: document.querySelector('.reading-progress-track')?.getAttribute('aria-valuenow') ?? null,
      slotIds,
    };
  }, SCROLL_SELECTOR);
}

/**
 * Asserts the A12 invariant: the PDF viewport box and rendered page identity are
 * untouched by the operation that just ran. Compares product semantics (the box,
 * rendered page identity) rather than magic pixels.
 *
 * Deliberately excludes page label / percent / scrollTop: those are derived from
 * scroll position, and every chrome transition in this product is *caused by* a
 * scroll, so they legitimately move with the input. Use
 * `expectLocationTracksScroll` for those, and `expectLocationIdentical` when the
 * operation returns the document to a known position.
 */
export async function expectViewportStable(page: Page, before: ReaderGeometry, tolerance = 0.5) {
  const after = await readerGeometry(page);
  const near = (label: string, actual: number, expected: number) =>
    expect(Math.abs(actual - expected), `${label}: expected ${expected}, got ${actual}`).toBeLessThanOrEqual(tolerance);

  // A12 is the *viewport box* invariant: the reading box must not move or resize
    // when chrome hides/shows. The footer's absolute top is deliberately NOT
    // asserted — it is chrome visibility, not the reading box. On production HEAD
    // `.chrome-quiet` translates the footer off-screen at 768-1023px
    // (reader-layout.css @media max-width:1023px), so pinning `footer top`
    // measures that transform, not the invariant. Header/footer visibility belongs
    // to the behavior contract, not to A12.
    near('viewport top', after.viewportTop, before.viewportTop);
    near('viewport height', after.viewportHeight, before.viewportHeight);
  // A12 #9: rendered page identity is the strong "no re-navigation" signal. A
  // geometryKey change remounts the slots and the probe ids are lost.
  expect(after.slotIds, 'rendered page identity changed (unexpected navigation)').toBe(before.slotIds);
  return after;
}

/**
 * Asserts the location moved by exactly the requested input and no more: the
 * chrome transition itself contributed no scroll drift or location jump.
 */
export async function expectLocationTracksScroll(page: Page, before: ReaderGeometry, expectedDelta: number, tolerance = 2) {
  const after = await readerGeometry(page);
  const actualDelta = after.scrollTop - before.scrollTop;
  expect(
    Math.abs(actualDelta - expectedDelta),
    `scroll moved ${actualDelta}px but the input was ${expectedDelta}px`,
  ).toBeLessThanOrEqual(tolerance);
  return after;
}

/**
 * Asserts the location is byte-identical to a previously recorded reading. Valid
 * only when the document has been returned to the same scroll position.
 */
export async function expectLocationIdentical(page: Page, before: ReaderGeometry) {
  const after = await readerGeometry(page);
  expect(after.page, 'page label changed at the same scroll position').toBe(before.page);
  expect(after.percent, 'percent changed at the same scroll position').toBe(before.percent);
  expect(after.scrollTop, 'scroll position changed at the same position').toBe(before.scrollTop);
  return after;
}

/**
 * Asserts the static-padding invariant: with the container at scrollTop 0 the
 * first readable line sits below the header's own bottom edge, so the overlaying
 * header never covers content at rest. Only valid when scroll position is stable.
 */
export async function expectFirstLineClear(page: Page, before: ReaderGeometry, tolerance = 0.5) {
  const after = await readerGeometry(page);
  expect(after.firstLineTop, 'first line is not rendered').not.toBeNaN();
  expect(
    after.firstLineTop,
    `first readable line (top ${after.firstLineTop}) is covered by the header (bottom ${after.headerBottom})`,
  ).toBeGreaterThan(after.headerBottom - tolerance);
  const drift = Math.abs(after.scrollTopInset - before.scrollTopInset);
  expect(drift, `scroll container padding drifted by ${drift}px`).toBeLessThanOrEqual(tolerance);
  return after;
}

/**
 * Asserts the observable chrome state, without depending on class names.
 * Polls so callers never have to wait on the chrome transition themselves.
 */
export async function expectMobileChrome(page: Page, state: 'revealed' | 'quiet') {
  // The chrome opacity transition runs 120ms, so both states are range
  // assertions polled until the transition settles. `revealed` must exceed 0.9
  // (a fully opaque header reaches exactly 1, so an upper-bound match would
  // never be satisfiable); `quiet` must fall below 0.1.
  const message = `reader header never reached the ${state} state`;
    // A mode switch or zoom remounts the surface, so the surface is briefly absent. Reading it here
    // would throw inside `expect.poll` and abort the whole assertion instead of retrying, so an
    // unmounted surface reports NaN — a value no assertion can match, which retries as intended.
  const poll = expect
    .poll(async () => { try { return (await readerGeometry(page)).headerOpacity; } catch { return Number.NaN; } }, { message, timeout: 5_000 });
  if (state === 'quiet') await poll.toBeLessThan(0.1);
  else await poll.toBeGreaterThan(0.9);
}

/**
 * Waits until a reading surface is mounted and has settled, so a remounting surface is observed
 * after re-pagination rather than during it. Returns the settled geometry.
 */
export async function waitForReaderSurface(page: Page) {
  await expect
    .poll(async () => { try { const g = await readerGeometry(page); return Number.isFinite(g.viewportHeight) && g.viewportHeight > 0; } catch { return false; } },
    { message: 'reader surface never settled', timeout: 15_000 })
    .toBe(true);
  return readerGeometry(page);
}

/**
 * Real user scroll only.
 * `wheel` uses Playwright's mouse wheel over the reading surface;
 * `touch` uses a CDP touch swipe, because `page.touchscreen` has no swipe primitive.
 * Never mutates `scrollTop` and never dispatches a synthetic `scroll` event.
 */
export async function readerScrollBy(page: Page, deltaY: number, input: 'wheel' | 'touch' = 'wheel') {
  const box = await page.locator(SCROLL_SELECTOR).first().boundingBox();
  if (!box) throw new Error('reading surface has no box');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  if (input === 'wheel') {
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, deltaY);
    await page.waitForTimeout(80);
    return;
  }

  const cdp = await page.context().newCDPSession(page);
  // Finger travels opposite to content: finger up scrolls down.
  const startY = deltaY > 0 ? box.y + box.height * 0.75 : box.y + box.height * 0.25;
  const steps = 12;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: startY }] });
  for (let step = 1; step <= steps; step++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: startY - (deltaY * step) / steps }],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(120);
}

/** Reads the real scroll offset, for measurement only. Never writes it. */
export async function readerScrollOffset(page: Page) {
  return page.evaluate(selector => document.querySelector<HTMLElement>(selector)?.scrollTop ?? 0, SCROLL_SELECTOR);
}

export async function togglePdfMode(page: Page, mode: 'Original' | 'Reading') {
  // The Footer control can be scrolled out of reach on a short surface; scrolling it into view with
  // real input is a prerequisite for activating it, not a chrome assertion.
  const button = page.locator('.pdf-mode-switch').getByRole('button', { name: mode === 'Original' ? /Original|Trang gốc/ : /Reading/ });
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await waitForReaderSurface(page);
}

export async function openMore(page: Page) {
  await page.getByRole('button', { name: 'Reader menu' }).click();
  await expect(page.getByRole('menu', { name: 'Reader actions' })).toBeVisible();
}

export async function closeMore(page: Page) {
  // §9.5 — at <=1023px the sheet is a bottom sheet with a backdrop, so Escape closes it
  // (the trigger is covered by the sheet on that band and is not a reliable close target).
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Reader actions' })).toBeHidden();
}

/**
 * Returns the reading surface to the true top with real wheel input only.
 * The shell settles at a non-zero opening offset, and `scrollTop` mutation is
 * banned, so this walks the content back up in bounded steps.
 */
export async function scrollToTop(page: Page, maxSteps = 12, step = 160) {
    for (let i = 0; i < maxSteps; i++) {
      if ((await readerScrollOffset(page)) <= 0) break;
      await readerScrollBy(page, -step, 'wheel');
    }
    await page.waitForTimeout(80);
}

/** Opens Lookup through the real single-word tap path the product uses on touch. */
export async function openLookup(page: Page) {
    // The PDF text layer emits one span per positioned run, so the fixture
    // sentence is not guaranteed to be a single node.
    //
    // Scope to the ACTIVE page: the tap handler in PdfPage only resolves a word
    // once that page's text index is built, and a neighbouring page can be
    // rendered while its index is still missing. The probe word repeats on every
    // page, so an unscoped match can land on such a page.
    const span = page
      .locator('.pdf-page-slot[data-pdf-page="1"] .pdf-text-layer span')
      .filter({ hasText: 'decision' })
      .first();
    await expect(span, 'no rendered text layer span contains the probe word').toBeVisible();
    const point = await span.evaluate(el => {
      const node = el.firstChild!;
      const value = node.textContent ?? '';
      const from = value.indexOf('decision');
      const range = document.createRange();
      range.setStart(node, from);
      range.setEnd(node, from + 'decision'.length);
      const rect = range.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.lookup-sheet')).toBeVisible();
}

export async function closeLookup(page: Page) {
  await page.locator('.lookup-sheet').getByRole('button', { name: 'Close meaning' }).click();
  await expect(page.locator('.lookup-sheet')).toBeHidden();
}