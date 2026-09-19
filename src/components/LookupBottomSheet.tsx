import { useEffect, useRef, useState } from 'preact/hooks';
import type { LanguageMode, LookupResponse } from '../lookup/types';
import { LanguageTabs } from './LanguageTabs';

interface Props {
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
  saved: boolean;
}

export function LookupBottomSheet(props: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [deepOpen, setDeepOpen] = useState(false);
  useEffect(() => {
    if (!props.open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sheetRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') props.onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocus.current?.focus({ preventScroll: true }); };
  }, [props.open]);
  useEffect(() => setDeepOpen(false), [props.result?.request_id]);
  if (!props.open) return null;
  const result = props.result;
  const showEn = props.mode !== 'vi';
  const showVi = props.mode !== 'en';
  return (
    <>
      <button class="sheet-backdrop" aria-label="Close meaning" onClick={props.onClose} />
      <section ref={sheetRef} tabIndex={-1} class="lookup-sheet" role="dialog" aria-modal="true" aria-label="Meaning in context">
        <div class="sheet-handle" aria-hidden="true" />
        {!result ? <div class="lookup-skeleton">Finding meaning…</div> : (
          <>
            <header class="lookup-heading">
              <div>
                <div class="word-line"><strong>{result.selection.lemma}</strong><button class="icon-button" aria-label="Pronounce word" onClick={() => props.onSpeak(result.quick.lexical_unit?.text ?? result.selection.lemma)}>🔊</button><button class={`icon-button ${props.saved ? 'saved' : ''}`} aria-label={props.saved ? 'Remove saved word' : 'Save word'} aria-pressed={props.saved} onClick={props.onToggleSave}>{props.saved ? '★' : '☆'}</button></div>
                <p>{[result.selection.part_of_speech, result.selection.ipa_uk].filter(Boolean).join(' · ')}</p>
              </div>
              <span class={`source-pill ${result.source ?? 'ai'}`}>{props.loading ? 'Refining…' : result.source === 'offline' ? 'Offline' : result.source ?? 'AI'}</span>
            </header>
            {showEn && <p class="meaning-en">{result.quick.definition_en || 'This offline entry has Vietnamese meanings only.'}</p>}
            {(showVi || (showEn && !result.quick.definition_en)) && <p class="meaning-vi">{result.quick.meaning_vi.join(' · ')}</p>}
            {result.quick.lexical_unit && (
              <div class="lexical-unit">
                <span>In this sentence</span>
                <strong>{result.quick.lexical_unit.text}</strong>
                <p>→ {showVi ? result.quick.lexical_unit.meaning_vi : result.quick.lexical_unit.meaning_en}</p>
              </div>
            )}
            <LanguageTabs value={props.mode} onChange={props.onModeChange} />
            {props.error && <div class="lookup-error" role="status">{props.error} <button onClick={props.onOpenSettings}>Settings</button></div>}
            <button class="explain-button" aria-expanded={deepOpen} onClick={() => setDeepOpen(!deepOpen)}>Explain <span>{deepOpen ? '⌄' : '›'}</span></button>
            {deepOpen && <div class="deep-explanation">
              <h3>Original sentence</h3><p>{result.context.sentence}</p>
              {showVi && result.deep.sentence_analysis.translation_vi && <><h3>Vietnamese</h3><p class="meaning-vi">{result.deep.sentence_analysis.translation_vi}</p></>}
              {showEn && result.deep.context_explanation_en && <p>{result.deep.context_explanation_en}</p>}
              {showVi && result.deep.context_explanation_vi && <p>{result.deep.context_explanation_vi}</p>}
              {result.deep.sentence_analysis.chunks.length > 0 && <><h3>Structure</h3><dl>{result.deep.sentence_analysis.chunks.map((chunk) => <div><dt>{chunk.text}</dt><dd>{showVi ? chunk.meaning_vi : chunk.role}</dd></div>)}</dl></>}
              {result.deep.grammar && <><h3>Grammar</h3><strong>{result.deep.grammar.pattern}</strong><p>{showVi ? result.deep.grammar.explanation_vi : result.deep.grammar.explanation_en}</p></>}
              {result.deep.contrast.length > 0 && <><h3>Useful contrast</h3><p>{result.deep.contrast[0].meaning} · {showVi ? result.deep.contrast[0].meaning_vi : result.deep.contrast[0].reason_not_selected}</p></>}
            </div>}
          </>
        )}
      </section>
    </>
  );
}
