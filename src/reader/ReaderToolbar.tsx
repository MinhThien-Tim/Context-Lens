import type { ComponentChildren } from 'preact';
export function ReaderToolbar({ title, contentsOpen, onBack, onContents, onNote, onSettings, onEngines, children }: { title: string; contentsOpen: boolean; onBack: () => void; onContents: () => void; onNote: () => void; onSettings: () => void; onEngines: () => void; children: ComponentChildren }) {
  return <header class="reader-header">
    <button class="icon-button" aria-label="Back to library" onClick={onBack}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 5-7 7 7 7M5 12h15" /></svg></button>
    <button class="icon-button" aria-label="Contents" aria-expanded={contentsOpen} onClick={onContents}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button>
    <h1>{title}</h1>{children}
    <button class="text-button" onClick={onNote} aria-label="Document notes">Note</button>
    <button class="text-button" onClick={onSettings} aria-label="Reader settings">Aa</button>
    <button class="icon-button" onClick={onEngines} aria-label="Language engine settings"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button>
  </header>;
}
