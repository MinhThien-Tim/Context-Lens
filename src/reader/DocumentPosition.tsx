import { useState } from 'preact/hooks';
import type { DocumentRecord } from '../db/database';
import type { DocumentLocation } from '../documents/location';
import { navigationOffset, positionLabel } from './navigation';
import { useDialog } from '../components/useDialog';

export function DocumentPosition({ document, location, onOpen }: { document: DocumentRecord; location: DocumentLocation; onOpen: () => void }) {
  return <button class="text-button document-position" aria-label={`Go to location: ${positionLabel(document, location)}`} onClick={onOpen}>{positionLabel(document, location)}</button>;
}

export function PageNavigation({ page, total, onPrevious, onNext, onOpen }: { page: number; total: number; onPrevious: () => void; onNext: () => void; onOpen: () => void }) {
  return <nav class="page-navigation" aria-label="Page navigation"><button class="icon-button" aria-label="Previous page" disabled={page <= 1} onClick={onPrevious}>‹</button><button class="text-button page-count" aria-label="Current PDF page" title={`Go to page ${page} of ${total}`} onClick={onOpen}>{page} / {total}</button><button class="icon-button" aria-label="Next page" disabled={page >= total} onClick={onNext}>›</button></nav>;
}

export function GoToLocation({ document, onClose, onJump, onPage }: { document: DocumentRecord; onClose: () => void; onJump: (offset: number) => void; onPage?: (page: number) => void }) {
  const [value, setValue] = useState('');
  const ref = useDialog(onClose);
  const offsets = document.kind === 'pdf' ? document.pageOffsets : document.kind === 'epub' ? document.chapterOffsets : undefined;
  const label = offsets?.length ? document.kind === 'pdf' ? 'Page' : 'Chapter' : 'Progress (%)';
  const target = value.trim() ? navigationOffset(document, Number(value)) : null;
  const submit = () => {
    if (target === null) return;
    onClose();
    requestAnimationFrame(() => document.kind === 'pdf' && onPage ? onPage(Number(value)) : onJump(target));
  };
  return <div class="modal-layer"><button class="modal-backdrop" tabIndex={-1} aria-label="Close navigation" onClick={onClose} /><section ref={ref} class="settings-modal goto-dialog" tabIndex={-1} role="dialog" aria-modal="true" aria-label="Go to location"><form onSubmit={event => { event.preventDefault(); submit(); }}><label>{label}<input autoFocus type="number" min={offsets?.length ? 1 : 0} max={offsets?.length ?? 100} step={1} value={value} onInput={event => setValue(event.currentTarget.value)} /></label><p>Enter {offsets?.length ? `1–${offsets.length}` : '0–100'}.</p><button class="primary-button" disabled={target === null}>Go</button><button type="button" class="text-button" onClick={onClose}>Cancel</button></form></section></div>;
}
