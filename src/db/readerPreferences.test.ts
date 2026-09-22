import Dexie from 'dexie';
import { afterEach, expect, it } from 'vitest';
import { ContextLensDatabase, db, defaultPreferences, loadPreferences, savePreferences } from './database';
afterEach(async () => db.settings.clear());
it.each(['system', 'light', 'dark'] as const)('persists %s reader preferences without losing typography', async theme => {
  await savePreferences({ ...defaultPreferences, theme, fontSize: 23 });
  expect(await loadPreferences()).toMatchObject({ theme, fontSize: 23, lineHeight: defaultPreferences.lineHeight });
});
it('defaults older preferences to system theme', async () => {
  await db.settings.put({ key: 'reader-preferences', value: { fontSize: 21 } });
  expect(await loadPreferences()).toMatchObject({ theme: 'system', fontSize: 21 });
});
it('upgrades version 9 without replacing legacy notes or documents', async () => {
  const name = `legacy-reader-${crypto.randomUUID()}`;
  const old = new Dexie(name);
  old.version(9).stores({ documents: 'id, kind, updatedAt', notes: 'id, documentId, updatedAt, [documentId+updatedAt]' });
  await old.table('notes').put({ id: 'old', documentId: 'book', text: 'Keep me', location: '10%' });
  await old.table('documents').put({ id: 'book', kind: 'text', content: 'Keep this too', updatedAt: 1 });
  old.close();
  const current = new ContextLensDatabase(name);
  try {
    expect((await current.notes.get('old'))?.text).toBe('Keep me');
    expect((await current.notes.get('old'))?.structuredLocation).toBeUndefined();
    expect((await current.documents.get('book'))?.content).toBe('Keep this too');
    expect(current.verno).toBe(12);
  } finally { await current.delete(); }
});
