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
      const layer = { container: this.args.container, cancel: this.cancel, finish: () => { this.args.container.textContent = 'The decision.'; resolve(); } };
      state.layers.push(layer);
    }); }
  },
}));
afterEach(() => { state.layers = []; document.body.replaceChildren(); vi.useRealTimers(); vi.restoreAllMocks(); });

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
  const text = host.querySelector('.pdf-text-layer')!.firstChild!;
  const range = document.createRange(); range.setStart(text, 4); range.setEnd(text, 12);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  vi.useFakeTimers();
  document.dispatchEvent(new Event('selectionchange'));
  await act(() => { vi.advanceTimersByTime(125); });
  const buttons = () => Array.from(document.querySelectorAll<HTMLButtonElement>('.pdf-original-actions button'));
  expect(window.getSelection()?.toString()).toBe('decision');
  expect(buttons().map(b => b.textContent)).toContain('Explain');
  await act(() => buttons().find(b => b.textContent === 'Explain')!.click());
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

it('maps the touch long-press fallback through the canonical index', async () => {
  const { host, onLookup } = await mount(); await act(async () => state.layers[0].finish());
  const text = host.querySelector('.pdf-text-layer')!.firstChild!;
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
