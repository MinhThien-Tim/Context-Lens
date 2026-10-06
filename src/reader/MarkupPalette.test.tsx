import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { MarkupPalette } from './MarkupPalette';

afterEach(() => document.body.replaceChildren());

it('keeps tool and color selection independent until the palette is closed', () => {
  const onToolChange = vi.fn(), onColorChange = vi.fn(), onClose = vi.fn();
  render(<MarkupPalette tool={null} color="yellow" onToolChange={onToolChange} onColorChange={onColorChange} onClose={onClose} />, document.body);
  act(() => document.querySelector<HTMLButtonElement>('[aria-label="Use pink"]')!.click());
  expect(onColorChange).toHaveBeenCalledWith('pink');
  expect(onToolChange).toHaveBeenCalledWith('highlight');
  // docs/desktop-reader.md §2.1: the tool that sets `underline` is named Underline, not Pen.
  act(() => Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Underline')!.click());
  expect(onToolChange).toHaveBeenCalledWith('underline');
  act(() => Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Done')!.click());
  expect(onClose).toHaveBeenCalledOnce();
});

it('disables colors while the eraser is active', () => {
  render(<MarkupPalette tool="eraser" color="blue" onToolChange={() => {}} onColorChange={() => {}} onClose={() => {}} />, document.body);
  expect(Array.from(document.querySelectorAll<HTMLButtonElement>('.highlight-color')).every(button => button.disabled)).toBe(true);
});
