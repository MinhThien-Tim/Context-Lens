import { describe, expect, it } from 'vitest';
import { readingSelectionFromDom } from './readingSelectionAdapter';

describe('PDF Reading selection adapter', () => {
  it('maps a phrase to canonical offsets from its structured block', () => {
    const root = document.createElement('div');
    root.innerHTML = '<section><p data-offset="12">A useful contextual phrase.</p></section>';
    document.body.append(root);
    const node = root.querySelector('p')!.firstChild!;
    const range = document.createRange(); range.setStart(node, 2); range.setEnd(node, 26);
    const nativeSelection = window.getSelection()!; nativeSelection.removeAllRanges(); nativeSelection.addRange(range);
    const result = readingSelectionFromDom(root, 'Earlier.    A useful contextual phrase. Next sentence.');
    expect(result).toEqual(expect.objectContaining({ text: 'useful contextual phrase', offset: 14, type: 'phrase' }));
    root.remove(); nativeSelection.removeAllRanges();
  });

  it('uses canonical endpoints when a selection crosses blocks', () => {
    const root = document.createElement('div'); root.innerHTML = '<p data-offset="0">First sentence.</p><p data-offset="17">Second sentence.</p>'; document.body.append(root);
    const blocks = root.querySelectorAll('p');
    const range = document.createRange(); range.setStart(blocks[0].firstChild!, 6); range.setEnd(blocks[1].firstChild!, 6);
    const nativeSelection = window.getSelection()!; nativeSelection.removeAllRanges(); nativeSelection.addRange(range);
    const result = readingSelectionFromDom(root, 'First sentence.\n\nSecond sentence.');
    expect(result?.offset).toBe(6);
    expect(result?.context.current).toContain('sentence');
    root.remove(); nativeSelection.removeAllRanges();
  });
});
