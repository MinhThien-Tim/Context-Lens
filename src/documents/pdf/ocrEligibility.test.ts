import { describe, expect, it } from 'vitest';
import type { DocumentRecord, PdfOcrRecord } from '../../db/database';
import { ocrCandidate } from './ocrEligibility';

const document = {
  id: 'mixed', kind: 'pdf', title: 'Mixed', content: '', createdAt: 1, updatedAt: 1,
  location: { kind: 'pdf', page: 1, scrollY: 0, progress: 0, updatedAt: 1 },
  pdfPages: [
    { pageNumber: 1, startOffset: 0, endOffset: 0, plainText: '', blocks: [], extractionQuality: 'poor', hasImage: false },
    { pageNumber: 2, startOffset: 0, endOffset: 0, plainText: '', blocks: [], extractionQuality: 'poor', hasImage: true },
    { pageNumber: 3, startOffset: 0, endOffset: 45, plainText: 'Readable text', blocks: [], extractionQuality: 'good', hasImage: true },
  ],
} as DocumentRecord;

describe('OCR queue eligibility', () => {
  it('skips blank and readable pages, while accepting a poor scanned page', () => {
    expect(ocrCandidate(document, 1, 'eng', [])).toBe(false);
    expect(ocrCandidate(document, 2, 'eng', [])).toBe(true);
    expect(ocrCandidate(document, 3, 'eng', [])).toBe(false);
  });
  it('reuses only OCR for the same page, language and document hash', () => {
    const cached = [{ page: 2, language: 'eng', documentHash: 'one' }] as PdfOcrRecord[];
    expect(ocrCandidate(document, 2, 'eng', cached, 'one')).toBe(false);
    expect(ocrCandidate(document, 2, 'eng', cached, 'two')).toBe(true);
    expect(ocrCandidate(document, 2, 'eng+vie', cached, 'one')).toBe(true);
  });
});
