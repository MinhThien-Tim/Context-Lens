import { useState } from 'preact/hooks';
import type { DocumentSection } from '../documents/sections';
import { useDesktop } from '../components/useDesktop';
import { useDialog } from '../components/useDialog';

export function ContentsPanel({ sections, offset, onJump, onClose, pageCount, page, onPage, onGoTo, onNotes }: {
  sections: DocumentSection[]; offset: number; onJump: (offset: number) => void; onClose: () => void;
  pageCount?: number; page?: number; onPage?: (page: number) => void; onGoTo: () => void; onNotes: () => void;
}) {
  const desktop = useDesktop();
  const ref = useDialog(onClose, true, !desktop);
  const [destination, setDestination] = useState<'contents' | 'pages'>('contents');
  const current = sections.filter(item => item.offset !== undefined && item.offset <= offset).at(-1)?.id;
  const navigate = (action: () => void) => { if (!desktop) onClose(); requestAnimationFrame(action); };
  return <>
    {!desktop && <button class="sheet-backdrop" tabIndex={-1} aria-label="Close document panel" onClick={onClose} />}
    <section ref={ref} class="contents-panel" tabIndex={-1} role={desktop ? 'complementary' : 'dialog'} aria-modal={desktop ? undefined : true} aria-label="Document panel">
      <header><h2>Document</h2><button class="icon-button" aria-label="Close document panel" onClick={onClose}>&#215;</button></header>
      <div class="document-destinations" role="group" aria-label="Document navigation">
        <button aria-pressed={destination === 'contents'} onClick={() => setDestination('contents')}>Contents</button>
        {pageCount && <button aria-pressed={destination === 'pages'} onClick={() => setDestination('pages')}>Pages</button>}
      </div>
      <div class="document-panel-content">
        {destination === 'pages' && pageCount ? <nav aria-label="Document pages">{Array.from({ length: pageCount }, (_, index) => index + 1).map(number => <button key={number} class="contents-item" aria-current={number === page ? 'page' : undefined} onClick={() => navigate(() => onPage?.(number))}>Page {number}</button>)}</nav>
          : !sections.length ? <p class="section-empty">No table of contents found</p> : <nav aria-label="Document contents">{sections.map(item => <button key={item.id} class="contents-item" style={{ paddingLeft: `${12 + Math.min(6, item.level - 1) * 14}px` }} aria-current={item.id === current ? 'location' : undefined} disabled={item.offset === undefined} onClick={() => { if (item.offset !== undefined) navigate(() => onJump(item.offset!)); }}><span>{item.title}</span>{(item.page ?? item.chapter) && <small>{item.page ? `p. ${item.pageLabel ?? item.page}` : `ch. ${item.chapter}`}</small>}</button>)}</nav>}
      </div>
      <div class="document-panel-actions"><button class="text-button" onClick={() => navigate(onGoTo)}>Go to location</button><button class="text-button" onClick={onNotes}>Notes</button></div>
    </section>
  </>;
}
