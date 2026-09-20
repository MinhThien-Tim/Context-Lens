import type { DocumentSection } from '../documents/sections';
import { useDesktop } from '../components/useDesktop';
import { useDialog } from '../components/useDialog';
export function ContentsPanel({ sections, offset, onJump, onClose }: { sections: DocumentSection[]; offset: number; onJump: (offset: number) => void; onClose: () => void }) {
  const desktop = useDesktop();
  const ref = useDialog(onClose, true, !desktop);
  const current = sections.filter(item => item.offset !== undefined && item.offset <= offset).at(-1)?.id;
  return <>
    {!desktop && <button class="sheet-backdrop" tabIndex={-1} aria-label="Close contents" onClick={onClose} />}
    <section ref={ref} class="contents-panel" tabIndex={-1} role={desktop ? 'complementary' : 'dialog'} aria-modal={desktop ? undefined : true} aria-label="Contents">
      <header><h2>Contents</h2><button class="text-button" onClick={onClose}>Close</button></header>
      {!sections.length ? <p>No table of contents found</p> : <nav aria-label="Document contents">{sections.map(item => <button key={item.id} class="contents-item" style={{ paddingLeft: `${12 + Math.min(6, item.level - 1) * 14}px` }} aria-current={item.id === current ? 'location' : undefined} disabled={item.offset === undefined} onClick={() => { if (!desktop) onClose(); if (item.offset !== undefined) requestAnimationFrame(() => onJump(item.offset!)); }}><span>{item.title}</span>{(item.page ?? item.chapter) && <small>{item.page ? `p. ${item.page}` : `ch. ${item.chapter}`}</small>}</button>)}</nav>}
    </section>
  </>;
}
