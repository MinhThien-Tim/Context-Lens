import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfPage } from './PdfPage';
import { acquirePage } from './pageLease';
import { canvasBackingSize, MAX_CANVAS_PIXELS } from './renderBudget';

const state = vi.hoisted(() => ({ layers: [] as { container: HTMLElement; finish: () => void; cancel: ReturnType<typeof vi.fn> }[] }));
vi.mock('pdfjs-dist', () => ({
  TextLayer: class {
    constructor(private args: { container: HTMLElement }) {}
    cancel = vi.fn();
    render() { return new Promise<void>(resolve => {
      const layer = { container: this.args.container, cancel: this.cancel, finish: () => { const span = document.createElement('span'); span.textContent = 'The decision.'; this.args.container.replaceChildren(span); resolve(); } };
      state.layers.push(layer);
    }); }
  },
}));
afterEach(() => { state.layers = []; document.body.replaceChildren(); vi.useRealTimers(); vi.restoreAllMocks(); Reflect.deleteProperty(document, 'elementFromPoint'); Reflect.deleteProperty(Range.prototype, 'getClientRects'); });

async function mount() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
  const proxy = { getViewport: () => ({ width: 612, height: 792 }), getTextContent: async () => ({ items: [] }), getAnnotations: async () => [], render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }), cleanup: vi.fn() };
  const pdf = { getPage: async () => proxy } as unknown as PDFDocumentProxy;
  const host = document.createElement('div'); host.className = 'pdf-scroll'; document.body.append(host);
  const onLookup = vi.fn(), onAddNote = vi.fn(), onHighlight = vi.fn();
  const props = { pdf, pageNumber: 1, scale: 1, active: true, documentText: 'The decision.', pageOffset: 0, onSize: vi.fn(), onNavigate: vi.fn(), onLookup, onAddNote, onHighlight };
  await act(async () => { render(<PdfPage {...props} />, host); });
  await act(async () => {});
  await act(async () => { await vi.dynamicImportSettled(); });
  return { host, props, proxy, onLookup, onAddNote, onHighlight };
}

it('waits for the text-layer generation and captures selection without clearing Range', async () => {
  const { host, props, onLookup, onAddNote, onHighlight } = await mount();
  await act(async () => state.layers[0].finish());
  const text = host.querySelector('.pdf-text-layer span')!.firstChild!;
  const range = document.createRange(); range.setStart(text, 4); range.setEnd(text, 12);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  vi.useFakeTimers();
  document.dispatchEvent(new Event('selectionchange'));
  await act(() => { vi.advanceTimersByTime(125); });
  const buttons = () => Array.from(document.querySelectorAll<HTMLButtonElement>('.pdf-original-actions button'));
  expect(window.getSelection()?.toString()).toBe('decision');
  expect(buttons().map(b => b.textContent)).toContain('Define');
  await act(() => buttons().find(b => b.textContent === 'Define')!.click());
  expect(onLookup).toHaveBeenCalledWith(expect.objectContaining({ text: 'decision', offset: 4, endOffset: 12, context: expect.objectContaining({ current: 'The decision.' }) }));
  await act(() => buttons().find(b => b.textContent === 'Note')!.click());
  expect(onAddNote).toHaveBeenCalledWith(expect.objectContaining({ offset: 4, endOffset: 12 }));
  await act(() => buttons().find(b => b.textContent === 'Highlight')!.click());
  expect(onHighlight).toHaveBeenCalledWith(expect.objectContaining({ startOffset: 4, endOffset: 12 }));
  await act(() => render(<PdfPage {...props} scale={2} />, host));
  await act(async () => { await vi.dynamicImportSettled(); });
  await act(() => render(null, host));
});

it('scroll does not discard a valid canonical selection', async () => {
  const { host } = await mount(); await act(async () => state.layers[0].finish());
  const range = document.createRange(); range.selectNodeContents(host.querySelector('.pdf-text-layer')!);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  vi.useFakeTimers(); document.dispatchEvent(new Event('selectionchange'));
  host.dispatchEvent(new Event('scroll')); await act(() => { vi.advanceTimersByTime(200); });
  expect(document.querySelector('.pdf-original-actions')).not.toBeNull();
  await act(() => render(null, host));
});

it('opens one lookup for a desktop word double-click while leaving phrase selection pending', async () => {
  const { host, props, onLookup } = await mount();
  await act(async () => state.layers[0].finish());
  await act(() => render(<PdfPage {...props} desktopLookup />, host));
  const span = host.querySelector<HTMLElement>('.pdf-text-layer span')!;
  const text = span.firstChild!;
  vi.useFakeTimers();
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => span });
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: function (this: Range) { return [{ left: this.startOffset * 10, right: (this.startOffset + 1) * 10, top: 0, bottom: 30 }]; } });
  const range = document.createRange(); range.setStart(text, 4); range.setEnd(text, 12);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  await act(() => { span.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, button: 0, clientX: 55, clientY: 10 })); });
  await act(() => { vi.advanceTimersToNextFrame(); });
  expect(onLookup).toHaveBeenCalledOnce();
  expect(onLookup).toHaveBeenCalledWith(expect.objectContaining({ text: 'decision', offset: 4, endOffset: 12 }));
  expect(document.querySelector('.pdf-original-actions')).toBeNull();
  range.setStart(text, 0); range.setEnd(text, 12);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  await act(() => { vi.advanceTimersToNextFrame(); });
  expect(document.querySelector('.pdf-original-actions')).not.toBeNull();
  expect(onLookup).toHaveBeenCalledOnce();
  await act(() => render(null, host));
});

it('applies the active Original PDF markup tool on selection completion', async () => {
  const { host, props, onHighlight, onLookup } = await mount();
  await act(async () => state.layers[0].finish());
  const onErase = vi.fn();
  const span = host.querySelector<HTMLElement>('.pdf-text-layer span')!;
  const text = span.firstChild!;
  const select = (start: number, end: number) => {
    const range = document.createRange(); range.setStart(text, start); range.setEnd(text, end);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  };
  const release = async () => {
    const event = new Event('pointerup', { bubbles: true }) as PointerEvent;
    Object.assign(event, { pointerType: 'mouse' });
    await act(() => { span.dispatchEvent(event); });
    await act(async () => new Promise(resolve => setTimeout(resolve, 30)));
  };
  await act(() => render(<PdfPage {...props} activeMarkupTool="underline" activeMarkupColor="blue" onErase={onErase} desktopLookup />, host));
  select(0, 12); await release();
  expect(onHighlight).toHaveBeenCalledOnce();
  expect(onHighlight).toHaveBeenCalledWith(expect.objectContaining({ startOffset: 0, endOffset: 12, style: 'underline', color: 'blue' }));
  expect(document.querySelector('.pdf-original-actions')).toBeNull();
  await act(() => render(<PdfPage {...props} activeMarkupTool="eraser" onErase={onErase} desktopLookup />, host));
  select(4, 12); await release();
  expect(onErase).toHaveBeenCalledWith(4, 12);
  expect(onLookup).not.toHaveBeenCalled();
  expect(document.querySelector('.pdf-original-actions')).toBeNull();
  await act(() => render(null, host));
});

it('maps the touch long-press fallback through the canonical index', async () => {
  const { host, onLookup } = await mount(); await act(async () => state.layers[0].finish());
  const text = host.querySelector('.pdf-text-layer span')!.firstChild!;
  const caret = document.createRange(); caret.setStart(text, 6); caret.collapse(true);
  Object.defineProperty(document, 'caretRangeFromPoint', { configurable: true, value: vi.fn(() => caret) });
  vi.useFakeTimers();
  const down = new Event('pointerdown', { bubbles: true }) as PointerEvent;
  Object.assign(down, { pointerType: 'touch', clientX: 10, clientY: 10 });
  host.querySelector('.pdf-text-host')!.dispatchEvent(down);
  await act(() => { vi.advanceTimersByTime(651); });
  const up = new Event('pointerup', { bubbles: true }) as PointerEvent;
  Object.assign(up, { pointerType: 'touch', clientX: 10, clientY: 10 });
  host.querySelector('.pdf-text-host')!.dispatchEvent(up);
  await act(() => { vi.advanceTimersByTime(100); });
  const explain = document.querySelector<HTMLButtonElement>('.pdf-original-actions .selection-lookup');
  expect(explain).not.toBeNull();
  await act(() => explain!.click());
  expect(onLookup).toHaveBeenCalledWith(expect.objectContaining({ text: 'decision', offset: 4, endOffset: 12 }));
  await act(() => render(null, host));
});

it('a late old render cannot publish annotations or a selectable index', async () => {
  const { host, props, proxy } = await mount();
  const annotations = vi.spyOn(proxy, 'getAnnotations');
  const old = state.layers[0];
  await act(() => render(<PdfPage {...props} scale={2} />, host));
  await act(async () => { await vi.dynamicImportSettled(); });
  expect(old.cancel).toHaveBeenCalledOnce();
  await act(async () => old.finish());
  expect(old.container.isConnected).toBe(false);
  expect(host.querySelector('.pdf-text-layer')?.textContent).toBe('');
  expect(annotations).not.toHaveBeenCalled();
  await act(async () => state.layers[1].finish());
  expect(annotations).toHaveBeenCalledOnce();
  await act(() => render(null, host));
});

it('does not clean a warm page until both render leases settle', async () => {
  const page = { cleanup: vi.fn() } as any;
  let settle!: () => void;
  const first = acquirePage(page); first(new Promise<void>(resolve => { settle = resolve; }));
  const second = acquirePage(page);
  settle(); await Promise.resolve(); await Promise.resolve();
  expect(page.cleanup).not.toHaveBeenCalled();
  second(); await Promise.resolve(); await Promise.resolve();
  expect(page.cleanup).toHaveBeenCalledOnce();
});

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

type CanvasContextStub = { drawImage: ReturnType<typeof vi.fn> };

/**
 * Mounts a PdfPage with observable canvas sizing, per-canvas 2D contexts and a render
 * task the test resolves by hand, so render-lifecycle transitions can be observed.
 */
async function mountLifecycle(initial: { scale?: number; renderPixels?: number; highlights?: any[] } = {}) {
  const contexts = new WeakMap<HTMLCanvasElement, CanvasContextStub>();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    let entry = contexts.get(this);
    if (!entry) { entry = { drawImage: vi.fn() }; contexts.set(this, entry); }
    return entry as unknown as CanvasRenderingContext2D;
  });
  const widthSet = vi.spyOn(HTMLCanvasElement.prototype, 'width', 'set');
  const heightSet = vi.spyOn(HTMLCanvasElement.prototype, 'height', 'set');
  const sizesFor = (spy: typeof widthSet, canvas: HTMLCanvasElement) =>
    spy.mock.calls.map((call: unknown[], i: number) => ({ value: call[0] as number, owner: spy.mock.instances[i] }))
      .filter(entry => entry.owner === canvas).map(entry => entry.value);

  const renders: { canvas: HTMLCanvasElement; done: ReturnType<typeof deferred> }[] = [];
  const proxy = {
    getViewport: ({ scale }: { scale: number }) => ({ width: 612 * scale, height: 792 * scale, transform: [scale, 0, 0, scale, 0, 0] }),
    getTextContent: async () => ({ items: [] }),
    getAnnotations: async () => [],
    render: vi.fn(({ canvas }: { canvas: HTMLCanvasElement }) => {
      const done = deferred();
      renders.push({ canvas, done });
      return { promise: done.promise, cancel: vi.fn() };
    }),
    cleanup: vi.fn(),
  };
  const pdf = { getPage: async () => proxy } as unknown as PDFDocumentProxy;
  const host = document.createElement('div'); host.className = 'pdf-scroll'; document.body.append(host);
  const props: Record<string, unknown> = {
    pdf, pageNumber: 1, scale: initial.scale ?? 1, active: true, renderPixels: initial.renderPixels,
    documentText: 'The decision.', pageOffset: 0, onSize: vi.fn(), onNavigate: vi.fn(), onLookup: vi.fn(),
    onAddNote: vi.fn(), onHighlight: vi.fn(), ...(initial.highlights ? { highlights: initial.highlights } : {}),
  };
  // Resolves through the component's internal awaits; the commit and the lease
  // release both continue on microtasks that the dynamic-import flush alone misses.
  const flush = async () => { await act(async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); }); };
  const update = async (next: Record<string, unknown>) => {
    await act(() => { render(<PdfPage {...props as any} {...next} />, host); });
    await act(async () => { await vi.dynamicImportSettled(); });
    await flush();
  };
  await act(async () => { render(<PdfPage {...props as any} />, host); });
  await act(async () => { await vi.dynamicImportSettled(); });
  await flush();
  const canvas = host.querySelector<HTMLCanvasElement>('.pdf-canvas')!;
  const completeGeneration = async (index: number) => {
    await act(async () => { state.layers[index]?.finish(); });
    await act(async () => { renders[index]?.done.resolve(); });
    await act(async () => { await vi.dynamicImportSettled(); });
    await flush();
  };
  return {
    host, props, proxy, canvas, renders, update, completeGeneration, flush,
    contextFor: (target: HTMLCanvasElement) => contexts.get(target),
    widths: (target: HTMLCanvasElement) => sizesFor(widthSet, target),
    heights: (target: HTMLCanvasElement) => sizesFor(heightSet, target),
  };
}

const backing = (scale: number, budget: number) => canvasBackingSize(612 * scale, 792 * scale, window.devicePixelRatio || 1, budget);

it('retains a mounted page, its lease and its committed frame across a budget-only transition', async () => {
  const first = backing(1, MAX_CANVAS_PIXELS);
  const { host, proxy, canvas, renders, update, widths, heights } = await mountLifecycle({ renderPixels: MAX_CANVAS_PIXELS });
  await update({ renderPixels: 1e9 });
  await update({ renderPixels: MAX_CANVAS_PIXELS });
  const widthAfterMount = widths(canvas), heightAfterMount = heights(canvas);
  // A far larger budget resolves to the same backing geometry, so nothing may be torn down.
  expect(backing(1, 1e9)).toEqual(first);
  await act(async () => {}); await act(async () => state.layers[0].finish()); await act(async () => { renders[0]?.done.resolve(); });
  await act(async () => { await vi.dynamicImportSettled(); });
  expect(renders).toHaveLength(1);
  expect(proxy.render).toHaveBeenCalledOnce();
  expect(widths(canvas)).toEqual(widthAfterMount);
  expect(heights(canvas)).toEqual(heightAfterMount);
  expect(widthAfterMount).toEqual([first.width]);
  expect(widthAfterMount).not.toContain(1);
  expect(renders[0].canvas).toBe(canvas);
  expect(host.querySelector('.pdf-text-layer span')?.textContent).toBe('The decision.');
  expect(proxy.cleanup).not.toHaveBeenCalled();
  await act(() => render(null, host));
});

it('releases the page canvas to 1x1 only when the page actually unmounts', async () => {
  const { host, proxy, canvas, renders, completeGeneration, widths, heights } = await mountLifecycle({ renderPixels: MAX_CANVAS_PIXELS });
  await completeGeneration(0);
  expect(widths(canvas)).not.toContain(1);
  expect(heights(canvas)).not.toContain(1);
  await act(() => render(null, host));
  await act(async () => { await vi.dynamicImportSettled(); });
  expect(widths(canvas).at(-1)).toBe(1);
  expect(heights(canvas).at(-1)).toBe(1);
  expect(proxy.cleanup).toHaveBeenCalledOnce();
});

it('keeps the committed frame intact until a scale replacement renders, then commits once', async () => {
  const wide = backing(1, MAX_CANVAS_PIXELS), tall = backing(2, MAX_CANVAS_PIXELS);
  expect(tall.width).not.toBe(wide.width);
  const { host, canvas, renders, update, completeGeneration, contextFor, widths, heights } = await mountLifecycle({ renderPixels: MAX_CANVAS_PIXELS });
  await completeGeneration(0);
  const mounted = contextFor(canvas)!;
  mounted.drawImage.mockClear();
  expect(widths(canvas)).toEqual([wide.width]);

  await update({ scale: 2 });
  // The replacement renders offscreen; the committed frame is neither resized nor cleared.
  expect(renders).toHaveLength(2);
  expect(renders[1].canvas).not.toBe(canvas);
  expect(widths(canvas)).toEqual([wide.width]);
  expect(heights(canvas)).toEqual([wide.height]);
  expect(mounted.drawImage).not.toHaveBeenCalled();
  expect(contextFor(renders[1].canvas)).toBeDefined();

  await completeGeneration(1);
  expect(mounted.drawImage).toHaveBeenCalledOnce();
  expect(mounted.drawImage.mock.calls[0][0]).toBe(renders[1].canvas);
  expect(widths(canvas).at(-1)).toBe(tall.width);
  expect(heights(canvas).at(-1)).toBe(tall.height);
  expect(canvas.width).toBe(tall.width);
  expect(canvas.height).toBe(tall.height);
  // The transient buffer is released rather than retained.
  expect(widths(renders[1].canvas).at(-1)).toBe(1);
  expect(host.querySelector('.pdf-text-layer span')?.textContent).toBe('The decision.');
  await act(() => render(null, host));
});

it('a superseded scale replacement leaves the committed frame and its generation alone', async () => {
  const { host, proxy, canvas, renders, update, completeGeneration, contextFor, widths } = await mountLifecycle({ renderPixels: MAX_CANVAS_PIXELS });
  await completeGeneration(0);
  const mounted = contextFor(canvas)!; mounted.drawImage.mockClear();
  await update({ scale: 2 });
  // Generation 2 is started and then immediately superseded by generation 3.
  const staleLayer = state.layers[1];
  await update({ scale: 3 });
  const annotations = vi.spyOn(proxy, 'getAnnotations');
  expect(renders).toHaveLength(3);
  expect(staleLayer.cancel).toHaveBeenCalledOnce();
  await act(async () => staleLayer.finish());
  expect(staleLayer.container.isConnected).toBe(false);
  expect(widths(canvas).at(-1)).toBe(backing(1, MAX_CANVAS_PIXELS).width);
  expect(annotations).not.toHaveBeenCalled();
  await completeGeneration(2);
  expect(widths(canvas).at(-1)).toBe(backing(3, MAX_CANVAS_PIXELS).width);
  expect(proxy.render).toHaveBeenCalledTimes(3);
  await act(() => render(null, host));
});

it('keeps saved highlights visible across a budget-only transition', async () => {
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [{ left: 0, top: 0, width: 40, height: 12 }] });
  const highlight = { id: 'h1', startOffset: 0, endOffset: 12, color: 'yellow', style: 'highlight', createdAt: 1 };
  const { host, canvas, renders, update, completeGeneration, widths } = await mountLifecycle({ renderPixels: MAX_CANVAS_PIXELS, highlights: [highlight] });
  await completeGeneration(0);
  const marks = () => document.querySelectorAll('.pdf-saved-highlight').length;
  expect(marks()).toBeGreaterThan(0);
  // Same geometry under a different budget: the overlay is never blanked.
  await update({ renderPixels: 1e9 });
  expect(marks()).toBeGreaterThan(0);
  expect(renders).toHaveLength(1);
  expect(widths(canvas)).not.toContain(1);
  await act(() => render(null, host));
});

it('rebuilds the overlay from the new generation on a genuine geometry change', async () => {
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [{ left: 0, top: 0, width: 40, height: 12 }] });
  const highlight = { id: 'h1', startOffset: 0, endOffset: 12, color: 'yellow', style: 'highlight', createdAt: 1 };
  const { host, update, completeGeneration } = await mountLifecycle({ renderPixels: MAX_CANVAS_PIXELS, highlights: [highlight] });
  await completeGeneration(0);
  const marks = () => document.querySelectorAll('.pdf-saved-highlight').length;
  const before = marks();
  expect(before).toBeGreaterThan(0);
  await update({ scale: 2 });
  await completeGeneration(1);
  // The new generation republishes the index, so the overlay is rebuilt, not left stale.
  expect(marks()).toBe(before);
  await act(() => render(null, host));
});


