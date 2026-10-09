import type { DocumentRecord } from '../db/database';
import { OfflineBadge } from './OfflineBadge';

// ARCH-2: there is one Home branch and one card shape. The former `advanced` prop and the
// `DocumentIdentity` variant went with `interfaceMode`; P6 reviews Home as its own phase.
export function ContinueReading({ documents, onOpen, onDismiss, positionLabel, kindLabel }: {
  documents: DocumentRecord[];
  onOpen: (doc: DocumentRecord) => void;
  onDismiss: (doc: DocumentRecord) => void;
  positionLabel: (doc: DocumentRecord) => string;
  kindLabel: (doc: DocumentRecord) => string;
}) {
  return <section class="continue-section">
    <details class="continue-disclosure">
      <summary class="section-heading"><h2>Continue reading</h2><span class="continue-count">{documents.length}</span><span class="continue-chevron" aria-hidden="true">⌄</span></summary>
      {documents.length ? <div class="continue-grid" role="region" aria-label="Continue reading documents" tabIndex={0}>
        {documents.map(doc => <div class="continue-item" key={doc.id}>
          <button class="continue-card" onClick={() => onOpen(doc)}>
            <span class={`document-badge kind-${doc.kind}`}>{kindLabel(doc)}</span><strong>{doc.title}</strong><small>{positionLabel(doc)}</small>
            <OfflineBadge document={doc} />
            <span class="mini-progress" role="progressbar" aria-label="Reading progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(doc.location.progress * 100)}><i style={{ width: `${Math.round(doc.location.progress * 100)}%` }} /></span>
            <span class="document-resume">Continue reading →</span>
          </button>
          <button class="continue-dismiss" aria-label={`Remove from Continue reading: ${doc.title}`} title="Remove from Continue reading" onClick={event => { event.stopPropagation(); onDismiss(doc); }}>×</button>
        </div>)}
      </div> : <p class="section-empty">Your reading progress will appear here.</p>}
    </details>
  </section>;
}
