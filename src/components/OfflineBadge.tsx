import type { DocumentRecord } from '../db/database';
import { isAvailableOffline } from '../documents/offline';

/** Readiness marker only: it never downloads, pre-caches or adds a second storage path. */
export function OfflineBadge({ document }: { document: DocumentRecord }) {
  if (!isAvailableOffline(document)) return null;
  return <span class="offline-badge" title="Stored on this device">✓ Available offline</span>;
}
