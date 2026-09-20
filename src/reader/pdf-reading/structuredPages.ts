import type { DocumentRecord } from '../../db/database';
import type { PdfStructuredPage } from '../../documents/pdf/types';

export function readingPagesForDocument(documentRecord: DocumentRecord): PdfStructuredPage[] {
  if (documentRecord.pdfPages?.length) return documentRecord.pdfPages;
  const offsets = documentRecord.pageOffsets ?? [0];
  return offsets.map((startOffset, index) => {
    const endOffset = index + 1 < offsets.length ? Math.max(startOffset, offsets[index + 1] - 2) : documentRecord.content.length;
    const plainText = documentRecord.content.slice(startOffset, endOffset).trim();
    return { pageNumber: index + 1, startOffset, endOffset: startOffset + plainText.length, plainText, extractionQuality: plainText ? 'partial' : 'poor', blocks: plainText ? [{ id: `legacy-pdf-${index + 1}`, type: 'paragraph', text: plainText, startOffset, endOffset: startOffset + plainText.length }] : [] };
  });
}

export function pdfHasReadableText(documentRecord: DocumentRecord): boolean {
  return readingPagesForDocument(documentRecord).some(page => page.extractionQuality !== 'poor' && page.plainText.trim().length >= 20);
}
