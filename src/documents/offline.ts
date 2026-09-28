import type { DocumentRecord } from '../db/database';

/**
 * Offline readiness of a document that already exists in `db.documents`.
 *
 * Every stored record is device-local, so this is never a download state: it only reports whether the
 * local payload the reader needs is really present. The Original PDF reader renders from the stored
 * file bytes (`data`), which backup/restore intentionally excludes, so a restored PDF can be listed
 * without being readable offline. Text, Markdown, article, EPUB and DOCX reading uses the extracted
 * `content` that every stored record carries.
 */
export function isAvailableOffline(document: Pick<DocumentRecord, 'kind' | 'data' | 'content'>): boolean {
  if (document.kind === 'pdf') return Boolean(document.data);
  return Boolean(document.content?.trim() || document.data);
}
