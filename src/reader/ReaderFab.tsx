import { useEffect, useRef, useState } from 'preact/hooks';
import { useDialog } from '../components/useDialog';
import { Pencil, X, Highlighter, StickyNote, Type, TextCursorInput } from 'lucide-preact';

interface ReaderFabProps {
  mode: 'original' | 'reading';
  highlightAvailable: boolean;
  highlightActive: boolean;
  highlightOpen: boolean;
  onMarkup: () => void;
  onNotes: () => void;
  onTextTheme: () => void;
  onFormFill: () => void;
  lookupOpen?: boolean;
}

export function ReaderFab({ mode, highlightAvailable, highlightActive, highlightOpen, onMarkup, onNotes, onTextTheme, onFormFill, lookupOpen = false }: ReaderFabProps) {
  const [expanded, setExpanded] = useState(false);
  const [dimmed, setDimmed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dimTimer = useRef<number | null>(null);
  const dialog = useDialog(() => { setExpanded(false); trigger.current?.focus({ preventScroll: true }); }, expanded, true);

  // Dim after 2s idle or when scrolling
  useEffect(() => {
    const startDim = () => {
      if (dimTimer.current) clearTimeout(dimTimer.current);
      dimTimer.current = window.setTimeout(() => setDimmed(true), 2000);
    };
    const cancelDim = () => {
      if (dimTimer.current) clearTimeout(dimTimer.current);
      setDimmed(false);
    };
    const onScroll = () => cancelDim();
    const onPointerDown = () => cancelDim();
      document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    document.addEventListener('pointerdown', onPointerDown, { passive: true });
    startDim();
    return () => {
        document.removeEventListener('scroll', onScroll, { capture: true });
      document.removeEventListener('pointerdown', onPointerDown);
      if (dimTimer.current) clearTimeout(dimTimer.current);
    };
  }, []);

  // Close on backdrop click, scroll start, or system back
  useEffect(() => {
    if (!expanded) return;
    const onBackdrop = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      setExpanded(false);
    };
    const onScroll = () => setExpanded(false);
    const onPopState = () => setExpanded(false);
    const backdrop = root.current?.querySelector('.reader-fab-backdrop');
      backdrop?.addEventListener('pointerdown', onBackdrop as EventListener);
      document.addEventListener('scroll', onScroll, { passive: true, capture: true, once: true });
    window.addEventListener('popstate', onPopState, { once: true });
    history.pushState(null, '');
    return () => {
        backdrop?.removeEventListener('pointerdown', onBackdrop as EventListener);
        document.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('popstate', onPopState);
    };
  }, [expanded]);

  // Hide FAB when lookup is open
  if (lookupOpen) return null;

  const toggle = () => setExpanded(v => !v);
  const close = () => setExpanded(false);

  return (
    <div class="reader-fab" ref={root}>
      {expanded && <button class="reader-fab-backdrop" tabIndex={-1} aria-label="Close markup tools" onClick={close} />}
      <button
        ref={trigger}
        class={`reader-fab-trigger ${dimmed ? 'dimmed' : ''} ${expanded ? 'expanded' : ''}`}
        aria-label={expanded ? 'Close markup tools' : 'Open markup tools'}
        aria-expanded={expanded}
        aria-haspopup="menu"
        onClick={toggle}
      >
        {expanded ? <X size={24} /> : <Pencil size={24} />}
      </button>
      {expanded && (
        <section ref={dialog} class="reader-fab-menu" role="menu" aria-label="Markup tools" onKeyDown={event => {
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }}>
          <button role="menuitem" class="reader-fab-item" onClick={() => { close(); onMarkup(); }}>
            <Highlighter size={20} />
            <span>Markup</span>
          </button>
          <button role="menuitem" class="reader-fab-item" onClick={() => { close(); onNotes(); }}>
            <StickyNote size={20} />
            <span>Notes</span>
          </button>
          <button role="menuitem" class="reader-fab-item" onClick={() => { close(); onTextTheme(); }}>
            <Type size={20} />
            <span>Text and theme</span>
          </button>
          {mode === 'original' && (
            <button role="menuitem" class="reader-fab-item" onClick={() => { close(); onFormFill(); }}>
              <TextCursorInput size={20} />
              <span>Form fill</span>
            </button>
          )}
        </section>
      )}
    </div>
  );
}