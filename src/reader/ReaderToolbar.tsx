import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useDesktop } from '../components/useDesktop';
import { useDialog } from '../components/useDialog';

interface ReaderToolbarProps {
  interfaceMode: 'simple' | 'advanced'; title: string; contentsOpen: boolean; contextOpen: boolean;
  highlightAvailable?: boolean; highlightActive?: boolean; highlightOpen?: boolean;
  onBack: () => void; onContents: () => void; onContext: () => void; onNote: () => void;
  onSettings: () => void; onEngines: () => void; onHighlight?: () => void; children?: ComponentChildren; primaryActions?: ComponentChildren;
}

const MoreIcon = () => <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>;

export function ReaderToolbar({ interfaceMode, title, contentsOpen, contextOpen, highlightAvailable = false, highlightActive = false, highlightOpen = false, onBack, onContents, onContext, onNote, onSettings, onEngines, onHighlight, children, primaryActions }: ReaderToolbarProps) {
  const desktop = useDesktop();
  const shortTitle = title.replace(/\.(pdf|epub|docx?|txt|md|html?)$/i, '').split(/:\s+/)[0];
  const [menuOpen, setMenuOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useDialog(() => { setMenuOpen(false); trigger.current?.focus({ preventScroll: true }); }, menuOpen, false);
  useEffect(() => {
    if (!menuOpen) return;
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setMenuOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [menuOpen]);
  const act = (action: () => void) => { setMenuOpen(false); action(); };
  return <header class="reader-header">
    <div class="reader-header-leading">
      <button class="toolbar-button reader-back" aria-label="Back to library" onClick={onBack}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 5-7 7 7 7M5 12h15" /></svg><span>Library</span></button>

      <div class="reader-document"><h1 title={title}>{shortTitle}</h1></div>
    </div>
    {children && <div class="reader-header-position">{children}</div>}
    <div class="reader-header-actions">
    <div class="reader-primary-tools">
      <button class="toolbar-button" aria-label="Contents" aria-expanded={contentsOpen} onClick={onContents}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12M3 6h1M3 12h1M3 18h1" /></svg><span>Contents</span></button>

      {highlightAvailable && <button class={`toolbar-button ${highlightActive ? 'markup-indicator' : ''}`} aria-label="Markup" aria-expanded={highlightOpen} onClick={onHighlight}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 15 9-9 4 4-9 9H5zM3 22h18" /></svg><span>Markup</span></button>}
      {primaryActions}
    </div>
      {desktop && interfaceMode === 'advanced' && <button class="toolbar-button" aria-label="Context panel" aria-expanded={contextOpen} onClick={onContext}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 4h16v16H4zM14 4v16" /></svg><span>Context</span></button>}
      <button class="icon-button" aria-label="Reading appearance" onClick={onSettings}><span class="type-icon">Aa</span></button>
      <div class="reader-more" ref={root}><button ref={trigger} class={`icon-button ${highlightActive ? 'markup-indicator' : ''}`} aria-label="Reader menu" aria-expanded={menuOpen} aria-haspopup="menu" onClick={() => setMenuOpen(value => !value)}><MoreIcon /></button>
        {menuOpen && <section ref={menu} class="reader-more-menu" role="menu" aria-label="Reader actions" onKeyDown={event => {
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }}>
          <button role="menuitem" aria-expanded={contentsOpen} onClick={() => act(onContents)}>Document / Contents</button>
          <button role="menuitem" aria-expanded={contextOpen} onClick={() => act(onContext)}>Context panel</button>
          <button role="menuitem" onClick={() => act(onNote)}>Notes</button>
          {highlightAvailable && <button role="menuitem" aria-expanded={highlightOpen} onClick={() => act(() => onHighlight?.())}>{highlightActive ? 'Markup (active)' : 'Markup'}</button>}
          <button role="menuitem" onClick={() => act(onSettings)}>Text and theme</button>
          <button role="menuitem" onClick={() => act(onEngines)}>Language engines</button>
        </section>}
      </div>
    </div>
  </header>;
}
