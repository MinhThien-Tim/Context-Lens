import { describe, expect, it } from 'vitest';
import { detectPdfContents, inferPdfHeadings, recognizePdfContents, resolvePdfContents, tagPdfContents } from './detectContents';
import type { PdfSourceTextItem, PdfStructuredPage } from './types';

const item = (str: string, x: number, y: number): PdfSourceTextItem => ({ str, width: str.length * 6, height: 12, transform: [12, 0, 0, 12, x, y] });
const page = (number: number, text: string): PdfStructuredPage => ({ pageNumber: number, startOffset: number * 10, endOffset: number * 10 + text.length, plainText: text, blocks: text ? [{ id: `${number}`, type: 'heading', text, startOffset: number * 10, endOffset: number * 10 + text.length }] : [], extractionQuality: 'good' });

describe('printed PDF contents', () => {
  it('rebuilds numbered rows from column-ordered TextItems', () => {
    const source = [{ number: 2, width: 600, height: 800, items: [
      item('Contents', 50, 750),
      item('1', 50, 690), item('2', 50, 660), item('3', 50, 630),
      item('4', 50, 600), item('5', 50, 570), item('6', 50, 540),
      item('The', 90, 690), item('Transaction', 115, 690), item('Simplicity', 90, 660),
      item('Clutter', 90, 630), item('Form', 90, 600), item('Balance', 90, 570), item('Order', 90, 540),
      item('3', 490, 690), item('7', 490, 660), item('13', 490, 630),
      item('19', 490, 600), item('25', 490, 570), item('31', 490, 540)
    ] }];
    expect(recognizePdfContents(source).map(row => [row.title, row.label, row.level])).toEqual([
      ['The Transaction', '3', 1], ['Simplicity', '7', 1], ['Clutter', '13', 1],
      ['Form', '19', 1], ['Balance', '25', 1], ['Order', '31', 1]
    ]);
  });

  it('joins wrapped titles, strips leaders, and infers indentation within a column', () => {
    const source = [{ number: 2, width: 600, height: 800, items: [
      item('Contents', 50, 750), item('The Long', 60, 700), item('Transaction', 60, 684), item('....', 200, 684), item('3', 490, 684),
      item('A Subentry', 82, 650), item('7', 490, 650), item('Next Chapter', 60, 620), item('13', 490, 620)
    ] }];
    expect(recognizePdfContents(source).map(row => [row.title, row.label, row.level])).toEqual([
      ['The Long Transaction', '3', 1], ['A Subentry', '7', 2], ['Next Chapter', '13', 1]
    ]);
  });

  it('accepts right-aligned labels of different widths and preserves unique canonical tagging', () => {
    const source = [{ number: 2, width: 600, height: 800, items: [
      item('Contents', 50, 750), item('Opening', 60, 690), item('3', 500, 690),
      item('Middle', 60, 660), item('27', 494, 660), item('Closing', 60, 630), item('153', 488, 630)
    ] }];
    const rows = recognizePdfContents(source);
    expect(rows.map(row => row.label)).toEqual(['3', '27', '153']);
    const canonical = { ...page(2, 'Opening 3\nMiddle 27'), blocks: [
      { id: 'whole', type: 'paragraph' as const, text: 'Opening 3', startOffset: 20, endOffset: 29 },
      { id: 'split-a', type: 'paragraph' as const, text: 'Middle', startOffset: 30, endOffset: 36 },
      { id: 'split-b', type: 'paragraph' as const, text: '27', startOffset: 37, endOffset: 39 }
    ] };
    const tagged = tagPdfContents([canonical], rows)[0];
    expect(tagged.blocks[0]).toEqual(expect.objectContaining({ type: 'toc-entry', startOffset: 20, endOffset: 29 }));
    expect(tagged.blocks.slice(1)).toEqual(canonical.blocks.slice(1));
    expect(tagged.plainText).toBe(canonical.plainText);
  });

  it('rejects numbered prose, an index, and a bare numeric sequence', () => {
    const numbered = Array.from({ length: 7 }, (_, i) => [item(String(i + 1), 50, 700 - i * 25), item('An ordinary list item', 85, 700 - i * 25)]).flat();
    const index = Array.from({ length: 7 }, (_, i) => [item('alphabetic term', 55 + i * 4, 700 - i * 25), item(String(i * 9 + 2), 440 - i * 12, 700 - i * 25)]).flat();
    const numbers = Array.from({ length: 8 }, (_, i) => item(String(i + 1), 490, 700 - i * 25));
    expect(recognizePdfContents([{ number: 2, width: 600, height: 800, items: numbered }])).toEqual([]);
    expect(recognizePdfContents([{ number: 2, width: 600, height: 800, items: index }])).toEqual([]);
    expect(recognizePdfContents([{ number: 2, width: 600, height: 800, items: numbers }])).toEqual([]);
  });
  it('keeps excerpt rows visible with zero or one destination while rejecting printed navigation', async () => {
    const source = [{ number: 2, width: 600, height: 800, items: [item('Contents', 60, 740), item('First Chapter', 60, 680), item('101', 490, 680), item('Second Chapter', 60, 650), item('202', 490, 650), item('Third Chapter', 60, 620), item('303', 490, 620)] }];
    const recognized = recognizePdfContents(source);
    expect(recognized.map(row => [row.title, row.label])).toEqual([['First Chapter', '101'], ['Second Chapter', '202'], ['Third Chapter', '303']]);
    const pages = Array.from({ length: 5 }, (_, i) => page(i + 1, 'Body'));
    const offsets = pages.map((_, i) => i * 10);
    const noTargets = await resolvePdfContents(recognized, pages, offsets, null, async () => [], async () => undefined);
    expect(noTargets.navigation).toEqual([]);
    expect(noTargets.rows.map(row => row.resolvedPage)).toEqual([undefined, undefined, undefined]);
    const oneTarget = await resolvePdfContents(recognized, pages, offsets, null, async () => [{ rect: [50, 675, 510, 685], dest: 'first' }], async () => 4);
    expect(oneTarget.navigation).toEqual([]);
    expect(oneTarget.rows.map(row => row.resolvedPage)).toEqual([4, undefined, undefined]);
    const original = 'First Chapter 101';
    const tocPage = { ...page(2, original), blocks: [{ id: 'entry', type: 'paragraph' as const, text: original, startOffset: 10, endOffset: 10 + original.length }] };
    const tagged = tagPdfContents([tocPage], noTargets.rows)[0];
    expect(tagged.blocks[0]).toEqual(expect.objectContaining({ type: 'toc-entry', title: 'First Chapter', printedPageLabel: '101', startOffset: 10, endOffset: 27 }));
    expect(tagged.plainText).toBe(original);
    expect(tagPdfContents([tocPage], [{ ...recognized[0], text: 'Other 101' }])[0].blocks).toEqual(tocPage.blocks);
  });

  it('rejects invalid links and ambiguous labels even when other entries are verified', async () => {
    const source = [{ number: 2, width: 600, height: 800, items: [item('Contents', 60, 740), item('First', 60, 680), item('A', 490, 680), item('Second', 60, 650), item('B', 490, 650), item('Third', 60, 620), item('C', 490, 620)] }];
    // Letter labels are not recognized as printed page labels; use Roman numerals instead.
    source[0].items[2].str = 'i'; source[0].items[4].str = 'ii'; source[0].items[6].str = 'iii';
    const rows = recognizePdfContents(source);
    const pages = Array.from({ length: 8 }, (_, i) => page(i + 1, 'Body'));
    const result = await resolvePdfContents(rows, pages, pages.map((_, i) => i * 10), ['x', 'x', 'x', 'i', 'i', 'ii', 'iii', 'x'], async () => [
      { rect: [50, 675, 510, 685], dest: 'bad' }, { rect: [50, 645, 510, 655], dest: 'second' }, { rect: [50, 615, 510, 625], dest: 'third' }
    ], async dest => ({ bad: 99, second: 2, third: 7 })[String(dest)]);
    expect(result.rows.map(row => row.resolvedPage)).toEqual([undefined, undefined, 7]);
    expect(result.navigation).toEqual([]);
  });

  it('resolves unique PDF page labels but leaves duplicate labels without destinations', async () => {
    const source = [{ number: 2, width: 600, height: 800, items: [
      item('Contents', 60, 740), item('Opening', 60, 680), item('i', 490, 680),
      item('Middle', 60, 650), item('ii', 490, 650), item('Closing', 60, 620), item('iii', 490, 620)
    ] }];
    const rows = recognizePdfContents(source);
    const pages = Array.from({ length: 9 }, (_, i) => page(i + 1, 'Body'));
    const offsets = pages.map((_, i) => i * 10);
    const result = await resolvePdfContents(rows, pages, offsets, ['x', 'x', 'x', 'i', 'ii', 'iii', 'iii', 'x', 'x'], async () => [], async () => undefined);
    expect(result.rows.map(row => row.resolvedPage)).toEqual([4, 5, undefined]);
    expect(result.navigation.map(section => [section.title, section.page, section.offset])).toEqual([
      ['Opening', 4, 30], ['Middle', 5, 40], ['Closing', undefined, undefined]
    ]);
  });

  it('uses only an agreed heading-to-printed-number shift for otherwise unresolved rows', async () => {
    const source = [{ number: 2, width: 600, height: 800, items: [
      item('Contents', 60, 740), item('Opening', 60, 680), item('1', 490, 680),
      item('Middle', 60, 650), item('2', 490, 650), item('Closing', 60, 620), item('3', 490, 620)
    ] }];
    const rows = recognizePdfContents(source);
    const offsets = Array.from({ length: 10 }, (_, i) => i * 10);
    const resolveWithHeadings = (secondPage: number) => resolvePdfContents(rows,
      Array.from({ length: 10 }, (_, i) => page(i + 1, i === 5 ? 'Opening' : i + 1 === secondPage ? 'Middle' : 'Body')),
      offsets, null, async () => [], async () => undefined);
    const agreed = await resolveWithHeadings(7);
    expect(agreed.rows.map(row => row.resolvedPage)).toEqual([6, 7, 8]);
    expect(agreed.navigation.map(section => [section.page, section.offset])).toEqual([[6, 50], [7, 60], [8, 70]]);
    const conflicting = await resolveWithHeadings(8);
    expect(conflicting.rows.map(row => row.resolvedPage)).toEqual([6, 8, undefined]);
  });

  it('orders shared-baseline columns and infers indentation separately in each column', () => {
    const source = [{ number: 2, width: 600, height: 800, items: [
      item('Contents', 40, 740),
      item('Left Chapter', 35, 680), item('1', 270, 680), item('Right Chapter', 325, 680), item('20', 570, 680),
      item('Left Section', 55, 650), item('2', 270, 650), item('Right Section', 345, 650), item('21', 570, 650),
      item('Left Next', 35, 620), item('3', 270, 620), item('Right Next', 325, 620), item('22', 570, 620)
    ] }];
    expect(recognizePdfContents(source).map(row => [row.title, row.label, row.level])).toEqual([
      ['Left Chapter', '1', 1], ['Left Section', '2', 2], ['Left Next', '3', 1],
      ['Right Chapter', '20', 1], ['Right Section', '21', 2], ['Right Next', '22', 1]
    ]);
  });
  it('pairs separated page numbers with titles and resolves actual chapter pages', async () => {
    const source = [{ number: 3, width: 600, height: 800, items: [item('Sumário', 90, 740), item('INTRODUCTION AND ANALYSIS', 90, 650), item('5', 490, 650), item('BOOK I', 90, 615), item('177', 490, 615), item('BOOK II', 90, 580), item('211', 490, 580), item('BOOK III', 90, 545), item('239', 490, 545)] }];
    const pages = Array.from({ length: 25 }, (_, i) => page(i + 1, i === 7 ? 'INTRODUCTION AND ANALYSIS' : i === 12 ? 'BOOK I' : i === 17 ? 'BOOK II' : i === 22 ? 'BOOK III' : 'Other text'));
    const toc = await detectPdfContents(source, pages, pages.map((_, index) => index * 10), null, async () => [], async () => undefined);
    expect(toc.map(item => [item.title, item.pageLabel, item.page, item.offset])).toEqual([
      ['INTRODUCTION AND ANALYSIS', '5', 8, 70], ['BOOK I', '177', 13, 120], ['BOOK II', '211', 18, 170], ['BOOK III', '239', 23, 220]
    ]);
  });

  it('uses internal PDF destinations and rejects uncorroborated lists', async () => {
    const source = [{ number: 2, width: 600, height: 800, items: [item('Contents', 60, 740), item('First', 60, 680), item('1', 490, 680), item('Second', 60, 650), item('2', 490, 650), item('Third', 60, 620), item('3', 490, 620)] }];
    const pages = Array.from({ length: 10 }, (_, i) => page(i + 1, 'Body'));
    const offsets = pages.map((_, i) => i * 10);
    expect(await detectPdfContents(source, pages, offsets, null, async () => [], async () => undefined)).toEqual([]);
    const links = [{ rect: [50, 675, 500, 685], dest: 'first' }, { rect: [50, 645, 500, 655], dest: 'second' }, { rect: [50, 615, 500, 625], dest: 'third' }];
    const toc = await detectPdfContents(source, pages, offsets, null, async () => links, async dest => ({ first: 5, second: 7, third: 9 })[String(dest)]);
    expect(toc.map(item => item.page)).toEqual([5, 7, 9]);
  });

  it('reads two-column and continued contents pages', async () => {
    const source = [
      { number: 2, width: 600, height: 800, items: [item('Contents', 40, 740), item('Book I', 35, 680), item('1', 270, 680), item('Book III', 325, 680), item('20', 570, 680), item('Book II', 35, 650), item('10', 270, 650), item('Book IV', 325, 650), item('30', 570, 650)] },
      { number: 3, width: 600, height: 800, items: [item('Book V', 35, 680), item('40', 270, 680), item('Book VI', 325, 680), item('50', 570, 680)] }
    ];
    const pages = Array.from({ length: 20 }, (_, i) => page(i + 1, 'Body'));
    const toc = await detectPdfContents(source, pages, pages.map((_, i) => i * 10), null, async pageNumber => pageNumber === 2 ? [
      { rect: [30, 675, 280, 685], dest: 'one' }, { rect: [320, 675, 580, 685], dest: 'three' },
      { rect: [30, 645, 280, 655], dest: 'two' }, { rect: [320, 645, 580, 655], dest: 'four' }
    ] : [{ rect: [30, 675, 280, 685], dest: 'five' }, { rect: [320, 675, 580, 685], dest: 'six' }], async dest => ({ one: 5, two: 7, three: 9, four: 11, five: 13, six: 15 })[String(dest)]);
    expect(toc.map(item => [item.title, item.page])).toEqual([['Book I', 5], ['Book II', 7], ['Book III', 9], ['Book IV', 11], ['Book V', 13], ['Book VI', 15]]);
  });

  it('uses repeated body chapter headings as a last resort', () => {
    const pages = [page(1, 'Cover'), page(2, 'BOOK I'), page(3, 'Body'), page(4, 'BOOK II')];
    expect(inferPdfHeadings(pages, [0, 10, 20, 30]).map(item => [item.title, item.page])).toEqual([['BOOK I', 2], ['BOOK II', 4]]);
    expect(inferPdfHeadings([page(1, 'Cover'), page(2, 'BOOK I')], [0, 10])).toEqual([]);
  });
});
