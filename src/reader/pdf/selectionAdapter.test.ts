import { describe, expect, it } from 'vitest';
import { pdfSelectionFromDom } from './selectionAdapter';

describe('PDF selection adapter', () => {
  it('maps a DOM selection to the document offset and normalizes line hyphenation', () => {
    const root = document.createElement('div');
    root.textContent = 'contex-\n tual clue';
    document.body.append(root);
    const text = root.firstChild!;
    const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 14);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    const result = pdfSelectionFromDom(root, 'Earlier. contex-tual clue helps.', 9);
    expect(result).toEqual(expect.objectContaining({ text: 'contextual', offset: 9, type: 'word' }));
    root.remove(); selection.removeAllRanges();
  });
});
