import { afterEach, describe, expect, it } from 'vitest';
import { db, defaultPreferences, loadPreferences, savePreferences, ContextLensDatabase } from './database';

describe('document storage', () => {
  const database = new ContextLensDatabase(`test-${crypto.randomUUID()}`);
  afterEach(async () => { await database.documents.clear(); await database.pdfOcr.clear(); });
  it('persists text and reading position', async () => {
    await database.documents.put({ id: 'doc-1', title: 'Test', content: 'English text', kind: 'text', createdAt: 1, updatedAt: 1, location: { kind: 'text', scrollY: 0, progress: 0, updatedAt: 1 } });
    await database.documents.update('doc-1', { location: { kind: 'text', scrollY: 420, progress: 0.5, updatedAt: 2 } });
    expect((await database.documents.get('doc-1'))?.location).toEqual(expect.objectContaining({ scrollY: 420, progress: 0.5 }));
  });
  it('keeps OCR text separate from the original PDF record', async () => {
    const original = { id: 'scan', title: 'Scan', content: '', kind: 'pdf' as const, createdAt: 1, updatedAt: 1, pageOffsets: [0], location: { kind: 'pdf' as const, page: 1, scrollY: 0, progress: 0, updatedAt: 1 } };
    await database.documents.put(original);
    await database.pdfOcr.put({ key: 'scan:1:eng:1', documentId: 'scan', page: 1, language: 'eng', configVersion: 1, text: 'Recognized words', createdAt: 2 });
    expect((await database.documents.get('scan'))?.content).toBe('');
    expect((await database.pdfOcr.where('[documentId+page]').equals(['scan', 1]).first())?.text).toBe('Recognized words');
  });
});

describe('reader interface preferences', () => {
  it('persists pinned placement while preserving other preferences', async () => {
    const preferences = { ...defaultPreferences, lookupPopupPlacement: { mode: 'pinned' as const, xRatio: 0.8, yRatio: 0.3 } };
    await savePreferences(preferences);
    expect(await loadPreferences()).toEqual(preferences);
  });
  it.each([undefined, { mode: 'pinned', xRatio: -1, yRatio: 0 }, { mode: 'unknown' }])('defaults invalid placement to Auto (%j)', async lookupPopupPlacement => {
    await db.settings.put({ key: 'reader-preferences', value: { ...defaultPreferences, lookupPopupPlacement } });
    expect((await loadPreferences()).lookupPopupPlacement).toEqual({ mode: 'auto' });
  });
  afterEach(async () => { await db.settings.clear(); });
  it('remembers lookup view and language across preference reloads', async () => {
    await savePreferences({ ...defaultPreferences, lookupViewMode: 'full', languageMode: 'vi' });
    expect(await loadPreferences()).toMatchObject({ lookupViewMode: 'full', languageMode: 'vi' });
    await savePreferences({ ...defaultPreferences, lookupViewMode: 'quick', languageMode: 'bilingual' });
    expect(await loadPreferences()).toMatchObject({ lookupViewMode: 'quick', languageMode: 'bilingual' });
  });
  it.each([undefined, 'invalid'])('defaults missing or invalid lookup view to Quick (%s)', async lookupViewMode => {
    await db.settings.put({ key: 'reader-preferences', value: { ...defaultPreferences, lookupViewMode } });
    expect((await loadPreferences()).lookupViewMode).toBe('quick');
  });
  it('defaults to Simple and System without legacy settings', async () => {
    await db.settings.clear();
    expect(await loadPreferences()).toEqual(defaultPreferences);
  });
  it.each([['calm', 'simple'], ['bright', 'advanced']])('migrates %s without changing appearance', async (legacy, mode) => {
    await db.settings.put({ key: 'homepage.theme', value: legacy });
    const { interfaceMode: _, ...oldPreferences } = defaultPreferences;
    await db.settings.put({ key: 'reader-preferences', value: { ...oldPreferences, theme: 'dark', fontSize: 23 } });
    expect(await loadPreferences()).toMatchObject({ interfaceMode: mode, theme: 'dark', fontSize: 23 });
    expect(await db.settings.get('homepage.theme')).toBeUndefined();
    expect((await db.settings.get('reader-preferences'))?.value).toMatchObject({ interfaceMode: mode });
  });
  it('preserves explicit density over legacy and persists appearance independently', async () => {
    await db.settings.put({ key: 'homepage.theme', value: 'bright' });
    await savePreferences({ ...defaultPreferences, interfaceMode: 'simple', theme: 'light' });
    expect(await loadPreferences()).toMatchObject({ interfaceMode: 'simple', theme: 'light' });
    await savePreferences({ ...defaultPreferences, interfaceMode: 'advanced', theme: 'system' });
    expect(await loadPreferences()).toMatchObject({ interfaceMode: 'advanced', theme: 'system' });
  });
  it('normalizes legacy density and invalid appearance in reader preferences', async () => {
    await db.settings.put({ key: 'reader-preferences', value: { interfaceMode: 'bright', theme: 'unknown' } });
    expect(await loadPreferences()).toMatchObject({ interfaceMode: 'advanced', theme: 'system' });
  });
});

it('persists Simple Quick independently of language and default view', async () => {
  expect(defaultPreferences.lookupQuickMode).toBe('standard');
  await savePreferences({ ...defaultPreferences, lookupQuickMode: 'simple', languageMode: 'vi', lookupViewMode: 'full' });
  expect(await loadPreferences()).toMatchObject({ lookupQuickMode: 'simple', languageMode: 'vi', lookupViewMode: 'full' });
});
it.each([undefined, 'invalid'])('normalizes invalid Quick presentation (%s)', async lookupQuickMode => {
  await db.settings.put({ key: 'reader-preferences', value: { ...defaultPreferences, lookupQuickMode } });
  expect((await loadPreferences()).lookupQuickMode).toBe('standard');
});
