import { useEffect, useState } from 'preact/hooks';
import type { DocumentRecord, NoteRecord } from '../db/database';
import type { ReaderSelection } from '../reader/TextReader';
import { useDialog } from '../components/useDialog';
import { deleteNote, listNotes, saveNote } from './store';

export function NotesPanel({ document, selection, onClose }: { document: DocumentRecord; selection: ReaderSelection | null; onClose: () => void }) {
  const dialogRef = useDialog(onClose);
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [editing, setEditing] = useState<NoteRecord | null>(null);
  const [text, setText] = useState('');
  const refresh = () => void listNotes(document.id).then(setNotes);
  useEffect(refresh, [document.id]);
  const beginNew = () => { setEditing(null); setText(''); };
  const submit = async () => {
    if (!text.trim()) return;
    await saveNote({ id: editing?.id, documentId: document.id, documentTitle: document.title, text,
      selectedText: editing?.selectedText ?? selection?.text, sentence: editing?.sentence ?? selection?.context.current,
      location: editing?.location ?? `${Math.round(document.location.progress * 100)}%` });
    beginNew(); refresh();
  };
  return <div class="modal-layer">
    <button class="modal-backdrop" aria-label="Close notes" onClick={onClose} />
    <section ref={dialogRef} tabIndex={-1} class="settings-modal notes-panel" role="dialog" aria-modal="true" aria-labelledby="notes-title">
      <header><div><p class="eyebrow">Offline notes</p><h2 id="notes-title">Notes for {document.title}</h2></div><button class="icon-button close-button" onClick={onClose} aria-label="Close notes">×</button></header>
      {selection && !editing && <div class="note-selection"><strong>Selected text</strong><q>{selection.text}</q><small>{selection.context.current}</small></div>}
      <label class="note-editor">{editing ? 'Edit note' : 'New note'}<textarea value={text} maxLength={5000} onInput={event => setText(event.currentTarget.value)} placeholder="Write a private note kept on this device…" /></label>
      <div class="note-actions"><button class="primary-button" disabled={!text.trim()} onClick={() => void submit()}>{editing ? 'Update note' : 'Save note'}</button>{editing && <button class="secondary-button" onClick={beginNew}>Cancel</button>}</div>
      <div class="notes-list">{notes.length === 0 ? <p class="privacy-note">No notes for this document yet.</p> : notes.map(note => <article key={note.id}><p>{note.text}</p>{note.selectedText && <q>{note.selectedText}</q>}<small>{note.location} · {new Date(note.updatedAt).toLocaleString()}</small><div><button class="text-button" onClick={() => { setEditing(note); setText(note.text); }}>Edit</button><button class="text-button" onClick={() => { if (confirm('Delete this note?')) void deleteNote(note.id).then(refresh); }}>Delete</button></div></article>)}</div>
      <p class="privacy-note">Notes stay in IndexedDB and are included in local backups. They are never sent to translation or context providers.</p>
    </section>
  </div>;
}
