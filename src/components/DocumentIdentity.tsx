import type { DocumentRecord } from '../db/database';
import { OfflineBadge } from './OfflineBadge';

/** Presentation only: the existing record and location remain the source of truth. */
export function DocumentIdentity({ document: doc, detail, kindLabel, compact = false }: { document: DocumentRecord; detail: string; kindLabel: string; compact?: boolean }) {
  const initials = doc.title.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase() || 'CL';
  const percent = Math.round(doc.location.progress * 100);
  return <>
    <span class="document-cover" aria-hidden="true"><span>{kindLabel}</span><b>{initials}</b><i /></span>
    <span class="document-copy"><span class="document-badge">{kindLabel}{doc.source?.siteName ? ` · ${doc.source.siteName}` : ''}</span>
      <strong title={doc.title}>{doc.title}</strong><small>{compact ? (detail.replace(/\s*[???-]?\s*\d+%.*$/, "").trim() || kindLabel) : detail}</small>
      <OfflineBadge document={doc} />
      {!compact && <span class="document-last-opened">Last opened {new Date(doc.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
      <span class="mini-progress" role="progressbar" aria-label="Reading progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{ width: `${percent}%` }} /></span>
      <span class="document-resume">Continue reading <span aria-hidden="true">→</span><small>{percent}%</small></span>
    </span>
  </>;
}
