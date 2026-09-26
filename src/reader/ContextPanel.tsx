import { useDesktop } from '../components/useDesktop';
import { useDialog } from '../components/useDialog';

export function ContextPanel({ onClose, onNote }: { onClose: () => void; onNote: () => void }) {
  const desktop = useDesktop();
  const ref = useDialog(onClose, true, !desktop);
  return <>
    {!desktop && <button class="sheet-backdrop" tabIndex={-1} aria-label="Close context" onClick={onClose} />}
    <section ref={ref} class="context-panel" tabIndex={-1} role={desktop ? 'complementary' : 'dialog'} aria-modal={desktop ? undefined : true} aria-label="Context panel">
      <header class="context-panel-heading"><h2>Context</h2><button class="icon-button" aria-label="Close context" onClick={onClose}>&#215;</button></header>
      <p class="context-panel-empty">Select a word or passage to see its meaning here.</p>
      <button class="secondary-button" onClick={onNote}>Open notes</button>
    </section>
  </>;
}
