import { describe, expect, it } from 'vitest';
import { extractStructuredPage, joinLines, shiftStructuredPage } from './extractStructuredPages';
import type { PdfSourceTextItem } from './types';

const item = (str: string, x: number, y: number, size = 12, width = str.length * 6): PdfSourceTextItem => ({ str, width, height: size, transform: [size, 0, 0, size, x, y] });

describe('structured PDF extraction', () => {
  it('groups lines into paragraphs and preserves canonical offsets', () => {
    const page = shiftStructuredPage(extractStructuredPage(2, [item('A readable paragraph', 40, 700), item('continues on this line.', 40, 684)], 600, 800), 100);
    expect(page.blocks).toHaveLength(1);
    expect(page.blocks[0]).toEqual(expect.objectContaining({ type: 'paragraph', text: 'A readable paragraph continues on this line.', startOffset: 100 }));
    expect(page.endOffset).toBe(100 + page.plainText.length);
  });

  it('classifies headings, dialogue, lists and footnotes conservatively', () => {
    const page = extractStructuredPage(1, [item('A REAL HEADING', 40, 740, 20), item('NARRATOR: Welcome.', 40, 690), item('• First item', 40, 650), item('• Second item', 40, 634), item('1 Footnote text', 40, 70, 9)], 600, 800);
    expect(page.blocks.map(block => block.type)).toEqual(['heading', 'dialogue', 'list', 'footnote']);
    expect(page.blocks.find(block => block.type === 'dialogue')?.speaker).toBe('NARRATOR');
    expect(page.blocks.find(block => block.type === 'list')?.items).toEqual(['First item', 'Second item']);
  });

  it('orders the left column before the right column', () => {
    const page = extractStructuredPage(1, [item('Right first visually', 340, 720), item('Left first logically', 30, 710), item('Right second', 340, 700), item('Left second', 30, 690)], 600, 800);
    expect(page.plainText.indexOf('Left')).toBeLessThan(page.plainText.indexOf('Right'));
  });

  it('joins soft line hyphens but preserves compound words', () => {
    expect(joinLines(['inter-', 'national policy'])).toBe('international policy');
    expect(joinLines(['a well-known', 'example'])).toBe('a well-known example');
  });

  it('marks blank and scan-only pages as poor without crashing', () => {
    expect(extractStructuredPage(3, [], 600, 800)).toEqual(expect.objectContaining({ plainText: '', blocks: [], extractionQuality: 'poor' }));
  });

  it('keeps centered title lines together and flags tracked lettering for review', () => {
    const page = extractStructuredPage(5, [
      item('T H I R D', 205, 502, 8, 29), item(' ', 234, 502, 8, 6), item('E D I T I O N', 239, 502, 8, 39),
      item('“THEY SAY', 130, 461, 24, 131), item(' ', 261, 461, 24, 18), item('I SAY”', 279, 461, 24, 75),
      item('T h e M o v e s T h a t M a t t e r', 154, 431, 15, 177),
      item('H', 223, 358, 23, 37), item('GERALD GRAFF', 184, 316, 14, 116),
      item('CATHY BIRKENSTEIN', 163, 292, 14, 157), item('both of the University of Illinois at Chicago', 154, 271, 10, 177)
    ], 403, 556);
    expect(page.plainText).toContain('THIRD EDITION');
    expect(page.plainText).toContain('“THEY SAY I SAY”');
    expect(page.plainText).not.toMatch(/\n\nH\n\n/);
    expect(page.extractionQuality).toBe('partial');
    expect(page.plainText.indexOf('THIRD')).toBeLessThan(page.plainText.indexOf('GERALD'));
  });
});
