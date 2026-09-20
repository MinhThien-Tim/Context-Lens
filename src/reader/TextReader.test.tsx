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
