import { render } from 'preact';
import { expect, it, vi } from 'vitest';
import { importLocalFile } from './fileImport';
import { PdfReadingPage } from '../../reader/pdf-reading/PdfReadingPage';

const fixture = vi.hoisted(() => ({ linked: false }));

vi.mock('pdfjs-dist', () => {
  const item = (str: string, x: number, y: number) => ({
    str, width: str.length * 6, height: 12, transform: [12, 0, 0, 12, x, y]
  });
  const contents = [
    item('Contents', 60, 740),
    item('First Chapter', 60, 680), item('101', 490, 680),
    item('Second Chapter', 60, 640), item('202', 490, 640),
    item('Third Chapter', 60, 600), item('303', 490, 600)
  ];
  return {
    GlobalWorkerOptions: {},
    OPS: { paintImageXObject: 1, paintInlineImageXObject: 2, paintImageMaskXObject: 3 },
    getDocument: () => ({ destroy: vi.fn(), promise: Promise.resolve({
      numPages: 4,
      getMetadata: async () => null,
      getOutline: async () => [],
      getPageLabels: async () => null,
      getDestination: async () => [2],
      getPage: async (number: number) => ({
        getViewport: () => ({ width: 600, height: 800 }),
        getTextContent: async () => ({ items: number === 1 ? contents : [item(`Body page ${number}`, 60, 740)] }),
        getOperatorList: async () => ({ fnArray: [] }),
        getAnnotations: async () => fixture.linked && number === 1
          ? [{ rect: [50, 675, 240, 685], dest: 'first' }] : [],
        cleanup: vi.fn()
      })
    }) })
  };
});

const pdfFile = () => ({ name: 'excerpt.pdf', size: 1, arrayBuffer: async () => new ArrayBuffer(1) }) as File;

it('keeps imported printed rows visible without accepting fewer than two navigation targets', async () => {
  try {
    for (const linked of [false, true]) {
      fixture.linked = linked;
      const imported = await importLocalFile(pdfFile());
      const page = imported.pdfPages![0];
      const entries = page.blocks.filter(block => block.type === 'toc-entry');
      expect(entries.map(block => [block.title, block.printedPageLabel, block.resolvedPage])).toEqual([
        ['First Chapter', '101', linked ? 3 : undefined],
        ['Second Chapter', '202', undefined],
        ['Third Chapter', '303', undefined]
      ]);
      expect(imported.tocSource).not.toBe('pdf-printed');
      expect(imported.toc).toEqual([]);
      expect(imported.pageOffsets).toEqual([0, page.plainText.length + 2, page.plainText.length + 15, page.plainText.length + 28]);
      expect(imported.content!.slice(page.startOffset, page.endOffset)).toBe(page.plainText);
      for (const entry of entries) expect(imported.content!.slice(entry.startOffset, entry.endOffset)).toBe(entry.text);

      const host = document.createElement('div');
      render(<PdfReadingPage page={page} />, host);
      const rendered = host.querySelectorAll('.pdf-reading-toc-entry');
      expect(rendered).toHaveLength(3);
      expect(rendered[1].textContent).toBe('Second Chapter 202');
      expect(rendered[1].getAttribute('data-printed-page-label')).toBe('202');
      expect(rendered[1].getAttribute('data-offset')).toBe(String(entries[1].startOffset));
      expect(rendered[1].querySelector('a, button, [role="link"]')).toBeNull();
      render(null, host);
    }
  } finally {
    fixture.linked = false;
  }
});
