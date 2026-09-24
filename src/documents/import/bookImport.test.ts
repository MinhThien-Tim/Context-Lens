import { expect, it, vi } from 'vitest';
import { importLocalFile } from './fileImport';
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  OPS: { paintImageXObject: 1, paintInlineImageXObject: 2, paintImageMaskXObject: 3 },
  getDocument: () => ({ destroy: vi.fn(), promise: Promise.resolve({
    numPages: 3, getMetadata: async () => ({ info: { Title: 'PDF book' } }),
    getPage: async (page: number) => ({ getTextContent: async () => ({ items: [{ str: ['One', '', 'Three'][page - 1] }] }), getOperatorList: async () => ({ fnArray: [] }), cleanup: vi.fn() }),
    getOutline: async () => [{ title: 'Final', dest: 'final', items: [] }],
    getDestination: async () => [{ num: 9, gen: 0 }], getPageIndex: async () => 2
  }) })
}));
vi.mock('epubjs', () => ({ default: () => {
  const sections = ['<body><h1 id="start">First</h1><p>Body.</p></body>', '<body><h1>Second</h1><p id="detail">Detail.</p></body>'].map((html, index) => {
    const document = new DOMParser().parseFromString(html, 'text/html');
    return { href: `chapter${index + 1}.xhtml`, document, load: async () => document.documentElement, unload: vi.fn() };
  });
  return { ready: Promise.resolve(), loaded: { metadata: Promise.resolve({ title: 'EPUB book', creator: 'Author' }), navigation: Promise.resolve({ toc: [{ label: 'Detail', href: 'chapter2.xhtml#detail' }] }) }, spine: { each: (callback: (section: unknown) => void) => sections.forEach(callback) }, load: vi.fn(), destroy: vi.fn() };
} }));
const file = (name: string) => ({ name, size: 1, arrayBuffer: async () => new ArrayBuffer(1) }) as File;
it('retains blank PDF pages in extracted text, offsets and outline destinations', async () => {
  const result = await importLocalFile(file('book.pdf'));
  expect(result.content).toBe('One\n\n\n\nThree');
  expect(result.pageOffsets).toEqual([0, 5, 7]);
  expect(result.toc?.[0]).toMatchObject({ title: 'Final', page: 3, offset: 7 });
});
it('uses the actual EPUB section/document runtime contract and fragment navigation', async () => {
  const result = await importLocalFile(file('book.epub'));
  expect(result.content).toBe('FirstBody.\n\nSecondDetail.');
  expect(result.chapterOffsets).toEqual([0, 12]);
  expect(result.toc?.[0]).toMatchObject({ title: 'Detail', chapter: 2, offset: 18 });
});
