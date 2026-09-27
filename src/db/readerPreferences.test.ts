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
it('persists reading margin and typography together', async () => {
  await savePreferences({ ...defaultPreferences, fontSize: 22, lineHeight: 1.9, fontFamily: 'sans', readingMargin: 'wide', theme: 'dark' });
  expect(await loadPreferences()).toMatchObject({ fontSize: 22, lineHeight: 1.9, fontFamily: 'sans', readingMargin: 'wide', theme: 'dark' });
});
it('normalizes invalid typography and margin without changing the document model', async () => {
  await db.settings.put({ key: 'reader-preferences', value: { fontSize: 99, lineHeight: 0.2, fontFamily: 'comic', readingMargin: 'huge' } });
  const normalized = await loadPreferences();
  expect(normalized).toMatchObject({ fontSize: 26, lineHeight: 1.4, fontFamily: 'serif', readingMargin: 'comfortable' });
  expect((await db.settings.get('reader-preferences'))?.value).toMatchObject({ fontSize: 26, lineHeight: 1.4, fontFamily: 'serif', readingMargin: 'comfortable' });
  expect(await loadPreferences()).toMatchObject({ fontSize: 26, lineHeight: 1.4, fontFamily: 'serif', readingMargin: 'comfortable' });
  await db.settings.put({ key: 'reader-preferences', value: { fontSize: -4, lineHeight: 5, readingMargin: 'narrow' } });
  expect(await loadPreferences()).toMatchObject({ fontSize: 16, lineHeight: 2.1, readingMargin: 'narrow' });
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
    expect(current.verno).toBe(15);
  } finally { await current.delete(); }
});
