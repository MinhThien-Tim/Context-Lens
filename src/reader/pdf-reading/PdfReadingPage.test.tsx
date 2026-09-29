import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { PdfReadingPage } from './PdfReadingPage';
import { PdfReadingView } from './PdfReadingView';
import { pdfPageNeedsOcr, readingPagesForDocument } from './structuredPages';
import type { DocumentRecord, PdfOcrRecord } from '../../db/database';
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

  it('renders an unresolved printed entry as selectable static canonical text', () => {
    const text = 'First Chapter 101';
    const host = document.createElement('div'); document.body.append(host);
    render(<PdfReadingPage page={{ pageNumber: 2, startOffset: 10, endOffset: 10 + text.length, plainText: text, extractionQuality: 'good', blocks: [{ id: 'entry', type: 'toc-entry', title: 'First Chapter', printedPageLabel: '101', text, startOffset: 10, endOffset: 10 + text.length }] }} highlights={[{ id: 'page', startOffset: 24, endOffset: 27, color: 'yellow', createdAt: 1 }]} />, host);
    const entry = host.querySelector('.pdf-reading-toc-entry')!;
    expect(entry.textContent).toBe(text);
    expect(entry.getAttribute('data-offset')).toBe('10');
    expect(entry.querySelector('mark')?.textContent).toBe('101');
    expect(entry.querySelector('a, button, [role="link"]')).toBeNull();
    const range = document.createRange(); range.setStart(entry.firstChild!, 8); range.collapse(true);
    expect(readingWordFromRange(host, ' '.repeat(10) + text, range)).toEqual(expect.objectContaining({ text: 'Chapter', offset: 16 }));
    render(null, host); host.remove();
  });

  it('derives page records for legacy imported PDFs without crashing', () => {
    const documentRecord = { id: 'legacy', title: 'Legacy', kind: 'pdf', content: 'First page\n\nSecond page', pageOffsets: [0, 12], createdAt: 0, updatedAt: 0, location: { kind: 'pdf', page: 1, scrollY: 0, progress: 0, updatedAt: 0 } } as DocumentRecord;
    const pages = readingPagesForDocument(documentRecord);
    expect(pages).toHaveLength(2);
    expect(pages[1]).toEqual(expect.objectContaining({ pageNumber: 2, extractionQuality: 'partial' }));
    expect(pages[1].textIntegrity).toBeUndefined();
  });

  it('prefers cached OCR for corrupt good text without changing the native page or legacy behavior', () => {
    const plainText = 'Broken PDF text '.repeat(5);
    const block = { id: 'p', type: 'paragraph' as const, text: plainText, startOffset: 12, endOffset: 12 + plainText.length };
    const page = { pageNumber: 1, startOffset: 12, endOffset: block.endOffset, plainText, blocks: [block], extractionQuality: 'good' as const, textIntegrity: 'corrupt' as const };
    const record = { content: ' '.repeat(12) + plainText, pageOffsets: [12], pdfPages: [page] } as DocumentRecord;
    expect(pdfPageNeedsOcr(record, 1)).toBe(true);
    expect(pdfPageNeedsOcr({ ...record, pdfPages: [{ ...page, textIntegrity: 'valid' }] } as DocumentRecord, 1)).toBe(false);
    expect(pdfPageNeedsOcr({ ...record, pdfPages: [{ ...page, textIntegrity: undefined }] } as DocumentRecord, 1)).toBe(false);
    expect(readingPagesForDocument(record)[0]).toBe(page);
    expect(record.content.slice(block.startOffset, block.endOffset)).toBe(plainText);
    const host = document.createElement('div');
    const onSource = vi.fn();
    render(<PdfReadingPage page={page} hasOcr onSource={onSource} />, host);
    expect(host.querySelector('.pdf-reading-content')?.textContent).toBe(plainText);
    expect(host.querySelector('select')?.value).toBe('pdf');
    const select = host.querySelector('select')!;
    select.value = 'ocr';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onSource).toHaveBeenCalledWith('ocr');
  });

  it('shows cached OCR for corrupt text and honors reversible per-page source choices without changing offsets', async () => {
    const plainText = 'Unreadable PDF glyphs remain the canonical native page text.';
    const startOffset = 12;
    const block = { id: 'native', type: 'paragraph' as const, text: plainText, startOffset, endOffset: startOffset + plainText.length };
    const page = { pageNumber: 1, startOffset, endOffset: block.endOffset, plainText, blocks: [block], extractionQuality: 'good' as const, textIntegrity: 'corrupt' as const };
    const record = { id: 'corrupt', kind: 'pdf', content: ' '.repeat(startOffset) + plainText, pageOffsets: [startOffset], pdfPages: [page], location: { kind: 'pdf', page: 1, viewMode: 'reading', scrollY: 0, progress: 0, updatedAt: 0 } } as DocumentRecord;
    const ocr = { key: 'cached', documentId: 'corrupt', page: 1, language: 'eng', configVersion: 2, text: 'Readable OCR text.', createdAt: 0 } as PdfOcrRecord;
    const nativeBefore = JSON.stringify({ content: record.content, pageOffsets: record.pageOffsets, pdfPages: record.pdfPages });
    const host = document.createElement('div');
    document.body.append(host);
    const onTextSource = vi.fn();
    const show = async (source?: 'pdf' | 'ocr') => {
      const documentRecord = source ? { ...record, pdfTextSources: { 1: source } } : record;
      await act(async () => render(<PdfReadingView documentRecord={documentRecord} location={record.location as Extract<typeof record.location, { kind: 'pdf' }>} style={{}} activeMarkupColor="yellow" onLocation={vi.fn()} onLookup={vi.fn()} onAddNote={vi.fn()} onHighlight={vi.fn()} onErase={vi.fn()} ocrPages={[ocr]} onTextSource={onTextSource} />, host));
    };
    try {
      await show();
      expect(host.querySelector('.pdf-ocr-page .pdf-reading-content')?.textContent).toBe(ocr.text);
      expect(host.querySelector<HTMLSelectElement>('select')?.value).toBe('ocr');
      const choose = (source: 'pdf' | 'ocr') => {
        const select = host.querySelector<HTMLSelectElement>('select')!;
        select.value = source;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        expect(onTextSource).toHaveBeenLastCalledWith(1, source);
      };
      choose('pdf');
      await show('pdf');
      expect(host.querySelector('.pdf-ocr-page')).toBeNull();
      expect(host.querySelector('.pdf-reading-content')?.textContent).toBe(plainText);
      expect(host.querySelector<HTMLSelectElement>('select')?.value).toBe('pdf');
      choose('ocr');
      await show('ocr');
      expect(host.querySelector('.pdf-ocr-page .pdf-reading-content')?.textContent).toBe(ocr.text);
      expect(JSON.stringify({ content: record.content, pageOffsets: record.pageOffsets, pdfPages: record.pdfPages })).toBe(nativeBefore);
      expect(record.content.slice(block.startOffset, block.endOffset)).toBe(plainText);
    } finally {
      await act(async () => render(null, host));
      host.remove();
    }
  });

  it('preserves cached OCR source selection for normal partial and legacy pages', async () => {
    const native = 'Trustworthy but incomplete PDF text remains available.';
    const legacy = { id: 'legacy', kind: 'pdf', content: native, pageOffsets: [0], location: { kind: 'pdf', page: 1, viewMode: 'reading', scrollY: 0, progress: 0, updatedAt: 0 } } as DocumentRecord;
    const partial = { ...legacy, id: 'partial', pdfPages: [{ pageNumber: 1, startOffset: 0, endOffset: native.length, plainText: native, blocks: [{ id: 'p', type: 'paragraph' as const, text: native, startOffset: 0, endOffset: native.length }], extractionQuality: 'partial' as const, textIntegrity: 'valid' as const }] } as DocumentRecord;
    const host = document.createElement('div');
    document.body.append(host);
    try {
      for (const record of [partial, legacy]) {
        const ocr = { key: record.id, documentId: record.id, page: 1, language: 'eng', configVersion: 2, text: 'Cached OCR text.', createdAt: 0 } as PdfOcrRecord;
        const show = async (documentRecord: DocumentRecord) => act(async () => render(<PdfReadingView documentRecord={documentRecord} location={record.location as Extract<typeof record.location, { kind: 'pdf' }>} style={{}} activeMarkupColor="yellow" onLocation={vi.fn()} onLookup={vi.fn()} onAddNote={vi.fn()} onHighlight={vi.fn()} onErase={vi.fn()} ocrPages={[ocr]} />, host));
        await show(record);
        expect(host.querySelector('.pdf-ocr-page .pdf-reading-content')?.textContent).toBe(ocr.text);
        await show({ ...record, pdfTextSources: { 1: 'pdf' } });
        expect(host.querySelector('.pdf-reading-content')?.textContent).toBe(native);
      }
    } finally {
      await act(async () => render(null, host));
      host.remove();
    }
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
