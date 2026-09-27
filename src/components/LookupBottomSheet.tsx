import { clampPopup, DESKTOP_QUICK_WIDTH, normalizePopupPlacement, pinPopup, popupBounds, restorePopup, type LookupPopupPlacement, type PopupPoint } from './lookupPopupPlacement';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { LanguageMode, LookupResponse } from '../lookup/types';
import { LanguageTabs } from './LanguageTabs';
import { QuickExplain } from './QuickExplain';
import { ExpandedExplain } from './ExpandedExplain';
import { useDesktop } from './useDesktop';
import { useDialog } from './useDialog';
import type { ContextMode } from '../core/context/types';
import { getDiagnostics } from '../core/diagnostics';

interface Props {
  quickMode?: 'simple' | 'standard';
  onQuickModeChange?: (mode: 'simple' | 'standard') => void;
  placement?: LookupPopupPlacement;
  onPlacementChange?: (placement: LookupPopupPlacement) => void;
  displayMode?: 'popup' | 'panel';
  preferredView?: 'quick' | 'full';
  onDisplayModeChange?: (mode: 'popup' | 'panel') => void;
  anchor?: { left: number; top: number; right: number; bottom: number };
  selectionKey?: string;
  selectionText?: string;
  contextResult?: LookupResponse | null;
  onExplain?: (mode: ContextMode) => void;
  geminiConnected?: boolean;
  onTranslateSentence?: () => void;
  open: boolean;
  result: LookupResponse | null;
  loading: boolean;
  quickPending?: boolean;
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
  const [expanded, setExpanded] = useState(false);
  const deepOpen = props.displayMode ? props.displayMode === 'panel' : expanded;
  const simple = !deepOpen && props.quickMode === 'simple';
  const desktop = useDesktop();
  const bodyRef = useRef<HTMLDivElement>(null);
  const popup = !deepOpen;
  const changeDisplay = (next: boolean) => {
    setExpanded(next);
    props.onDisplayModeChange?.(next ? 'panel' : 'popup');
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  };
  const sheetRef = useDialog(() => { if (deepOpen) changeDisplay(false); else props.onClose(); }, props.open, !desktop);
  useEffect(() => { setExpanded(false); if (bodyRef.current) bodyRef.current.scrollTop = 0; }, [props.selectionKey, props.open]);
  useEffect(() => {
    // Collapsing can remove the focused advanced control from the mobile dialog.
    if (props.open && !desktop && !deepOpen && !sheetRef.current?.contains(document.activeElement)) {
      sheetRef.current?.querySelector<HTMLElement>('.explain-button')?.focus({ preventScroll: true });
    }
  }, [deepOpen, desktop, props.open]);
  const placement = normalizePopupPlacement(props.placement);
  const [geometry, setGeometry] = useState({ width: window.innerWidth, height: window.innerHeight, popupWidth: DESKTOP_QUICK_WIDTH, popupHeight: 520, headerBottom: 56 });
  const [dragPosition, setDragPosition] = useState<PopupPoint | null>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; start: PopupPoint; current: PopupPoint; moved: boolean } | null>(null);
  const bounds = popupBounds(geometry.width, geometry.height, geometry.popupWidth, geometry.popupHeight, geometry.headerBottom);
  useEffect(() => {
    if (!props.open || !desktop || !popup) { drag.current = null; setDragPosition(null); return; }
    const sheet = sheetRef.current;
    const measure = () => {
      if (!sheet) return;
      const rect = sheet.getBoundingClientRect();
      const headerBottom = sheet.closest('.reader-shell')?.querySelector('.reader-header')?.getBoundingClientRect().bottom ?? 56;
      setGeometry(previous => {
        const next = { width: window.innerWidth, height: window.innerHeight, popupWidth: rect.width || DESKTOP_QUICK_WIDTH, popupHeight: rect.height || 520, headerBottom };
        return Object.keys(next).every(key => next[key as keyof typeof next] === previous[key as keyof typeof next]) ? previous : next;
      });
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (sheet) observer?.observe(sheet);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [props.open, desktop, popup]);
  useEffect(() => { setDragPosition(null); }, [props.placement]);
  const savePosition = (point: PopupPoint) => props.onPlacementChange?.(pinPopup(point, bounds));
  const startDrag = (event: PointerEvent) => {
    const interactive = (event.target as Element).closest('button,a,select,input,textarea,summary,[role="button"],[contenteditable],[tabindex],[data-interactive]');
    if (!desktop || !popup || !props.onPlacementChange || event.button !== 0 || !event.isPrimary
      || (interactive && (event.currentTarget as HTMLElement).contains(interactive))
      || window.getSelection()?.toString()) return;
    const rect = sheetRef.current?.getBoundingClientRect();
    if (!rect) return;
    const start = { left: rect.left, top: rect.top };
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, start, current: start, moved: false };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const moveDrag = (event: PointerEvent) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (!active.moved && Math.hypot(event.clientX - active.x, event.clientY - active.y) < 3) return;
    active.moved = true;
    active.current = clampPopup({ left: active.start.left + event.clientX - active.x, top: active.start.top + event.clientY - active.y }, bounds);
    setDragPosition(active.current);
  };
  const endDrag = (event: PointerEvent, cancelled = false) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null;
    const handle = event.currentTarget as HTMLElement;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    if (!cancelled && active.moved) savePosition(active.current);
    setDragPosition(null);
  };
  if (!props.open) return null;
  // Selection and lookup state are updated independently. Never paint a result
  // that belongs to the previous selection while the new lookup is starting.
  const result = props.result && (!props.selectionText
    || props.result.selection.surface.normalize('NFC').trim() === props.selectionText.normalize('NFC').trim())
    ? props.result : null;
  const contextResult = props.contextResult && result
    && props.contextResult.selection.surface.normalize('NFC').trim() === result.selection.surface.normalize('NFC').trim()
    ? props.contextResult : null;
  const deep = contextResult ?? result;
  const popupLeft = props.anchor && props.anchor.right + geometry.popupWidth + 12 <= geometry.width
    ? props.anchor.right + 12 : Math.max(12, (props.anchor?.left ?? 12) - geometry.popupWidth - 12);
  const autoPosition = { left: popupLeft, top: Math.max(72, Math.min((props.anchor?.top ?? 100) - 28, geometry.height - Math.min(520, geometry.height - 84) - 12)) };
  const position = dragPosition ?? (placement.mode === 'pinned' ? restorePopup(placement, bounds) : autoPosition);
  const popupStyle = popup && desktop ? {
    '--desktop-quick-width': `${DESKTOP_QUICK_WIDTH}px`,
    left: `${position.left}px`, top: `${position.top}px`,
    maxHeight: `${Math.max(0, Math.min(520, geometry.height - bounds.minTop - 12))}px`,
  } : undefined;
  const toggleFull = () => {
    changeDisplay(!deepOpen);
  };
  const contextual = result?.dictionary?.senses.some(sense => sense.contextMatch) && !['common', 'ambiguous'].includes(result?.dictionary?.senseStatus ?? 'context');
  const ipa = result?.selection.ipa_uk || result?.selection.ipa_us || result?.dictionary?.pronunciation;
  const sources = [...new Set([...(result?.dictionary?.senses.map(sense => sense.source) ?? []), result?.source, result?.engine?.provider, ...Object.values(result?.lens?.providers ?? {}), contextResult?.engine?.provider].filter(Boolean))];
  return <>
    {!desktop && <button class="sheet-backdrop" aria-label="Close meaning" tabIndex={-1} onClick={props.onClose} />}
    <section ref={sheetRef} tabIndex={-1} style={popupStyle} data-quick-mode={deepOpen ? undefined : props.quickMode ?? 'standard'} class={`lookup-sheet ${popup ? 'word-popup' : 'side-panel'} ${deepOpen ? 'expanded' : 'quick'}`} role={desktop ? 'complementary' : 'dialog'} aria-modal={desktop ? undefined : true} aria-label="Meaning in context">
      <header class="inspector-header">
        <div class={`inspector-word ${desktop && popup ? 'lookup-drag-handle' : ''} ${dragPosition ? 'is-dragging' : ''}`} title={desktop && popup ? 'Drag to keep popup here' : undefined} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={event => endDrag(event)} onPointerCancel={event => endDrag(event, true)} onLostPointerCapture={event => endDrag(event, true)}><div class="inspector-word-title"><strong>{result?.selection.surface || props.selectionText}</strong>{result && (result.dictionary?.contextPos || result.selection.part_of_speech) && <span class="pos-chip">{result.dictionary?.contextPos || result.selection.part_of_speech}</span>}{simple && result && <button class="inspector-word-speak" aria-label="Pronounce word" onClick={() => props.onSpeak(result.selection.surface)}>{"\u266a"}</button>}</div></div>
        <div class="inspector-header-actions">{result && props.onAddNote && <button class="inspector-note secondary-button" onClick={props.onAddNote} aria-label="Add note" title="Add note">Note</button>}{result && <button class="save-inline" aria-label={props.saved ? 'Remove saved word' : 'Save word'} aria-pressed={props.saved} onClick={props.onToggleSave}>{props.saved ? '✓ Saved' : 'Save'}</button>}<button class="explain-close" aria-label="Close meaning" onClick={props.onClose}>×</button></div>
        {result && <div class="inspector-pronunciation">
          {ipa && <span class="ipa-line">{ipa}</span>}{!simple && <button aria-label="Pronounce word" onClick={() => props.onSpeak(result.selection.surface)}>♪</button>}
          <div class="inspector-lookup-tools">
            {!simple && <LanguageTabs value={props.mode} onChange={props.onModeChange} compact />}
            {!deepOpen && props.onQuickModeChange && <button class="quick-mode-toggle" aria-pressed={simple} aria-label={simple ? 'Use Standard Quick card' : 'Use Simple Quick card'} onClick={() => props.onQuickModeChange?.(simple ? 'standard' : 'simple')}>{simple ? 'Simple' : 'Standard'}</button>}
            <details class="explain-more-actions"><summary aria-label="More actions" title="More actions">⋯</summary><div>
              {simple && <LanguageTabs value={props.mode} onChange={props.onModeChange} compact />}
              {props.onDisplayModeChange && <label class="lookup-view-preference">Default view<select aria-label="Default lookup view" value={props.preferredView ?? (deepOpen ? 'full' : 'quick')} onChange={event => changeDisplay(event.currentTarget.value === 'full')}><option value="quick">Quick</option><option value="full">Show more</option></select><small>Saved for new lookups.</small></label>}
              {desktop && popup && props.onPlacementChange && <label class="lookup-view-preference">Popup position<select aria-label="Popup position" value={placement.mode} onChange={event => {
                if (event.currentTarget.value === 'auto') props.onPlacementChange?.({ mode: 'auto' });
                else { const rect = sheetRef.current?.getBoundingClientRect(); if (rect) savePosition({ left: rect.left, top: rect.top }); }
              }}><option value="auto">Auto</option><option value="pinned">Keep here</option></select></label>}
              <button class="secondary-button compact-action" onClick={props.onOpenSettings}>Settings</button>
              {deepOpen && !props.geminiConnected && <select class="compact-select" aria-label="AI explanation type" value="" onChange={event => { if (event.currentTarget.value) props.onExplain?.(event.currentTarget.value as ContextMode); }}><option value="">AI task…</option><option value="grammar">Grammar</option><option value="phrase">Phrase</option><option value="idiom">Idiom</option><option value="simplify">Simplify</option><option value="nuance">Nuance</option><option value="word-sense">Word sense</option><option value="sentence-structure">Sentence structure</option></select>}
            </div></details>
            <button class="explain-toggle explain-button" aria-expanded={deepOpen} aria-label={deepOpen ? 'Show less' : 'Show more'} title={deepOpen ? 'Show less' : 'Show more'} onClick={toggleFull}>{!deepOpen && 'Show more'} <svg class="explain-direction" aria-hidden="true" viewBox="0 0 16 16"><path d={deepOpen ? "M13 8H3m4-4L3 8l4 4" : "M3 8h10m-4-4 4 4-4 4"} /></svg></button>
          </div>
        </div>}
        {result && <div class="inspector-word-meta">{result.selection.lemma && result.selection.lemma !== result.selection.surface && <span>{result.selection.lemma.includes(' ') ? 'Meaning for' : 'Base'}: {result.selection.lemma}</span>}{contextual && <span class="context-badge">✓ Context</span>}</div>}
        {result && deepOpen && (props.onTranslateSentence || !props.geminiConnected) && <div class="inspector-controls"><div class="explain-toolstrip">
          {props.onTranslateSentence && <button class="secondary-button compact-action" onClick={props.onTranslateSentence} aria-label="Translate sentence" title="Translate sentence">Translate</button>}
          {!props.geminiConnected && <button class="ai-explain-button secondary-button compact-action" onClick={() => props.onExplain?.('meaning-in-context')}>AI Explain</button>}
        </div></div>}
      </header>
      <div class="inspector-body" ref={bodyRef}>
      {!result ? <div class="lookup-pending"><strong>{props.selectionText}</strong><span>Finding meaning…</span></div> : <>
        <QuickExplain key={props.selectionKey || result.selection.surface} result={result} mode={props.mode} expanded={deepOpen} presentation={props.quickMode} pending={props.quickPending} />
        {props.quickPending && Boolean(result.quick.definition_en || result.quick.meaning_vi.length || result.dictionary?.senses.some(sense => sense.definitionEn || sense.meaningsVi.length)) && <p class="lookup-status lookup-enrichment-status" role="status">Finding more meanings…</p>}
        {props.loading && <p class="lookup-status" role="status">Finding context...</p>}
        {props.error && <div class="lookup-error" role="status">{props.error}</div>}
        {deepOpen && <>
          {props.geminiConnected && <div class="gemini-actions" role="group" aria-label="Gemini Context actions">
            {([['Context', 'meaning-in-context'], ['Grammar', 'grammar'], ['Simplify', 'simplify'], ['Structure', 'sentence-structure']] as const).map(([label, task]) => <button class="secondary-button compact-action" title="Uses Gemini when you request this action." onClick={() => props.onExplain?.(task)}><span aria-hidden="true">✧</span> {label}</button>)}
            <small>Uses Gemini when you request this action.</small>
          </div>}
          {deep && <ExpandedExplain result={result} deep={deep} mode={props.mode} loading={props.loading} contextResult={props.contextResult} />}
        </>}

        {(simple ? result.source === 'ai' : (contextResult?.source === 'ai' || props.geminiConnected)) && <p class="ai-caution" role="note">AI có thể mắc lỗi. Hãy kiểm tra lại thông tin quan trọng.</p>}
        <footer class="inspector-footer">
          <details class="inspector-sources"><summary><span aria-hidden="true">ⓘ</span> Sources</summary><p>{sources.length ? sources.join(' · ') : 'Local'}</p>{props.debug && <details><summary>Diagnostics</summary>{result.engine && <dl class="engine-debug"><div><dt>Provider</dt><dd>{result.engine.provider}</dd></div><div><dt>Cache</dt><dd>{result.engine.cached ? 'hit' : 'miss'}</dd></div>{result.engine.latencyMs !== undefined && <div><dt>Latency</dt><dd>{Math.round(result.engine.latencyMs)} ms</dd></div>}</dl>}<dl class="engine-debug">{Object.entries(getDiagnostics().counters).map(([name, count]) => <div key={name}><dt>{name}</dt><dd>{count}</dd></div>)}</dl></details>}</details>
        </footer>
      </>}
      </div>
    </section>
  </>;
}
