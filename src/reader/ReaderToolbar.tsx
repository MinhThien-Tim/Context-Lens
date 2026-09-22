import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { useDesktop } from '../components/useDesktop';

interface ReaderToolbarProps {
  title: string; contentsOpen: boolean; highlightAvailable?: boolean; highlightActive?: boolean;
  highlightOpen?: boolean; onBack: () => void; onContents: () => void; onNote: () => void;
  onSettings: () => void; onEngines: () => void; onHighlight?: () => void; children: ComponentChildren;
}

const MoreIcon = () => <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>;

export function ReaderToolbar({ title, contentsOpen, highlightAvailable = false, highlightActive = false, highlightOpen = false, onBack, onContents, onNote, onSettings, onEngines, onHighlight, children }: ReaderToolbarProps) {
  const desktop = useDesktop();
  const [menuOpen, setMenuOpen] = useState(false);
  return <header class="reader-header">
    <div class="reader-header-leading">
      <button class="icon-button" aria-label="Back to library" onClick={onBack}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 5-7 7 7 7M5 12h15" /></svg></button>
      <button class="toolbar-button" aria-label="Contents" aria-expanded={contentsOpen} onClick={onContents}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></svg><span>Contents</span></button>
    </div>
    <div class="reader-document"><h1>{title}</h1><div class="reader-header-position">{children}</div></div>
    <div class="reader-header-actions">
      {desktop ? <>
        {highlightAvailable && <button class={`toolbar-button reader-highlight-button ${highlightActive ? 'active' : ''}`} aria-label="Highlight, underline, and erase" aria-pressed={highlightActive} aria-expanded={highlightOpen} onClick={onHighlight}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m14.5 4.5 5 5L9 20H4v-5Z"/><path d="m12 7 5 5M4 22h7"/></svg><span>Markup</span></button>}
        <button class="toolbar-button" onClick={onNote}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 8h8M8 12h8"/></svg><span>Notes</span></button>
        <button class="toolbar-button" onClick={onSettings}><span class="type-icon">Aa</span><span>Display</span></button>
        <button class="icon-button" onClick={onEngines} aria-label="Settings"><MoreIcon /></button>
      </> : <>
        {highlightAvailable && <button class={`icon-button reader-highlight-button ${highlightActive ? 'active' : ''}`} aria-label={highlightActive ? 'Highlight tool on' : 'Highlight tool off'} aria-pressed={highlightActive} aria-expanded={highlightOpen} onClick={onHighlight}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m14.5 4.5 5 5L9 20H4v-5Z"/><path d="m12 7 5 5M4 22h7"/></svg></button>}
        <div class="reader-more"><button class="icon-button" aria-label="Reader menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><MoreIcon /></button>{menuOpen && <div class="reader-more-menu" role="menu"><button role="menuitem" onClick={() => { setMenuOpen(false); onNote(); }}>Notes</button><button role="menuitem" onClick={() => { setMenuOpen(false); onSettings(); }}>Text and theme</button><button role="menuitem" onClick={() => { setMenuOpen(false); onEngines(); }}>Language engines</button></div>}</div>
      </>}
    </div>
  </header>;
}
