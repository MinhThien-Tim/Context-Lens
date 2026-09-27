import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import { PdfReadingPage } from './PdfReadingPage';
import { readingPagesForDocument } from './structuredPages';
import type { DocumentRecord } from '../../db/database';
import { extractStructuredPage, shiftStructuredPage } from '../../documents/pdf/extractStructuredPages';
import { readingExtractionSamples } from '../../documents/pdf/readingExtraction.fixtures';
import { readingSelectionFromDom, readingWordFromRange } from './readingSelectionAdapter';
import realColumns from '../../documents/pdf/twoColumn.real.fixture.json';

describe('paginated PDF reading', () => {
  it('keeps fixture text order, page offsets, selection and highlights aligned', () => {
    let content = '';
    const pageOffsets: number[] = [];
    const samples = [...Object.values(readingExtractionSamples).map(items => ({ items, width: 600, height: 800 })), realColumns];
    const pages = samples.map(({ items, width, height }, index) => {
      pageOffsets.push(content.length);
      const page = shiftStructuredPage(extractStructuredPage(index + 1, items, width, height), content.length);
      content += page.plainText + '\n\n';
      return page;
    });
    for (const page of pages) {
      expect(page.startOffset).toBe(pageOffsets[page.pageNumber - 1]);
      expect(content.slice(page.startOffset, page.endOffset)).toBe(page.plainText);
      const word = page.pageNumber === 4 ? 'international' : 'paragraph';
      const block = page.blocks.find(candidate => candidate.text.includes(word)) ?? page.blocks[1];
      const selected = block.text.includes(word) ? word : block.text.split(' ')[0];
      const offset = block.startOffset + block.text.indexOf(selected);
      const host = document.createElement('div'); document.body.append(host);
      render(<PdfReadingPage page={page} highlights={[{ id: 'sample', startOffset: offset, endOffset: offset + selected.length, color: 'yellow', createdAt: 1 }]} />, host);
      expect(Array.from(host.querySelector('.pdf-reading-content')!.children).map(node => node.textContent).join('\n\n')).toBe(page.plainText);
      const mark = host.querySelector('mark')!;
      expect(mark.textContent).toBe(selected);
      const range = document.createRange(); range.setStart(mark.firstChild!, 1); range.collapse(true);
      expect(readingWordFromRange(host, content, range)).toEqual(expect.objectContaining({ text: selected, offset, endOffset: offset + selected.length }));
      range.selectNodeContents(mark);
      const native = window.getSelection()!; native.removeAllRanges(); native.addRange(range);
      expect(readingSelectionFromDom(host, content)).toEqual(expect.objectContaining({ text: selected, offset, endOffset: offset + selected.length }));
      native.removeAllRanges(); render(null, host); host.remove();
    }
  });

  it('retains legacy page whitespace so rendered offsets still match content', () => {
    const record = { content: '  Alpha text\n\n  Beta text', pageOffsets: [0, 14] } as DocumentRecord;
    const pages = readingPagesForDocument(record);
    expect(pages[1].plainText).toBe('  Beta text');
    expect(record.content.slice(pages[1].blocks[0].startOffset, pages[1].blocks[0].endOffset)).toBe(pages[1].blocks[0].text);
  });
  it('renders semantic blocks and a visible page boundary', () => {
    const host = document.createElement('div');
    render(<PdfReadingPage page={{ pageNumber: 4, startOffset: 20, endOffset: 40, plainText: 'Chapter\n\nHello', extractionQuality: 'good', blocks: [{ id: 'h', type: 'heading', level: 2, text: 'Chapter', startOffset: 20, endOffset: 27 }, { id: 'p', type: 'paragraph', text: 'Hello', startOffset: 29, endOffset: 34 }] }} />, host);
    expect(host.querySelector('section')?.dataset.pdfReadingPage).toBe('4');
    expect(host.querySelector('header')?.textContent).toBe('Page 4');
    expect(host.querySelector('h2')?.textContent).toBe('Chapter');
  });

  it('derives page records for legacy imported PDFs without crashing', () => {
    const documentRecord = { id: 'legacy', title: 'Legacy', kind: 'pdf', content: 'First page\n\nSecond page', pageOffsets: [0, 12], createdAt: 0, updatedAt: 0, location: { kind: 'pdf', page: 1, scrollY: 0, progress: 0, updatedAt: 0 } } as DocumentRecord;
    const pages = readingPagesForDocument(documentRecord);
    expect(pages).toHaveLength(2);
    expect(pages[1]).toEqual(expect.objectContaining({ pageNumber: 2, extractionQuality: 'partial' }));
  });

  it('renders a saved reading highlight at its canonical offset', () => {
    const host = document.createElement('div');
    render(<PdfReadingPage page={{ pageNumber: 1, startOffset: 10, endOffset: 21, plainText: 'Hello world', extractionQuality: 'good', blocks: [{ id: 'p', type: 'paragraph', text: 'Hello world', startOffset: 10, endOffset: 21 }] }} highlights={[{ id: 'highlight-1', startOffset: 16, endOffset: 21, color: 'yellow', createdAt: 1 }]} />, host);
    expect(host.querySelector('mark')?.textContent).toBe('world');
    expect(host.querySelector('mark')?.classList.contains('reader-highlight-yellow')).toBe(true);
  });

  it('renders highlights inside dialogue and list blocks', () => {
    const host = document.createElement('div');
    render(<PdfReadingPage page={{ pageNumber: 1, startOffset: 0, endOffset: 35, plainText: 'SOCRATES: Hello world\n\nFirst item', extractionQuality: 'good', blocks: [{ id: 'd', type: 'dialogue', speaker: 'SOCRATES', text: 'SOCRATES: Hello world', startOffset: 0, endOffset: 21 }, { id: 'l', type: 'list', text: 'First item', items: ['First item'], startOffset: 23, endOffset: 33 }] }} highlights={[{ id: 'h1', startOffset: 10, endOffset: 15, color: 'yellow', createdAt: 1 }, { id: 'h2', startOffset: 23, endOffset: 28, color: 'blue', createdAt: 1 }]} />, host);
    expect(Array.from(host.querySelectorAll('mark')).map(node => node.textContent)).toEqual(['Hello', 'First']);
  });

  it('renders underline annotations without converting legacy highlights', () => {
    const host = document.createElement('div');
    render(<PdfReadingPage page={{ pageNumber: 1, startOffset: 0, endOffset: 11, plainText: 'Hello world', extractionQuality: 'good', blocks: [{ id: 'p', type: 'paragraph', text: 'Hello world', startOffset: 0, endOffset: 11 }] }} highlights={[{ id: 'underline', startOffset: 0, endOffset: 5, color: 'blue', style: 'underline', createdAt: 1 }, { id: 'legacy', startOffset: 6, endOffset: 11, color: 'yellow', createdAt: 1 }]} />, host);
    expect(host.querySelectorAll('.reader-highlight-underline')).toHaveLength(1);
    expect(host.querySelectorAll('.reader-highlight-highlight')).toHaveLength(1);
  });
});
