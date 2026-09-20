import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { db, type DocumentRecord } from '../db/database';
import { NotesPanel } from './NotesPanel';
const doc: DocumentRecord = { id: 'notes-ui', title: 'Book', kind: 'text', content: 'First. Selected sentence.', createdAt: 1, updatedAt: 1, location: { kind: 'text', scrollY: 0, progress: 0, updatedAt: 1 } };
const location = { ...doc.location, absoluteOffset: 7, progress: .3 };
afterEach(async () => { await db.notes.clear(); });
it('saves a document note at the captured location and jumps back', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const jump = vi.fn(); const close = vi.fn();
  try {
    await act(async () => render(<NotesPanel document={doc} selection={null} location={location} onClose={close} onJump={jump} />, host));
    const input = host.querySelector('textarea')!;
    act(() => { input.value = 'Remember this'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { host.querySelector<HTMLButtonElement>('.primary-button')!.click(); });
    await vi.waitFor(async () => expect(await db.notes.count()).toBe(1));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    const note = (await db.notes.toArray())[0];
    expect(note.structuredLocation).toEqual(location); expect(note.selectedText).toBeUndefined();
    act(() => Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Go to location')!.click());
    await vi.waitFor(() => expect(jump).toHaveBeenCalledWith(location));
    expect(close).toHaveBeenCalled();
  } finally { act(() => render(null, host)); host.remove(); }
});
it('allows legacy note edits and deletion while disabling jump', async () => {
  await db.notes.put({ id: 'old-note', documentId: doc.id, documentTitle: doc.title, text: 'Old note', location: '20%', createdAt: 1, updatedAt: 1 });
  const host = document.createElement('div'); document.body.append(host);
  try {
    await act(async () => render(<NotesPanel document={doc} selection={null} location={location} onClose={vi.fn()} onJump={vi.fn()} />, host));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Go to location')?.disabled).toBe(true);
    act(() => Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Edit')!.click());
    const input = host.querySelector('textarea')!;
    act(() => { input.value = 'Edited'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => host.querySelector<HTMLButtonElement>('.primary-button')!.click());
    await vi.waitFor(async () => expect((await db.notes.get('old-note'))?.text).toBe('Edited'));
    expect((await db.notes.get('old-note'))?.structuredLocation).toBeUndefined();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await act(async () => Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Delete')!.click());
    await vi.waitFor(async () => expect(await db.notes.get('old-note')).toBeUndefined());
  } finally { act(() => render(null, host)); host.remove(); }
});
