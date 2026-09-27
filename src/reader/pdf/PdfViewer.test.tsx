import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import type { DocumentRecord } from '../../db/database';
import type { PdfDocumentLocation } from '../../documents/location';
import { PdfViewer } from './PdfViewer';

const { pdf } = vi.hoisted(() => ({ pdf: {
  numPages: 4,
  getPage: async () => ({ getViewport: () => ({ width: 612, height: 792 }), cleanup() {} }),
} }));
vi.mock('./usePdfDocument', () => ({ usePdfDocument: () => ({ pdf }) }));
vi.mock('./usePdfScroll', () => ({ usePdfScroll: () => vi.fn() }));
vi.mock('./PdfPage', () => ({ PdfPage: ({ pageNumber }: { pageNumber: number }) => <canvas class="pdf-canvas" data-page={pageNumber} /> }));
const host = document.createElement('div');
afterEach(() => { act(() => render(null, host)); host.remove(); vi.unstubAllGlobals(); });

it('keeps the preceding visible page rendered within the three-canvas and OCR budgets', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  document.body.append(host);
  const location: PdfDocumentLocation = { kind: 'pdf', page: 2, viewMode: 'original', scrollY: 350, progress: .1, updatedAt: 0 };
  const documentRecord = { id: 'pdf', kind: 'pdf', content: 'one two three four', pageOffsets: [0, 4, 8, 14], location } as DocumentRecord;
  const props = { documentRecord, location, zoomMode: 'fit-width' as const, onZoomMode: vi.fn(), onLocation: vi.fn(), onLookup: vi.fn() };
  await act(async () => render(<PdfViewer {...props} />, host));
  await vi.waitFor(async () => { await act(async () => {}); expect(host.querySelector('.pdf-scroll')).not.toBeNull(); });
  const rendered = () => Array.from(host.querySelectorAll<HTMLCanvasElement>('.pdf-canvas')).map(el => Number(el.dataset.page));
  expect(rendered()).toEqual([1, 2, 3]);
  await act(() => render(<PdfViewer {...props} ocrBusy />, host));
  expect(rendered()).toEqual([2]);
});
