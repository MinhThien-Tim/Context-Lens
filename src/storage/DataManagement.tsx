import { useEffect, useState } from 'preact/hooks';
import { buildBackup, restoreBackup } from './backup';
import { clearLookupCache, requestPersistentStorage, storageSnapshot, type StorageSnapshot } from './storageService';
import { db, type DictionaryPackRecord } from '../db/database';
import { installDictionaryPack, removeDictionaryPack } from '../lookup/dictionary/packs';
import { useDialog } from '../components/useDialog';
import attributionUrl from '../../release/dictionary/ATTRIBUTION.md?url';

export function DataManagement({ onClose, onRestored }: { onClose: () => void; onRestored: () => void }) {
  const dialogRef = useDialog(onClose);
  const [snapshot, setSnapshot] = useState<StorageSnapshot | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [packs, setPacks] = useState<DictionaryPackRecord[]>([]);
  const refresh = () => { void storageSnapshot().then(setSnapshot); void db.dictionaryPacks.toArray().then(setPacks); };
  useEffect(refresh, []);
  return <div class="modal-layer">
    <button class="modal-backdrop" aria-label="Close data management" onClick={onClose} />
    <section ref={dialogRef} tabIndex={-1} class="settings-modal data-modal" role="dialog" aria-modal="true" aria-labelledby="data-title">
      <header><div><p class="eyebrow">On this device</p><h2 id="data-title">Data & storage</h2></div><button class="icon-button close-button" onClick={onClose} aria-label="Close data management">×</button></header>
      {snapshot && <div class="storage-summary">
        <div><strong>{snapshot.documents}</strong><span>Documents</span></div><div><strong>{snapshot.vocabulary}</strong><span>Saved words</span></div><div><strong>{snapshot.notes}</strong><span>Notes</span></div><div><strong>{snapshot.cachedLookups}</strong><span>Language cache</span></div>
      </div>}
      {snapshot?.usage !== null && <p class="storage-usage">Using {formatBytes(snapshot?.usage ?? 0)}{snapshot?.quota ? ` of ${formatBytes(snapshot.quota)}` : ''}.</p>}
      {snapshot?.usage && snapshot.quota && snapshot.usage / snapshot.quota >= 0.8 && <p class="storage-warning" role="status">Storage is almost full. Clear AI cache or remove documents you no longer need.</p>}
      <div class="data-actions">
        <button class="secondary-button" onClick={async () => { const granted = await requestPersistentStorage(); setMessage(granted ? 'Persistent storage enabled.' : 'The browser did not grant persistent storage.'); refresh(); }}>Protect offline data</button>
        <button class="secondary-button" onClick={async () => { await clearLookupCache(); setMessage('AI lookup cache cleared.'); refresh(); }}>Clear AI cache</button>
        <button class="secondary-button" onClick={async () => downloadBackup(await buildBackup())}>Export backup</button>
        <label class="secondary-button">Import backup<input class="visually-hidden" type="file" accept="application/json,.json" onChange={async (event) => {
          const file = event.currentTarget.files?.[0]; if (!file) return;
          try { const result = await restoreBackup(JSON.parse(await file.text())); setMessage(`Restored ${result.documents} documents, ${result.vocabulary} saved words, and ${result.notes} notes.`); onRestored(); refresh(); }
          catch { setMessage('This is not a valid Context Lens backup.'); }
        }} /></label>
        <label class="secondary-button">Install dictionary pack<input class="visually-hidden" type="file" accept="application/json,.json" onChange={async (event) => {
          const file = event.currentTarget.files?.[0]; if (!file) return;
          if (file.size > 25 * 1024 * 1024) { setMessage('Dictionary packs are limited to 25 MB.'); return; }
          try { const pack = await installDictionaryPack(JSON.parse(await file.text())); setMessage(`Installed ${pack.name} ${pack.version}.`); refresh(); }
          catch { setMessage('Invalid dictionary pack or missing license metadata.'); }
        }} /></label>
      </div>
      <p class="privacy-note">Included English–Vietnamese dictionary: 104,738 entries, CC BY-SA 4.0. Vietnamese meanings are available offline after the app finishes downloading. <a href={attributionUrl} target="_blank" rel="noreferrer">Source, license and attribution</a></p>
      {packs.length > 0 && <section class="pack-list"><h3>Dictionary packs</h3>{packs.map((pack) => <div><span><strong>{pack.name}</strong><small>{pack.entries.length.toLocaleString()} entries · {pack.license.name}</small><a href={pack.license.url} target="_blank" rel="noreferrer noopener">License and attribution ↗</a></span><button class="icon-button" aria-label={`Remove ${pack.name}`} onClick={() => { if (confirm(`Remove dictionary pack “${pack.name}”?`)) void removeDictionaryPack(pack.id).then(refresh); }}>×</button></div>)}</section>}
      <p class="privacy-note">Backups contain extracted document text, vocabulary, and private notes. API keys, engine settings, cached responses, and original PDF/EPUB binary files are excluded.</p>
      {message && <p class="data-message" role="status">{message}</p>}
    </section>
  </div>;
}

function downloadBackup(backup: Awaited<ReturnType<typeof buildBackup>>): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `context-lens-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}
