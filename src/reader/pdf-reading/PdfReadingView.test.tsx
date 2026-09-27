import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import type { DocumentRecord } from '../../db/database';
import type { PdfDocumentLocation } from '../../documents/location';
import { PdfReadingView } from './PdfReadingView';

const host = document.createElement('div');
afterEach(() => { act(() => render(null, host)); host.remove(); window.getSelection()?.removeAllRanges(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('ends a defined native selection so the first subsequent word tap works without moving reading position', async () => {
  document.body.append(host);
  const content = 'The decision surprised voters.';
  const location: PdfDocumentLocation = { kind: 'pdf', page: 1, viewMode: 'reading', scrollY: 0, progress: 0, updatedAt: 0 };
  const documentRecord = { id: 'reading', kind: 'pdf', content, pageOffsets: [0], location } as DocumentRecord;
  const onLookup = vi.fn();
  await act(() => render(<PdfReadingView documentRecord={documentRecord} location={location} style={{}} activeMarkupColor="yellow" onLocation={vi.fn()} onLookup={onLookup} onAddNote={vi.fn()} onHighlight={vi.fn()} onErase={vi.fn()} />, host));
  const root = host.querySelector<HTMLElement>('.pdf-reading-scroll')!;
  root.scrollTop = 340;
  const node = host.querySelector('[data-offset]')!.firstChild!;
  const range = document.createRange(); range.setStart(node, 4); range.setEnd(node, 12);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  vi.useFakeTimers(); document.dispatchEvent(new Event('selectionchange'));
  await act(() => { vi.advanceTimersByTime(170); });
  const define = Array.from(host.querySelectorAll<HTMLButtonElement>('.pdf-reading-selection-actions button')).find(button => button.textContent === 'Define')!;
  await act(() => define.click());
  expect(onLookup).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'decision', offset: 4, endOffset: 12 }));
  expect(window.getSelection()?.isCollapsed).toBe(true);
  expect(host.querySelector('.pdf-reading-selection-actions')).toBeNull();
  const caret = document.createRange(); caret.setStart(node, content.indexOf('voters') + 1); caret.collapse(true);
  Object.defineProperty(document, 'caretRangeFromPoint', { configurable: true, value: vi.fn(() => caret) });
  await act(() => { root.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 })); });
  expect(onLookup).toHaveBeenCalledTimes(2);
  expect(onLookup).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'voters', offset: content.indexOf('voters') }));
  expect(root.scrollTop).toBe(340);
});
