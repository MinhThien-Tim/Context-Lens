import { useEffect, useRef, useState } from 'preact/hooks';
import type { LanguageMode, LookupResponse } from '../lookup/types';
import { LanguageTabs } from './LanguageTabs';
import type { ContextMode } from '../core/context/types';

interface Props {
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
  debug?: boolean;
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
  useEffect(() => setDeepOpen(false), [props.result?.selection.surface, props.result?.context.sentence]);
  if (!props.open) return null;
  const result = props.result;
  const deep = props.contextResult ?? result;
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
                <div class="word-line"><strong>{result.selection.lemma}</strong><button class="icon-button" aria-label="Pronounce word" onClick={() => props.onSpeak(result.quick.lexical_unit?.text ?? result.selection.lemma)}>🔊</button><button class={`icon-button ${props.saved ? 'saved' : ''}`} aria-label={props.saved ? 'Remove saved word' : 'Save word'} aria-pressed={props.saved} onClick={props.onToggleSave}>{props.saved ? '★' : '☆'}</button>{props.onAddNote && <button class="icon-button" aria-label="Add note for selection" onClick={props.onAddNote}>✎</button>}</div>
                <p>{[result.selection.part_of_speech, result.selection.ipa_uk].filter(Boolean).join(' · ')}</p>
              </div>
              <span class={`source-pill ${result.source ?? 'ai'}`}>{props.loading ? 'Refining…' : result.source === 'cache' ? 'Cached' : result.source === 'offline' ? 'Local' : result.source ?? 'AI'}</span>
            </header>
            {showEn && <div><small>English definition</small><p class="meaning-en">{result.quick.definition_en || 'No English definition is available for this selection yet.'}</p></div>}
            {showVi && <div><small>{result.lens?.vietnamese?.senseAligned === false ? 'Vietnamese dictionary meanings' : 'Vietnamese'}</small><p class="meaning-vi">{result.quick.meaning_vi.length ? result.quick.meaning_vi.join(' · ') : 'Chưa có nghĩa tiếng Việt cho lựa chọn này.'}</p></div>}
            {result.quick.lexical_unit && (
              <div class="lexical-unit">
                <span>In this sentence</span>
                <strong>{result.quick.lexical_unit.text}</strong>
                <p>→ {showVi ? result.quick.lexical_unit.meaning_vi : result.quick.lexical_unit.meaning_en}</p>
              </div>
            )}
            <LanguageTabs value={props.mode} onChange={props.onModeChange} />
            {props.error && <div class="lookup-error" role="status">{props.error} <button onClick={props.onOpenSettings}>Settings</button></div>}
            {props.debug && result.engine && <dl class="engine-debug"><div><dt>Provider</dt><dd>{result.engine.provider}</dd></div><div><dt>Cache</dt><dd>{result.engine.cached ? 'hit' : 'miss'}</dd></div>{result.engine.latencyMs !== undefined && <div><dt>Latency</dt><dd>{Math.round(result.engine.latencyMs)} ms</dd></div>}</dl>}
            <div class="context-actions">
              <button class="explain-button" aria-expanded={deepOpen} onClick={() => setDeepOpen(!deepOpen)}>Context <span>{deepOpen ? '⌄' : '›'}</span></button>
              <button class="secondary-button" onClick={() => setDeepOpen(true)}>Grammar</button>
              <button class="ai-explain-button secondary-button" onClick={() => { setDeepOpen(true); props.onExplain?.('meaning-in-context'); }}>AI Explain</button>
              {props.onTranslateSentence && <button class="secondary-button" onClick={() => { setDeepOpen(true); props.onTranslateSentence?.(); }}>Translate sentence</button>}
              <select aria-label="AI explanation type" value="" onChange={event => { if (event.currentTarget.value) { setDeepOpen(true); props.onExplain?.(event.currentTarget.value as ContextMode); } }}><option value="">AI: more…</option><option value="grammar">Grammar</option><option value="phrase">Phrase</option><option value="idiom">Idiom</option><option value="simplify">Simplify</option><option value="nuance">Nuance</option><option value="word-sense">Word sense</option><option value="sentence-structure">Sentence structure</option></select>
            </div>
            {deepOpen && deep && <div class="deep-explanation" aria-busy={props.loading}>
              {props.loading && <p role="status">Finding context…</p>}
              {props.contextResult && <p class="source-pill">{props.contextResult.source === 'ai' ? 'AI' : props.contextResult.source === 'cache' ? 'Cached' : 'Local'}</p>}
              <h3>Original sentence</h3><p>{result.context.sentence}</p>
              {result.lens && <><p>Local confidence: {Math.round(result.lens.confidence * 100)}%</p>{result.lens.context.needsPreviousSentence && <p>{result.lens.context.previousSentence ? `Previous sentence: ${result.lens.context.previousSentence}` : 'The previous sentence may be needed to understand this reference.'}</p>}
                {result.lens.sense?.reasons.length ? <p>{result.lens.sense.reasons.join(' · ')}</p> : null}
                {showEn && result.lens.english?.synonyms?.length ? <p>Related words: {result.lens.english.synonyms.join(', ')}</p> : null}
                {showEn && result.lens.english?.examples?.[0] && <p>Example: {result.lens.english.examples[0]}</p>}
                {showEn && result.lens.context.simpleEnglish && <p>Simpler wording: {result.lens.context.simpleEnglish}</p>}</>}
              {showVi && deep.deep.sentence_analysis.translation_vi && <><h3>Vietnamese</h3><p class="meaning-vi">{deep.deep.sentence_analysis.translation_vi}</p></>}
              {showEn && deep.deep.context_explanation_en && <p>{deep.deep.context_explanation_en}</p>}
              {showVi && deep.deep.context_explanation_vi && <p>{deep.deep.context_explanation_vi}</p>}
              {deep.deep.sentence_analysis.chunks.length > 0 && <><h3>Structure</h3><dl>{deep.deep.sentence_analysis.chunks.map((chunk) => <div><dt>{chunk.text}</dt><dd>{showVi ? chunk.meaning_vi : chunk.role}</dd></div>)}</dl></>}
              {deep.deep.grammar && <><h3>Grammar</h3><strong>{deep.deep.grammar.pattern}</strong><p>{showVi ? deep.deep.grammar.explanation_vi : deep.deep.grammar.explanation_en}</p></>}
              {deep.deep.contrast.length > 0 && <><h3>Useful contrast</h3><p>{deep.deep.contrast[0].meaning} · {showVi ? deep.deep.contrast[0].meaning_vi : deep.deep.contrast[0].reason_not_selected}</p></>}
            </div>}
          </>
        )}
      </section>
    </>
  );
}
