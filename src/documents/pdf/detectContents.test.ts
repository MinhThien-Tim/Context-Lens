import { describe, expect, it } from 'vitest';
import { detectPdfContents, inferPdfHeadings } from './detectContents';
import type { PdfSourceTextItem, PdfStructuredPage } from './types';

const item = (str: string, x: number, y: number): PdfSourceTextItem => ({ str, width: str.length * 6, height: 12, transform: [12, 0, 0, 12, x, y] });
const page = (number: number, text: string): PdfStructuredPage => ({ pageNumber: number, startOffset: number * 10, endOffset: number * 10 + text.length, plainText: text, blocks: text ? [{ id: `${number}`, type: 'heading', text, startOffset: number * 10, endOffset: number * 10 + text.length }] : [], extractionQuality: 'good' });

describe('printed PDF contents', () => {
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
