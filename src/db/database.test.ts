import { afterEach, describe, expect, it } from 'vitest';
import { ContextLensDatabase } from './database';

describe('document storage', () => {
  const database = new ContextLensDatabase(`test-${crypto.randomUUID()}`);
  afterEach(async () => database.documents.clear());
  it('persists text and reading position', async () => {
    await database.documents.put({ id: 'doc-1', title: 'Test', content: 'English text', kind: 'text', createdAt: 1, updatedAt: 1, location: { kind: 'text', scrollY: 0, progress: 0, updatedAt: 1 } });
    await database.documents.update('doc-1', { location: { kind: 'text', scrollY: 420, progress: 0.5, updatedAt: 2 } });
    expect((await database.documents.get('doc-1'))?.location).toEqual(expect.objectContaining({ scrollY: 420, progress: 0.5 }));
  });
});
