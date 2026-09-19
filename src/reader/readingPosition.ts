import { db, type DocumentRecord } from '../db/database';
import { getRestoreScrollY, getScrollProgress, type DocumentLocation, type TextDocumentLocation } from '../documents/location';

export function captureDocumentLocation(documentRecord: DocumentRecord): DocumentLocation {
  const base = {
    scrollY: window.scrollY,
    progress: getScrollProgress(window.scrollY, document.documentElement.scrollHeight, window.innerHeight),
    updatedAt: Date.now()
  };
  if (documentRecord.kind === 'pdf') return { kind: 'pdf', page: indexAtProgress(documentRecord.pageOffsets, documentRecord.content.length, base.progress) + 1, ...base };
  if (documentRecord.kind === 'epub') return { kind: 'epub', chapter: indexAtProgress(documentRecord.chapterOffsets, documentRecord.content.length, base.progress) + 1, cfi: null, ...base };
  return { kind: 'text', ...base };
}

export async function saveDocumentLocation(documentRecord: DocumentRecord): Promise<DocumentLocation> {
  const location = captureDocumentLocation(documentRecord);
  await db.documents.update(documentRecord.id, { location, updatedAt: Date.now() });
  return location;
}

export function restoreTextLocation(documentRecord: DocumentRecord): void {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const y = getRestoreScrollY(documentRecord.location as TextDocumentLocation, document.documentElement.scrollHeight, window.innerHeight);
    window.scrollTo({ top: y, behavior: 'auto' });
  }));
}

function indexAtProgress(offsets: number[] | undefined, contentLength: number, progress: number): number {
  if (!offsets?.length || contentLength <= 0) return 0;
  const contentOffset = progress * contentLength;
  const next = offsets.findIndex((offset) => offset > contentOffset);
  return next === -1 ? offsets.length - 1 : Math.max(0, next - 1);
}
