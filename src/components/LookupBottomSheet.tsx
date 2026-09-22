import { useEffect, useState } from 'preact/hooks';
import type { LanguageMode, LookupResponse } from '../lookup/types';
import { LanguageTabs } from './LanguageTabs';
import { QuickExplain } from './QuickExplain';
import { ExpandedExplain } from './ExpandedExplain';
import { useDesktop } from './useDesktop';
import { useDialog } from './useDialog';
import type { ContextMode } from '../core/context/types';

interface Props {
  displayMode?: 'popup' | 'panel';
  onDisplayModeChange?: (mode: 'popup' | 'panel') => void;
  anchor?: { left: number; top: number; right: number; bottom: number };
  selectionKey?: string;
  contextResult?: LookupResponse | null;
  onExplain?: (mode: ContextMode) => void;
  onTranslateSentence?: () => void;
  open: boolean;
  result: LookupResponse | null;
  loading: boolean;
  error: string | null;
  mode: LanguageMode;
  onModeChange: (mode: LanguageMode) => void;
  onClose: () => void;
  onOpenSettings: () => void;
  onSpeak: (text: string) => void;
  onToggleSave: () => void;
  onAddNote?: () => void;
  saved: boolean;
  collectionTitle?: string;
  debug?: boolean;
}

export function LookupBottomSheet(props: Props) {
  const [deepOpen, setDeepOpen] = useState(false);
  const desktop = useDesktop();
  const displayMode = props.displayMode ?? 'panel';
  const popup = displayMode === 'popup';
  const sheetRef = useDialog(() => deepOpen ? setDeepOpen(false) : props.onClose(), props.open, !desktop);
  useEffect(() => setDeepOpen(false), [props.selectionKey, props.open, props.result?.selection.surface, props.result?.context.sentence]);
  useEffect(() => {
    // Collapsing can remove the focused advanced control from the mobile dialog.
    if (props.open && !desktop && !deepOpen && !sheetRef.current?.contains(document.activeElement)) {
      sheetRef.current?.querySelector<HTMLElement>('.explain-button')?.focus({ preventScroll: true });
    }
  }, [deepOpen, desktop, props.open]);
  if (!props.open) return null;
  const result = props.result;
  const deep = props.contextResult ?? result;
  const popupLeft = props.anchor && props.anchor.right + 372 <= window.innerWidth
    ? props.anchor.right + 12
    : Math.max(12, (props.anchor?.left ?? 12) - 372);
  const popupStyle = popup && desktop && props.anchor ? {
    left: `${popupLeft}px`,
    top: `${Math.max(72, Math.min(props.anchor.top - 28, window.innerHeight - 430))}px`,
  } : undefined;
  const changeDisplay = (mode: 'popup' | 'panel') => {
    props.onDisplayModeChange?.(mode);
    setDeepOpen(mode === 'panel');
  };
  return <>
    {!desktop && <button class="sheet-backdrop" aria-label="Close meaning" tabIndex={-1} onClick={props.onClose} />}
    <section ref={sheetRef} tabIndex={-1} style={popupStyle} class={`lookup-sheet ${popup ? 'word-popup' : 'side-panel'} ${deepOpen ? 'expanded' : 'quick'}`} role={desktop ? 'complementary' : 'dialog'} aria-modal={desktop ? undefined : true} aria-label="Meaning in context">
      <div class="sheet-handle" aria-hidden="true" />
      <div class="explain-controls">
        <div class="lookup-view-switch" role="group" aria-label="Explanation display">
          <button class={popup ? 'active' : ''} aria-pressed={popup} onClick={() => changeDisplay('popup')}>Bên cạnh từ</button>
          <button class={!popup ? 'active' : ''} aria-pressed={!popup} onClick={() => changeDisplay('panel')}>Bảng bên phải</button>
        </div>
        <button class="explain-close" aria-label="Close meaning" onClick={props.onClose}>✕</button>
      </div>
      {!result ? <div class="lookup-skeleton">Finding meaning…</div> : <>
        <div class="lookup-header-row">
          <QuickExplain result={result} mode={props.mode} expanded={deepOpen} />
          <button class="save-inline" aria-label={props.saved ? 'Remove saved word' : 'Save word'} aria-pressed={props.saved} onClick={props.onToggleSave}>{props.saved ? '✓ Saved' : 'Save'}</button>
        </div>
        {props.loading && <p class="lookup-status" role="status">Finding context...</p>}
        {props.error && <div class="lookup-error" role="status">{props.error}</div>}
        {!popup && <button class="explain-toggle explain-button" disabled={!result} aria-expanded={deepOpen} onClick={() => setDeepOpen(!deepOpen)}><span aria-hidden="true">{deepOpen ? '▾' : '▸'}</span> {deepOpen ? 'Thu gọn nội dung' : 'Mở giải thích đầy đủ'}</button>}
        {!popup && deepOpen && <>
          <div class="context-actions utility-actions">
            <button class="secondary-button compact-action" onClick={() => props.onSpeak(result.selection.lemma)}>Pronounce</button>
            {props.onAddNote && <button class="secondary-button compact-action" onClick={props.onAddNote}>Add note</button>}
            <button class="secondary-button compact-action" onClick={props.onOpenSettings}>Settings</button>
          </div>
          <LanguageTabs value={props.mode} onChange={props.onModeChange} />
          {props.debug && result.engine && <dl class="engine-debug"><div><dt>Provider</dt><dd>{result.engine.provider}</dd></div><div><dt>Cache</dt><dd>{result.engine.cached ? 'hit' : 'miss'}</dd></div>{result.engine.latencyMs !== undefined && <div><dt>Latency</dt><dd>{Math.round(result.engine.latencyMs)} ms</dd></div>}</dl>}
          <div class="context-actions detail-actions">
            <button class="secondary-button compact-action" onClick={() => sheetRef.current?.querySelector<HTMLElement>('[data-context]')?.focus()}>Context</button>
            <button class="secondary-button compact-action" onClick={() => sheetRef.current?.querySelector<HTMLElement>('[data-grammar]')?.focus()}>Grammar</button>
            <button class="ai-explain-button secondary-button compact-action" onClick={() => { setDeepOpen(true); props.onExplain?.('meaning-in-context'); }}>AI Explain</button>
            {props.onTranslateSentence && <button class="secondary-button compact-action" onClick={() => { setDeepOpen(true); props.onTranslateSentence?.(); }}>Translate</button>}
            <select class="compact-select" aria-label="AI explanation type" value="" onChange={event => { if (event.currentTarget.value) { setDeepOpen(true); props.onExplain?.(event.currentTarget.value as ContextMode); } }}><option value="">AI: more…</option><option value="grammar">Grammar</option><option value="phrase">Phrase</option><option value="idiom">Idiom</option><option value="simplify">Simplify</option><option value="nuance">Nuance</option><option value="word-sense">Word sense</option><option value="sentence-structure">Sentence structure</option></select>
          </div>
          {deep && <ExpandedExplain result={result} deep={deep} mode={props.mode} loading={props.loading} contextResult={props.contextResult} />}
        </>}
        <p class="ai-caution" role="note">AI có thể mắc lỗi. Hãy kiểm tra lại thông tin quan trọng.</p>
      </>}
    </section>
  </>;
}
