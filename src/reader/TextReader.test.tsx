import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { TextReader } from './TextReader';

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

it('keeps a dragged phrase selected until the user explicitly looks it up', async () => {
  vi.useFakeTimers();
  const host = document.createElement('div'); document.body.append(host);
  const onLookup = vi.fn();
  act(() => render(<TextReader content="The sector accounts for 40% of output." onLookup={onLookup} style={{}} />, host));
  const text = host.querySelector('p')!.firstChild!;
  const source = text.textContent!;
  const range = document.createRange();
  range.setStart(text, source.indexOf('accounts'));
  range.setEnd(text, source.indexOf('40%') + 3);
  const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  act(() => { document.dispatchEvent(new Event('selectionchange')); });
  await act(async () => { vi.runAllTimers(); await Promise.resolve(); });
  expect(onLookup).not.toHaveBeenCalled();
  expect(host.querySelector('.selection-lookup')?.textContent).toBe('Look up selection');
  act(() => (host.querySelector('.selection-lookup') as HTMLButtonElement).click());
  expect(onLookup).toHaveBeenCalledWith(expect.objectContaining({ text: 'accounts for 40%', type: 'phrase' }));
});

it('renders and applies markup in formatted pasted text', async () => {
  vi.useFakeTimers();
  const host = document.createElement('div'); document.body.append(host);
  const onHighlight = vi.fn();
  const props = { content: 'HeadingSelected words', safeHtml: '<h2>Heading</h2><p>Selected words</p>', onLookup: vi.fn(), style: {}, activeMarkupTool: 'highlight' as const, activeMarkupColor: 'pink' as const, onHighlight };
  act(() => render(<TextReader {...props} />, host));
  const text = host.querySelector('p')!.firstChild!;
  const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 8);
  const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  act(() => { host.querySelector('article')!.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, shiftKey: true })); });
  await act(async () => { vi.runAllTimers(); await Promise.resolve(); });
  expect(onHighlight).toHaveBeenCalledTimes(1);
  const saved = onHighlight.mock.calls[0][0];
  act(() => render(<TextReader {...props} highlights={[saved]} />, host));
  expect(host.querySelector('mark.reader-highlight-pink')?.textContent).toBe('Selected');
});
