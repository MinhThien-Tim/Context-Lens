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
  mocks.getPage.mockResolvedValue({ cleanup: vi.fn() });
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
  expect(mocks.save.mock.calls.map(call => call[1])).toEqual([2]);
});

it('never preloads scans after the first twelve text pages', async () => {
  const record = doc();
  record.pdfPages = Array.from({ length: 14 }, (_, i) => ({ pageNumber: i + 1, plainText: i < 12 ? 'Readable PDF text' : '', startOffset: 0, endOffset: 0, blocks: [], extractionQuality: i < 12 ? 'good' : 'poor' }));
  await setup(record);
  await act(() => queue.preloadFirstTwelve());
  expect(mocks.recognize).not.toHaveBeenCalled();
  expect(mocks.getPage).not.toHaveBeenCalled();
});
