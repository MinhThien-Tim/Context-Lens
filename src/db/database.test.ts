import { afterEach, describe, expect, it } from 'vitest';
import { ContextLensDatabase } from './database';

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
