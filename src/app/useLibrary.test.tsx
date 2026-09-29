import { act } from 'preact/test-utils';
import { render } from 'preact';
import { afterEach, expect, it, vi } from 'vitest';
import { db, type DocumentRecord } from '../db/database';
import { useLibrary } from './useLibrary';

let library: ReturnType<typeof useLibrary>;
function Probe() { library = useLibrary(); return null; }
const host = document.createElement('div');

const documentRow = (index: number, kind: DocumentRecord['kind'] = 'text'): DocumentRecord => ({
  id: `doc-${index}`, title: `Book ${index}`, kind, content: 'Text', highlights: [],
  createdAt: index, updatedAt: index,
  location: { kind: 'text', scrollY: 0, progress: 0, updatedAt: index }
});

afterEach(async () => {
  act(() => render(null, host));
  await db.documents.clear();
});

it('loads the first page, applies debounced filters, appends more, and refreshes the current view', async () => {
  await db.documents.bulkPut(Array.from({ length: 20 }, (_, i) => documentRow(i)));
  act(() => render(<Probe />, host));
  expect(library.loading).toBe(true);
  expect(library.documents).toHaveLength(0);
  await vi.waitFor(() => expect(library.documents).toHaveLength(18));
  expect(library.hasMore).toBe(true);
  await act(async () => { await library.loadMore(); });
  expect(library.documents).toHaveLength(20);
  expect(library.hasMore).toBe(false);

  act(() => library.setQuery('Book 1'));
  expect(library.loading).toBe(true);
  await vi.waitFor(() => expect(library.documents).toHaveLength(11));
  expect(library.documents.every(item => item.title.startsWith('Book 1'))).toBe(true);

  await db.documents.put(documentRow(21, 'pdf'));
  act(() => library.setKind('pdf'));
  await vi.waitFor(() => expect(library.documents).toHaveLength(0));
  act(() => library.setQuery('Book 21'));
  await vi.waitFor(() => expect(library.documents.map(item => item.id)).toEqual(['doc-21']));
  await db.documents.put({ ...documentRow(22, 'pdf'), title: 'Book 21 extra' });
  await act(async () => { await library.refresh(); });
  expect(library.documents.map(item => item.id)).toEqual(['doc-22', 'doc-21']);
  expect(library.hasMore).toBe(false);
});
