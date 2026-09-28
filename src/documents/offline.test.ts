import { describe, expect, it } from 'vitest';
import { isAvailableOffline } from './offline';

describe('offline document readiness', () => {
  it('requires the stored file bytes for a PDF', () => {
    expect(isAvailableOffline({ kind: 'pdf', content: 'Extracted page text', data: new Blob(['pdf']) })).toBe(true);
    expect(isAvailableOffline({ kind: 'pdf', content: 'Extracted page text', data: undefined })).toBe(false);
  });

  it('treats extracted content as local for every non-PDF reader surface', () => {
    for (const kind of ['text', 'markdown', 'article', 'epub', 'docx'] as const) {
      expect(isAvailableOffline({ kind, content: 'Readable text', data: undefined })).toBe(true);
      expect(isAvailableOffline({ kind, content: '   ', data: undefined })).toBe(false);
    }
  });

  it('keeps a record with only file bytes readable', () => {
    expect(isAvailableOffline({ kind: 'epub', content: '', data: new Blob(['epub']) })).toBe(true);
  });
});
