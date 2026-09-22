import { useEffect, useState } from 'preact/hooks';
import type { LanguageMode, LookupResponse } from '../lookup/types';
import { LanguageTabs } from './LanguageTabs';
import { QuickExplain } from './QuickExplain';
import { ExpandedExplain } from './ExpandedExplain';
import { useDesktop } from './useDesktop';
import { useDialog } from './useDialog';
import type { ContextMode } from '../core/context/types';

interface Props {
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
  return (
    <>
      {!desktop && <button class="sheet-backdrop" aria-label="Close meaning" tabIndex={-1} onClick={props.onClose} />}
      <section ref={sheetRef} tabIndex={-1} class={`lookup-sheet ${deepOpen ? 'expanded' : 'quick'}`} role={desktop ? 'complementary' : 'dialog'} aria-modal={desktop ? undefined : true} aria-label="Meaning in context">
        <div class="sheet-handle" aria-hidden="true" />
        <div class="explain-controls"><button class="explain-button" disabled={!result} aria-expanded={deepOpen} onClick={() => setDeepOpen(!deepOpen)}>{deepOpen ? 'Collapse' : 'Expand'}</button><button class="icon-button" aria-label="Close meaning" onClick={props.onClose}>Close</button></div>
        {!result ? <div class="lookup-skeleton">Finding meaning…</div> : (
          <>

            <button class="secondary-button" aria-label={props.saved ? "Remove saved word" : "Save word"} aria-pressed={props.saved} onClick={props.onToggleSave}>{props.saved ? `Saved \u00b7 ${props.collectionTitle ?? "Saved vocabulary"}` : "Save"}</button>
            <QuickExplain result={result} mode={props.mode} expanded={deepOpen} />
            {props.loading && <p role="status">Finding context...</p>}
            {props.error && <div class="lookup-error" role="status">{props.error}</div>}
            {deepOpen && <>
            <div class="context-actions"><button class="secondary-button" onClick={() => props.onSpeak(result.selection.lemma)}>Pronounce</button>{props.onAddNote && <button class="secondary-button" onClick={props.onAddNote}>Add note for selection</button>}<button class="secondary-button" onClick={props.onOpenSettings}>Settings</button></div>
            <LanguageTabs value={props.mode} onChange={props.onModeChange} />
            {props.debug && result.engine && <dl class="engine-debug"><div><dt>Provider</dt><dd>{result.engine.provider}</dd></div><div><dt>Cache</dt><dd>{result.engine.cached ? 'hit' : 'miss'}</dd></div>{result.engine.latencyMs !== undefined && <div><dt>Latency</dt><dd>{Math.round(result.engine.latencyMs)} ms</dd></div>}</dl>}
            <div class="context-actions">
              <button class="secondary-button" onClick={() => sheetRef.current?.querySelector<HTMLElement>('[data-context]')?.focus()}>Context</button>
              <button class="secondary-button" onClick={() => sheetRef.current?.querySelector<HTMLElement>('[data-grammar]')?.focus()}>Grammar</button>
              <button class="ai-explain-button secondary-button" onClick={() => { setDeepOpen(true); props.onExplain?.('meaning-in-context'); }}>AI Explain</button>
              {props.onTranslateSentence && <button class="secondary-button" onClick={() => { setDeepOpen(true); props.onTranslateSentence?.(); }}>Translate sentence</button>}
              <select aria-label="AI explanation type" value="" onChange={event => { if (event.currentTarget.value) { setDeepOpen(true); props.onExplain?.(event.currentTarget.value as ContextMode); } }}><option value="">AI: more…</option><option value="grammar">Grammar</option><option value="phrase">Phrase</option><option value="idiom">Idiom</option><option value="simplify">Simplify</option><option value="nuance">Nuance</option><option value="word-sense">Word sense</option><option value="sentence-structure">Sentence structure</option></select>
            </div>
            {deep && <ExpandedExplain result={result} deep={deep} mode={props.mode} loading={props.loading} contextResult={props.contextResult} />}
            </>}

          </>
        )}
      </section>
    </>
  );
}
