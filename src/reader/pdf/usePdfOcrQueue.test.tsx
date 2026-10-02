import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import type { DocumentRecord, PdfOcrRecord } from '../../db/database';
import { usePdfOcrQueue } from './usePdfOcrQueue';

const mocks = vi.hoisted(() => ({ recognize: vi.fn(), save: vi.fn(), ink: vi.fn(), terminate: vi.fn(), clear: vi.fn(), getPage: vi.fn(), destroy: vi.fn() }));
vi.mock('../../documents/pdf/ocrWorker', () => ({ recognizePdfPage: mocks.recognize, terminateOcrWorker: mocks.terminate }));
vi.mock('../../documents/pdf/ocrStore', () => ({ saveOcrPage: mocks.save, clearOcrPages: mocks.clear }));
vi.mock('../../documents/pdf/ocrEligibility', () => ({ ocrCandidate: () => true, pageHasInk: mocks.ink }));
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve({ getPage: mocks.getPage }), destroy: mocks.destroy }) }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function doc(id = 'a', count = 14): DocumentRecord {
  return { id, kind: 'pdf', title: id, content: '', createdAt: 1, updatedAt: 1, pdfHash: id,
    data: { arrayBuffer: async () => new ArrayBuffer(0) } as Blob,
    pageOffsets: Array(count).fill(0), location: { kind: 'pdf', page: 1, scrollY: 0, progress: 0, updatedAt: 1 },
  };
}
let host: HTMLDivElement;
let queue: ReturnType<typeof usePdfOcrQueue>;
function Harness({ document, onResult }: { document: DocumentRecord; onResult: (record: PdfOcrRecord) => void }) {
  queue = usePdfOcrQueue(document, 'eng', [], onResult, vi.fn());
  return <div>{queue.status?.state}</div>;
}
async function setup(record = doc(), onResult = vi.fn()) {
  mocks.recognize.mockResolvedValue('Recognized text');
  mocks.save.mockImplementation(async (documentId: string, page: number) => ({ documentId, page }));
  mocks.ink.mockResolvedValue(true);
  mocks.getPage.mockImplementation(async (pageNumber: number) => ({ cleanup: vi.fn(), pageNumber }));
  mocks.destroy.mockResolvedValue(undefined); mocks.terminate.mockResolvedValue(undefined);
  host = document.createElement('div'); document.body.append(host);
  await act(() => render(<Harness document={record} onResult={onResult} />, host));
  return onResult;
}
afterEach(async () => { if (host) await act(() => render(null, host)); document.body.replaceChildren(); vi.resetAllMocks(); });

it('does not publish a saved result after switching documents', async () => {
  const result = await setup();
  const saving = deferred<PdfOcrRecord>(); const entered = deferred<void>();
  mocks.save.mockImplementation(() => { entered.resolve(); return saving.promise; });
  const run = queue.startCurrent(1);
  await entered.promise;
  await act(() => render(<Harness document={doc('b')} onResult={result} />, host));
  await act(async () => { saving.resolve({ documentId: 'a', page: 1 } as PdfOcrRecord); await run; });
  expect(result).not.toHaveBeenCalled();
  expect(queue.status).toBeNull();
});

it('preload examines only the first twelve pages and recognizes at most six', async () => {
  await setup();
  await act(() => queue.preloadFirstTwelve());
  expect(mocks.recognize.mock.calls.map(call => call[1])).toEqual([1, 2, 3, 4, 5, 6]);
  expect(mocks.getPage.mock.calls.every(call => call[0] <= 12)).toBe(true);
});

it('does not publish done after cancellation during ink preflight', async () => {
  await setup();
  const ink = deferred<boolean>(); const entered = deferred<void>();
  mocks.ink.mockImplementation(() => { entered.resolve(); return ink.promise; });
  const run = queue.startNextUnprocessed(); await entered.promise;
  await act(() => queue.cancel());
  await act(async () => { ink.resolve(false); await run; });
  expect(queue.status).toBeNull(); expect(mocks.recognize).not.toHaveBeenCalled();
});

it('does not let cancelled cleanup terminate a newer OCR run', async () => {
  await setup();
  const oldText = deferred<string>(); const newText = deferred<string>();
  const oldEntered = deferred<void>(); const newEntered = deferred<void>();
  mocks.recognize.mockImplementationOnce(() => { oldEntered.resolve(); return oldText.promise; })
    .mockImplementationOnce(() => { newEntered.resolve(); return newText.promise; });
  const oldRun = queue.startCurrent(1); await oldEntered.promise;
  await act(() => queue.cancel());
  const newRun = queue.startCurrent(2); await newEntered.promise;
  await act(async () => { oldText.resolve('Old result'); await oldRun; });
  const terminations = mocks.terminate.mock.calls.length;
  await act(async () => { newText.resolve('New result'); await newRun; });
  expect(terminations).toBe(1);
  // The superseded run's page 1 result is never saved; the newer run continues from page 2 to the end.
  expect(mocks.save.mock.calls.map(call => call[1])).toEqual(Array.from({ length: 13 }, (_, index) => index + 2));
});

it('never preloads scans after the first twelve text pages', async () => {
  const record = doc();
  record.pdfPages = Array.from({ length: 14 }, (_, i) => ({ pageNumber: i + 1, plainText: i < 12 ? 'Readable PDF text' : '', startOffset: 0, endOffset: 0, blocks: [], extractionQuality: i < 12 ? 'good' : 'poor' }));
  await setup(record);
  await act(() => queue.preloadFirstTwelve());
  expect(mocks.recognize).not.toHaveBeenCalled();
  expect(mocks.getPage).not.toHaveBeenCalled();
});

it('selects nonempty corrupt text for OCR next only when the page has ink', async () => {
  const record = doc('corrupt', 2);
  record.pdfPages = [
    { pageNumber: 1, plainText: 'corrupt text'.repeat(20), startOffset: 0, endOffset: 240, blocks: [], extractionQuality: 'good', textIntegrity: 'corrupt', hasImage: false },
    { pageNumber: 2, plainText: 'more corrupt text', startOffset: 240, endOffset: 257, blocks: [], extractionQuality: 'good', textIntegrity: 'corrupt', hasImage: false },
  ];
  await setup(record);
  mocks.ink.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await act(() => queue.startNextUnprocessed());
  expect(mocks.getPage.mock.calls.map(call => call[0])).toEqual([1, 2]);
  expect(mocks.recognize.mock.calls.map(call => call[1])).toEqual([2]);
});

it('does not recognize a visually blank current page', async () => {
  await setup();
  mocks.ink.mockResolvedValue(false);
  await act(() => queue.startCurrent(1));
  expect(mocks.getPage).toHaveBeenCalledWith(1);
  expect(mocks.recognize).not.toHaveBeenCalled();
});

it('does not preload a corrupt page that already has extracted text', async () => {
  const record = doc('corrupt', 1);
  record.pdfPages = [{ pageNumber: 1, plainText: 'corrupt text', startOffset: 0, endOffset: 12, blocks: [], extractionQuality: 'good', textIntegrity: 'corrupt' }];
  await setup(record);
  await act(() => queue.preloadFirstTwelve());
  expect(mocks.getPage).not.toHaveBeenCalled();
  expect(mocks.recognize).not.toHaveBeenCalled();
});

it('continues the queue when a page returns empty OCR text', async () => {
  await setup(doc('a', 3));
  mocks.recognize.mockResolvedValueOnce('').mockResolvedValue('Recognized text');
  await act(() => queue.startNextUnprocessed());
  expect(mocks.recognize.mock.calls.map(call => call[1])).toEqual([1, 2, 3]);
  expect(mocks.save.mock.calls.map(call => call[1])).toEqual([2, 3]);
  expect(queue.status).toBeNull();
});

it('continues automatically through every 12-page window until the end of the document', async () => {
  await setup(doc('a', 30));
  await act(() => queue.startNextUnprocessed());
  expect(mocks.recognize.mock.calls.map(call => call[1])).toEqual(Array.from({ length: 30 }, (_, index) => index + 1));
});

it('starts at the selected page and continues forward without revisiting earlier pages', async () => {
  await setup(doc('a', 30));
  await act(() => queue.startCurrent(5));
  expect(mocks.recognize.mock.calls.map(call => call[1])).toEqual(Array.from({ length: 26 }, (_, index) => index + 5));
});

it('continues from the next page when the selected page is not eligible', async () => {
  await setup(doc('a', 14));
  mocks.ink.mockImplementation(async (page: { pageNumber: number }) => page.pageNumber !== 3);
  await act(() => queue.startCurrent(3));
  expect(mocks.recognize.mock.calls.map(call => call[1])).toEqual(Array.from({ length: 11 }, (_, index) => index + 4));
});

it('keeps the automatic queue running when a page has no ink', async () => {
  await setup(doc('a', 14));
  mocks.ink.mockImplementation(async (page: { pageNumber: number }) => page.pageNumber !== 2);
  await act(() => queue.startNextUnprocessed());
  expect(mocks.recognize.mock.calls.map(call => call[1])).toEqual([1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  expect(queue.status).toBeNull();
});

it('finishes a short final batch without looping past the last page', async () => {
  await setup(doc('a', 20));
  await act(() => queue.startNextUnprocessed());
  expect(mocks.recognize.mock.calls.map(call => call[1])).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
  expect(mocks.getPage.mock.calls.every(call => call[0] <= 20)).toBe(true);
  expect(queue.status).toBeNull();
});
