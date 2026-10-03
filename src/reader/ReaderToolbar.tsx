import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useDesktop } from '../components/useDesktop';
import { useDialog } from '../components/useDialog';
import { ArrowLeft, Search, MoreVertical, FileText, BookOpen } from 'lucide-preact';

interface ReaderToolbarProps {
  interfaceMode: 'simple' | 'advanced'; title: string; contentsOpen: boolean; contextOpen: boolean;
  highlightAvailable?: boolean; highlightActive?: boolean; highlightOpen?: boolean;
  onBack: () => void; onContents: () => void; onContext: () => void; onNote: () => void;
  onSettings: () => void; onEngines: () => void; onHighlight?: () => void; children?: ComponentChildren; primaryActions?: ComponentChildren;
  mode?: 'original' | 'reading'; onModeSwitch?: () => void; onRecognizeNext?: () => void;
}

export function ReaderToolbar({ interfaceMode, title, contentsOpen, contextOpen, highlightAvailable = false, highlightActive = false, highlightOpen = false, onBack, onContents, onContext, onNote, onSettings, onEngines, onHighlight, children, primaryActions, mode, onModeSwitch, onRecognizeNext }: ReaderToolbarProps) {
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
      <button class="reader-back-button" aria-label="Back to library" onClick={onBack}><ArrowLeft size={20} /></button>

      <div class="reader-document"><h1 title={title}>{shortTitle}</h1></div>
    </div>
    <div class="reader-header-actions">
      <button class="icon-button" aria-label="Search" onClick={() => {}} disabled><Search size={20} /></button>
      {mode && onModeSwitch && (
          <button class="icon-button" aria-label={mode === 'original' ? 'Switch to Reading mode' : 'Switch to Original mode'} onClick={onModeSwitch} title={mode === 'original' ? 'Switch to Reading mode' : 'Switch to Original mode'}>
          {mode === 'original' ? <FileText size={20} /> : <BookOpen size={20} />}
        </button>
      )}
        {children && <div class="reader-header-position">{children}</div>}
        {primaryActions && <div class="reader-primary-tools">{primaryActions}</div>}
        <div class="reader-more" ref={root}><button ref={trigger} class={`icon-button ${highlightActive ? 'markup-indicator' : ''}`} aria-label="Reader menu" aria-expanded={menuOpen} aria-haspopup="menu" onClick={() => setMenuOpen(value => !value)}><MoreVertical size={20} /></button>
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
            <button role="menuitem" onClick={() => act(() => onRecognizeNext?.())}>OCR next</button>
          </section>}</div>
      </div>
    </header>;
}