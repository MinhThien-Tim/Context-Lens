import { afterEach, expect, it, vi } from 'vitest';
import type { DocumentRecord } from '../db/database';
import { indexAtOffset, jumpToOffset, keyboardCanNavigate, locationAtOffset, navigationOffset, positionLabel, rangeAtOffset } from './navigation';
const doc: DocumentRecord = { id: 'nav', title: 'Book', kind: 'pdf', content: 'One\n\n\n\nThree', pageOffsets: [0, 5, 7], createdAt: 1, updatedAt: 1, location: { kind: 'pdf', page: 1, scrollY: 0, progress: 0, updatedAt: 1 } };
afterEach(() => { document.body.replaceChildren(); window.getSelection()?.removeAllRanges(); });
it('maps real PDF pages including empty pages and rejects invalid page numbers', () => {
  expect(indexAtOffset(doc.pageOffsets, 5)).toBe(1);
  expect(locationAtOffset(doc, 7)).toMatchObject({ kind: 'pdf', page: 3, absoluteOffset: 7 });
  expect(navigationOffset(doc, 0)).toBeNull(); expect(navigationOffset(doc, 4)).toBeNull(); expect(navigationOffset(doc, 1.5)).toBeNull();
  expect(navigationOffset(doc, 2)).toBe(5);
  expect(positionLabel(doc, locationAtOffset(doc, 7))).toBe('3 / 3');
});
it('uses chapters for EPUB and percentages for reflowable documents', () => {
  const epub = { ...doc, kind: 'epub' as const, chapterOffsets: [0, 7] };
  expect(positionLabel(epub, locationAtOffset(epub, 7))).toMatch(/^Chapter 2 \/ 2/);
  const text = { ...doc, kind: 'text' as const };
  expect(positionLabel(text, locationAtOffset(text, 0))).toBe('0%');
  expect(navigationOffset(text, 101)).toBeNull(); expect(navigationOffset(text, 100)).toBe(text.content.length);
});
it('jumps to a rendered text range and focuses the reader', () => {
  document.body.innerHTML = '<article tabindex="0" data-reader-text><p>One\n\n</p><p>Three</p></article>';
  const root = document.querySelector<HTMLElement>('article')!;
  expect(rangeAtOffset(root, 5)?.startContainer.textContent).toBe('Three');
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => ({ top: 300 }) });
  jumpToOffset(5);
  expect(scroll).toHaveBeenCalledWith({ top: 190, behavior: 'auto' });
  expect(document.activeElement).toBe(root);
  expect(root.querySelectorAll('p')[1].classList.contains('location-target')).toBe(true);
  delete (Range.prototype as Partial<Range>).getBoundingClientRect;
});
it('ignores navigation keys inside forms, dialogs and native selections', () => {
  document.body.innerHTML = '<input><section role="dialog"><div tabindex="0"></div></section><p>Text</p>';
  for (const target of document.querySelectorAll('input,section div')) {
    const event = new KeyboardEvent('keydown', { key: 't', bubbles: true });
    target.dispatchEvent(event); expect(keyboardCanNavigate(event)).toBe(false);
  }
  const range = document.createRange(); range.selectNodeContents(document.querySelector('p')!); window.getSelection()?.addRange(range);
  expect(keyboardCanNavigate(new KeyboardEvent('keydown', { key: 'ArrowRight' }))).toBe(false);
  window.getSelection()?.removeAllRanges();
  expect(keyboardCanNavigate(new KeyboardEvent('keydown', { key: 't' }))).toBe(true);
});
