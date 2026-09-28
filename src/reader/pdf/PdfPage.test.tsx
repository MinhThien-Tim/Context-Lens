import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfPage } from './PdfPage';
import { acquirePage } from './pageLease';

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
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => span });
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: function (this: Range) { return [{ left: this.startOffset * 10, right: (this.startOffset + 1) * 10, top: 0, bottom: 30 }]; } });
  const range = document.createRange(); range.setStart(text, 4); range.setEnd(text, 12);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  await act(() => { span.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, button: 0, clientX: 55, clientY: 10 })); });
  await act(async () => new Promise(resolve => setTimeout(resolve, 30)));
  expect(onLookup).toHaveBeenCalledOnce();
  expect(onLookup).toHaveBeenCalledWith(expect.objectContaining({ text: 'decision', offset: 4, endOffset: 12 }));
  expect(document.querySelector('.pdf-original-actions')).toBeNull();
  range.setStart(text, 0); range.setEnd(text, 12);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  await act(async () => new Promise(resolve => setTimeout(resolve, 30)));
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
