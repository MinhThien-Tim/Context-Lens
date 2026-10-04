import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useDesktop } from '../components/useDesktop';
import { useDialog } from '../components/useDialog';

function BackIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>;
}

function MoreIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>;
}

// Contract §7.1: the Header owns exactly and only Back, the document title, and Original/Reading
// for PDF. No secondary action, no More trigger, no OCR control lives here (§7.2).
export function ReaderToolbar({ title, onBack, primaryActions }: { title: string; onBack: () => void; primaryActions?: ComponentChildren }) {
  return <header class="reader-header">
    <div class="reader-header-leading">
      <button class="icon-button reader-back" aria-label="Back to library" onClick={onBack}><BackIcon /><span>Back</span></button>
      <div class="reader-document"><h1 title={title}>{title}</h1></div>
    </div>
    <div class="reader-header-actions">{primaryActions}</div>
  </header>;
}

export interface ReaderMoreItem {
  label: string;
  onSelect: () => void;
  pressed?: boolean;
}

// Contract §9: exactly one More disclosure. One component, one menu element, one dismissal and
// focus path for both presentation forms — bottom sheet at <=1023px, popover at >=1024px (§9.2).
export function ReaderMore({ items, markupActive = false }: { items: ReaderMoreItem[]; markupActive?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const desktop = useDesktop();
  // §14.4: focus returns to the opener on close for both forms. `useDialog` owns the ref that both
  // its activation focus and its focus restoration depend on, so the section must use it directly.
  const dialog = useDialog(() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); }, open, !desktop);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    if (desktop) dialog.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open, desktop]);
  // §14.3: expose expanded/collapsed state, and keep it keyboard operable inside the menu.
  const onMenuKeyDown = (event: KeyboardEvent) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const items = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    if (!items.length) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? items.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };
  const select = (item: ReaderMoreItem) => { setOpen(false); trigger.current?.focus({ preventScroll: true }); item.onSelect(); };
  return <div class="reader-more" ref={root}>
    <button ref={trigger} class={`icon-button ${markupActive ? 'markup-indicator' : ''}`} aria-label="Reader menu" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(value => !value)}><MoreIcon /></button>
    {/* §9.5 — at <=1023px More is a bottom sheet, so it needs the product's standard
        backdrop dismissal. The sheet sits above the Footer band and therefore covers the
        trigger, which makes the trigger unusable as a close affordance on that band. */}
    {open && !desktop && <button class="sheet-backdrop" tabIndex={-1} aria-label="Close reader menu" onClick={() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); }} />}
    {open && <section ref={dialog} class="reader-more-menu" role="menu" aria-label="Reader actions" onKeyDown={onMenuKeyDown}>
      {items.map(item => <button key={item.label} role="menuitem" type="button" aria-label={item.label} aria-pressed={item.pressed} onClick={() => select(item)}>{item.label}</button>)}
    </section>}
  </div>;
}