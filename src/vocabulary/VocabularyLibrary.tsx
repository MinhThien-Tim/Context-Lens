import { useMemo, useState } from 'preact/hooks';
import type { VocabularyRecord } from '../db/database';
import { buildEnglish101Export, vocabularyCsv } from './export';
import { useDialog } from '../components/useDialog';

export function VocabularyLibrary({ records, onClose, onDelete }: { records: VocabularyRecord[]; onClose: () => void; onDelete: (id: string) => void }) {
  const dialogRef = useDialog(onClose);
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return records;
    return records.filter((record) => [record.lemma, record.surface, record.lexicalUnit, record.originalSentence, ...record.meaningVi].some((value) => value?.toLocaleLowerCase().includes(normalized)));
  }, [records, query]);
  return <div class="modal-layer">
    <button class="modal-backdrop" aria-label="Close saved vocabulary" onClick={onClose} />
    <section ref={dialogRef} tabIndex={-1} class="settings-modal vocabulary-modal" role="dialog" aria-modal="true" aria-labelledby="vocabulary-title">
      <header><div><p class="eyebrow">Learning</p><h2 id="vocabulary-title">Saved in context</h2></div><button class="icon-button close-button" onClick={onClose} aria-label="Close saved vocabulary">×</button></header>
      <div class="vocabulary-toolbar"><input type="search" value={query} onInput={(event) => setQuery(event.currentTarget.value)} placeholder="Search saved words" aria-label="Search saved vocabulary" /><span>{visible.length} saved</span></div>
      <div class="vocabulary-list">
        {visible.length === 0 && <p class="empty-state">No matching vocabulary.</p>}
        {visible.map((record) => <article class="vocabulary-card">
          <div><h3>{record.lemma}</h3><p class="vocabulary-meaning">{record.meaningVi.join(' · ')}</p></div>
          <button class="icon-button" aria-label={`Remove ${record.lemma}`} onClick={() => onDelete(record.id)}>×</button>
          {record.lexicalUnit && <strong>{record.lexicalUnit}</strong>}
          <p>{record.originalSentence}</p>
          <small>{record.source.document} · {record.source.location}</small>
        </article>)}
      </div>
      <p class="export-helper">Use this file in English101 → Personal Flashcards.</p><div class="export-actions"><button class="secondary-button" disabled={!records.length} onClick={() => download('context-lens-vocabulary.csv', vocabularyCsv(records), 'text/csv;charset=utf-8')}>Export CSV</button><button class="primary-button" disabled={!records.length} onClick={() => download('context-lens-english101.json', JSON.stringify(buildEnglish101Export(records), null, 2), 'application/json')}>Export to English101</button></div>
    </section>
  </div>;
}

function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
