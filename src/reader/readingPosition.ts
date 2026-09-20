import { jumpToOffset, locationAtOffset, visibleOffset } from './navigation';
import { db, type DocumentRecord } from '../db/database';
import { getRestoreScrollY, getScrollProgress, type DocumentLocation, type TextDocumentLocation } from '../documents/location';

export function captureDocumentLocation(documentRecord: DocumentRecord): DocumentLocation {
  const offset = visibleOffset();
  if (offset !== undefined) return locationAtOffset(documentRecord, offset);
  const base = {
    scrollY: window.scrollY,
    progress: getScrollProgress(window.scrollY, document.documentElement.scrollHeight, window.innerHeight),
    updatedAt: Date.now()
  };
  return { ...documentRecord.location, ...base };
}

export async function saveDocumentLocation(documentRecord: DocumentRecord): Promise<DocumentLocation> {
  const location = captureDocumentLocation(documentRecord);
  await db.documents.update(documentRecord.id, { location, updatedAt: Date.now() });
  return location;
}

export function restoreTextLocation(documentRecord: DocumentRecord): void {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (documentRecord.location.absoluteOffset !== undefined) { jumpToOffset(documentRecord.location.absoluteOffset); return; }
    const y = getRestoreScrollY(documentRecord.location as TextDocumentLocation, document.documentElement.scrollHeight, window.innerHeight);
    window.scrollTo({ top: y, behavior: 'auto' });
  }));
}
