import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { useRef } from 'preact/hooks';
import { PdfTextIndex } from './PdfTextIndex';
import { pdfSelectionFromDom } from './selectionAdapter';
import { canvasBackingSize, MAX_CANVAS_PIXELS, NEIGHBOR_CANVAS_PIXELS } from './renderBudget';
import { createLocationPersistence } from './locationPersistence';
import { dominantPageAtPosition, pageAtPosition, usePdfScroll } from './usePdfScroll';
import type { PdfDocumentLocation } from '../../documents/location';

afterEach(() => { document.body.replaceChildren(); window.getSelection()?.removeAllRanges(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('keeps the final PDF page active when the viewport cannot align it to the top', () => {
  const root = document.createElement('div');
  Object.defineProperty(root, 'clientHeight', { value: 600 });
  root.getBoundingClientRect = () => ({ top: 0, bottom: 600, height: 600 }) as DOMRect;
  const first = document.createElement('div');
  first.getBoundingClientRect = () => ({ top: -400, bottom: 200, height: 600 }) as DOMRect;
  const second = document.createElement('div');
  second.getBoundingClientRect = () => ({ top: 200, bottom: 800, height: 600 }) as DOMRect;
  expect(pageAtPosition([first, second], root, 2)).toBe(2);
});

it('prioritizes the page with greatest viewport overlap while hysteresis retains the previous page', () => {
  const root = document.createElement('div');
  Object.defineProperty(root, 'clientHeight', { value: 765 });
  root.getBoundingClientRect = () => ({ top: 0, bottom: 765, height: 765 }) as DOMRect;
  const first = document.createElement('div');
  first.getBoundingClientRect = () => ({ top: -1290, bottom: 361, height: 1651 }) as DOMRect;
  const second = document.createElement('div');
  second.getBoundingClientRect = () => ({ top: 379, bottom: 2030, height: 1651 }) as DOMRect;
  expect(pageAtPosition([first, second], root, 1)).toBe(1);
  expect(dominantPageAtPosition([first, second], root)).toBe(2);
});

function select(parts: string[], text: string, start: [number, number], end: [number, number], reverse = false) {
  const root = document.createElement('div');
  for (const part of parts) { const span = document.createElement('span'); span.textContent = part; root.append(span); }
  document.body.append(root);
  const range = document.createRange();
  range.setStart(root.children[start[0]].firstChild!, start[1]); range.setEnd(root.children[end[0]].firstChild!, end[1]);
  const selection = window.getSelection()!;
  selection.removeAllRanges(); selection.addRange(range);
  if (reverse) selection.setBaseAndExtent(range.endContainer, range.endOffset, range.startContainer, range.startOffset);
  return { root, range, result: pdfSelectionFromDom(root, text, 0, new PdfTextIndex(root, text, 0)) };
}

describe('canonical PDF selection', () => {
  it('maps desktop and reversed cross-span selection including canonical whitespace', () => {
    for (const reverse of [false, true]) {
      const { result } = select(['Hello ', 'world.', ' Next line.'], 'Hello world.\n\nNext line.', [0, 0], [2, 5], reverse);
      expect(result).toMatchObject({ offset: 0, endOffset: 18, text: 'Hello world. Next' });
    }
  });
  it('maps ligatures, soft hyphens and line-end hyphenation to canonical end offsets', () => {
    const { result } = select(['The ofﬁce inter-', 'national soft\u00adhyphen.'], 'The office international softhyphen.', [0, 4], [1, 8]);
    expect(result).toMatchObject({ offset: 4, endOffset: 24, text: 'office international' });
  });
  it('disambiguates repeated text using left context', () => {
    const { result } = select(['one word. ', 'another word.'], 'one word.\n\nanother word.', [1, 8], [1, 12]);
    expect(result).toMatchObject({ offset: 19, endOffset: 23, text: 'word' });
  });
  it('does not invent canonical offsets when rendered and canonical text do not align', () => {
    const { result } = select(['unrecognized'], 'recognized text', [0, 0], [0, 12]);
    expect(result).toBeNull();
  });
  it('rejects collapsed and unrelated selections', () => {
    const { root } = select(['word'], 'word', [0, 0], [0, 0]);
    expect(pdfSelectionFromDom(root, 'word', 0)).toBeNull();
    expect(pdfSelectionFromDom(document.createElement('div'), 'word', 0)).toBeNull();
  });
  it('restores a partial ligature highlight using DOM boundaries', () => {
    const { root } = select(['The ofﬁce'], 'The office', [0, 0], [0, 9]);
    const index = new PdfTextIndex(root, 'The office', 0);
    expect(index.ranges(6, 8).map(range => range.toString()).join('')).toBe('ﬁ');
  });
});

describe('resource budgets', () => {
  it('renders an ordinary desktop page at device resolution without changing mobile fit width', () => {
    expect(canvasBackingSize(900, 1165, 2)).toMatchObject({ ratio: 2, width: 1800, height: 2330 });
    expect(canvasBackingSize(390, 505, 3)).toMatchObject({ ratio: 3, width: 1170, height: 1515 });
    expect(canvasBackingSize(1800, 2330, 2).ratio).toBeGreaterThan(1);
    expect(canvasBackingSize(1836, 2376, 2)).toMatchObject({ ratio: 2, width: 3672, height: 4752 });
    expect(MAX_CANVAS_PIXELS + 2 * NEIGHBOR_CANVAS_PIXELS).toBe(24_000_000);
  });
  it('caps pixel count and longest edge even at high zoom/DPR', () => {
    for (const [width, height, dpr] of [[612, 792, 3], [6000, 10000, 4], [100, 30000, 2]]) {
      const canvas = canvasBackingSize(width, height, dpr);
      expect(canvas.width * canvas.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
      expect(Math.max(canvas.width, canvas.height)).toBeLessThanOrEqual(8192);
    }
  });
  it('debounces, deduplicates and flushes the latest location exactly once', () => {
    vi.useFakeTimers(); const write = vi.fn(); const store = createLocationPersistence(write);
    const location: PdfDocumentLocation = { kind: 'pdf', page: 1, scrollY: 0, progress: 0, updatedAt: 1 };
    store.update(location); store.update({ ...location, updatedAt: 2 });
    vi.advanceTimersByTime(349); expect(write).not.toHaveBeenCalled();
    store.update({ ...location, page: 2 }); store.flush(); store.flush();
    expect(write).toHaveBeenCalledTimes(1); expect(write.mock.calls[0][0].page).toBe(2);
    vi.advanceTimersByTime(500); expect(write).toHaveBeenCalledTimes(1);
  });
});

it('passive page updates never navigate; each explicit token navigates once', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const onVisible = vi.fn();
  let writes = 0, top = 0;
  vi.spyOn(HTMLElement.prototype, 'scrollTop', 'set').mockImplementation(value => { writes++; top = value; });
  vi.spyOn(HTMLElement.prototype, 'scrollTop', 'get').mockImplementation(() => top);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
    const page = Number(this.dataset.page ?? 0);
    return { top: page ? (page - 1) * 800 - top : 0, bottom: page * 800 - top, height: 800, width: 600, left: 0, right: 600, x: 0, y: 0, toJSON() {} };
  });
  let frame: FrameRequestCallback | undefined;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  function Harness({ page, token }: { page: number; token: number }) {
    const root = useRef<HTMLDivElement>(null);
    usePdfScroll(root, '[data-page]', true, { kind: 'pdf', page, scrollY: 0, progress: 0, updatedAt: 0 }, token, onVisible);
    return <div ref={root}>{[1, 2, 3].map(n => <div data-page={n} />)}</div>;
  }
  await act(() => render(<Harness page={1} token={0} />, host)); expect(writes).toBe(1);
  top = 900; host.firstElementChild!.dispatchEvent(new Event('scroll')); await act(() => frame?.(0));
  expect(onVisible.mock.calls.at(-1)?.[0]).toBe(2);
  await act(() => render(<Harness page={2} token={0} />, host)); expect(writes).toBe(1);
  await act(() => render(<Harness page={3} token={1} />, host)); expect(writes).toBe(2);
  await act(() => render(<Harness page={3} token={1} />, host)); expect(writes).toBe(2);
  await act(() => render(null, host)); vi.unstubAllGlobals();
});

it('round-trips the top page fraction while visibility has advanced to the next page', async () => {
  const host = document.createElement('div'); document.body.append(host);
  let top = 0, writes = 0;
  vi.spyOn(HTMLElement.prototype, 'scrollTop', 'get').mockImplementation(() => top);
  vi.spyOn(HTMLElement.prototype, 'scrollTop', 'set').mockImplementation(value => { top = value; writes++; });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
    const page = Number(this.dataset.page ?? 0);
    const y = page ? 48 + (page - 1) * 468 - top : 0;
    return { top: y, bottom: y + (page ? 450 : 839), height: page ? 450 : 839 } as DOMRect;
  });
  let frame: FrameRequestCallback | undefined;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const onVisible = vi.fn();
  function Harness({ page, fraction = 0 }: { page: number; fraction?: number }) {
    const root = useRef<HTMLDivElement>(null);
    usePdfScroll(root, '[data-page]', true, { kind: 'pdf', page, pageOffset: fraction, scrollY: 0, progress: 0, updatedAt: 0 }, 0, onVisible);
    return <div ref={root}>{[1, 2, 3].map(n => <div data-page={n} ref={el => { if (el) Object.defineProperty(el, 'offsetHeight', { value: 450 }); }} />)}</div>;
  }
  await act(() => render(<Harness page={1} />, host));
  Object.defineProperty(host.firstElementChild!, 'clientHeight', { value: 839 });
  top = 350; host.firstElementChild!.dispatchEvent(new Event('scroll'));
  await act(() => frame?.(0));
  const [page, fraction, savedTop, visiblePage] = onVisible.mock.calls.at(-1)!;
  expect({ page, savedTop, visiblePage }).toEqual({ page: 1, savedTop: 350, visiblePage: 2 });
  expect(fraction).toBeCloseTo(302 / 450);
  expect(writes).toBe(1);
  await act(() => render(null, host));
  await act(() => render(<Harness page={page} fraction={fraction} />, host));
  // The same slot geometry restores the exact position on return to Original.
  expect(top).toBeCloseTo(350);
  await act(() => render(null, host)); vi.unstubAllGlobals();
});
