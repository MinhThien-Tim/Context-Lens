import { describe, expect, it } from 'vitest';
import { extractStructuredPage, joinLines, shiftStructuredPage } from './extractStructuredPages';
import type { PdfSourceTextItem } from './types';
import { readingExtractionSamples } from './readingExtraction.fixtures';
import realColumns from './twoColumn.real.fixture.json';

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
    const page = extractStructuredPage(1, [item('Right first visually', 340, 720), item('Left first logically', 30, 710), item('Right second body line', 340, 700), item('Left second body line', 30, 690), item('Right third body line', 340, 680), item('Left third body line', 30, 670)], 600, 800);
    expect(page.plainText.indexOf('Left')).toBeLessThan(page.plainText.indexOf('Right'));
  });

  it('reads the real ACL page excerpt left column then right, with its spanning title first', () => {
    const page = shiftStructuredPage(extractStructuredPage(1, realColumns.items, realColumns.width, realColumns.height), 100);
    expect(page.plainText.startsWith('Transformer-XL: Attentive Language Models')).toBe(true);
    expect(page.plainText.indexOf('We propose')).toBeLessThan(page.plainText.indexOf('tion to language'));
    expect(page.plainText.indexOf('fixed-length')).toBeLessThan(page.plainText.indexOf('results on multiple'));
    expect(page.plainText).toContain('longer-term dependency, but are limited by a fixed-length context in the setting of language modeling. We propose a novel neural ar-');
    for (const block of page.blocks) expect(page.plainText.slice(block.startOffset - 100, block.endOffset - 100)).toBe(block.text);
    expect(page.endOffset).toBe(100 + page.plainText.length);
  });

  it('places spanning title, quotation and footnote around complete column bands', () => {
    const items = [item('A spanning title for both columns', 40, 760, 20, 510),
      ...[700, 684, 668].flatMap((y, i) => [item(`Left body line ${i}`, 40, y, 12, 220), item(`Right body line ${i}`, 330, y, 12, 220)]),
      item('“A spanning quotation across both text regions.”', 60, 620, 12, 490),
      ...[580, 564, 548].flatMap((y, i) => [item(`Lower left line ${i}`, 40, y, 12, 220), item(`Lower right line ${i}`, 330, y, 12, 220)]),
      item('1 A full width footnote explaining the source.', 40, 60, 9, 510)];
    const text = extractStructuredPage(1, items, 600, 800).plainText;
    const phrases = ['A spanning title', 'Left body line 2', 'Right body line 0', 'Right body line 2', 'A spanning quotation', 'Lower left line 2', 'Lower right line 0', 'full width footnote'];
    for (let i = 1; i < phrases.length; i++) expect(text.indexOf(phrases[i])).toBeGreaterThan(text.indexOf(phrases[i - 1]));
  });

  it('does not turn isolated right-aligned quotes into a second column', () => {
    const items = [item('First short body line.', 40, 700), item('“An inset quotation.”', 340, 680), item('Second short body line.', 40, 660), item('“Another quotation.”', 340, 640), item('Body text resumes here.', 40, 620)];
    const text = extractStructuredPage(1, items, 600, 800).plainText;
    expect(text.indexOf('An inset')).toBeLessThan(text.indexOf('Second short'));
    expect(text.indexOf('Another quotation')).toBeLessThan(text.indexOf('Body text resumes'));
  });

  it('keeps visual order when only two lines support each possible column', () => {
    const page = extractStructuredPage(1, [item('Right first visually', 340, 720), item('Left first logically', 30, 710), item('Right second', 340, 700), item('Left second', 30, 690)], 600, 800);
    expect(page.plainText.indexOf('Right first')).toBeLessThan(page.plainText.indexOf('Left first'));
    expect(page.plainText.indexOf('Left first')).toBeLessThan(page.plainText.indexOf('Right second'));
  });

  it('joins explicit soft hyphens but preserves ambiguous hard hyphens', () => {
    expect(joinLines(['inter\u00ad', 'national policy'])).toBe('international policy');
    expect(joinLines(['well-', 'known example'])).toBe('well-known example');
    expect(joinLines(['re-', 'creation'])).toBe('re-creation');
    expect(joinLines(['a well-known', 'example'])).toBe('a well-known example');
  });

  it('preserves an indented paragraph boundary after a short terminal line', () => {
    const page = extractStructuredPage(1, readingExtractionSamples.book, 600, 800);
    expect(page.blocks.map(block => block.text)).toEqual(['The first paragraph ends here.', 'A new paragraph starts here and continues on the next line.']);
  });

  it('keeps article and furniture source order without deleting margin text', () => {
    for (const name of ['article', 'furniture'] as const) {
      const page = extractStructuredPage(1, readingExtractionSamples[name], 600, 800);
      expect(page.blocks.find(block => block.text === (name === 'article' ? 'Research findings' : 'Methods'))?.type).toBe('heading');
      for (const block of page.blocks) expect(page.plainText.slice(block.startOffset, block.endOffset)).toBe(block.text);
      if (name === 'furniture') {
        expect(page.plainText.startsWith('Journal of Reading')).toBe(true);
        expect(page.plainText.endsWith('Journal of Reading — 12')).toBe(true);
      }
    }
  });

  it('keeps ambiguous hyphenation and removes only explicit discretionary hyphens', () => {
    const page = extractStructuredPage(1, readingExtractionSamples.hyphens, 600, 800);
    expect(page.plainText).toBe('A well-known example uses international evidence and re-creation as distinct terms.');
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
