import { useEffect, useRef, useState } from 'preact/hooks';
import { getDiagnostics, groupDiagnosticDetails, resetDiagnostics, type DiagnosticDetail, type DiagnosticEvent } from '../core/diagnostics';

const rows: Array<{ event: DiagnosticEvent; label: string }> = [
  { event: 'quickLookup', label: 'Total lookup' }, { event: 'localStop', label: 'Local stop' }, { event: 'wiktionary', label: 'Wiktionary stop' },
  { event: 'mymemoryAccept', label: 'MyMemory accept' }, { event: 'mymemoryUncertain', label: 'MyMemory uncertain' }, { event: 'mymemoryReject', label: 'MyMemory reject' },
  { event: 'googleFallback', label: 'Actual Google requests' }, { event: 'translationCacheHit', label: 'Translation cache hits' },
  { event: 'googleContextResolved', label: 'Google context resolved' }, { event: 'googleUnresolved', label: 'Google unresolved' },
  { event: 'google429', label: 'Google 429' }, { event: 'googleError', label: 'Google network/error' },
  { event: 'googleCircuitSkip', label: 'Google circuit-breaker skips' }, { event: 'pendingDedupeHit', label: 'Pending-request dedupe hits' },
  { event: 'geminiAction', label: 'Gemini actions' }, { event: 'geminiCacheHit', label: 'Gemini cache hits' }, { event: 'geminiRequest', label: 'Actual Gemini requests' }
];
const modeLabels: Record<string, string> = { 'meaning-in-context': 'Context', grammar: 'Grammar', simplify: 'Simplify', 'sentence-structure': 'Structure' };
const modeLabel = (mode?: string) => mode ? modeLabels[mode] ?? mode : undefined;
const eventLabel = (event: DiagnosticEvent) => rows.find(row => row.event === event)?.label ?? (event === 'contextCacheHit' ? 'Context cache hit' : event);

function relatedRoute(lookup: DiagnosticDetail, details: DiagnosticDetail[]): DiagnosticDetail[] {
  if (!lookup.normalizedText) return [];
  const nextLookup = details.find(item => item.event === 'quickLookup' && item.normalizedText === lookup.normalizedText && item.timestamp > lookup.timestamp);
  const end = Math.min(lookup.timestamp + 30_000, nextLookup?.timestamp ?? Infinity);
  return details.filter(item => item.normalizedText === lookup.normalizedText && item.timestamp >= lookup.timestamp && item.timestamp <= end && item.event !== 'quickLookup' && item.event !== 'geminiAction');
}

export function LookupStatistics() {
  const rootRef = useRef<HTMLDivElement>(null);
  const initial = getDiagnostics();
  const [counters, setCounters] = useState(initial.counters);
  const [details, setDetails] = useState(initial.details);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<DiagnosticEvent | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const refresh = () => { const snapshot = getDiagnostics(); setCounters(snapshot.counters); setDetails(snapshot.details); };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { close(); rootRef.current?.querySelector<HTMLButtonElement>('.stats-trigger')?.focus(); }
    };
    const pointerdown = (event: PointerEvent) => { if (event.target instanceof Node && !rootRef.current?.contains(event.target)) close(); };
    const timer = window.setInterval(refresh, 1000);
    document.addEventListener('keydown', keydown);
    document.addEventListener('pointerdown', pointerdown);
    return () => { clearInterval(timer); document.removeEventListener('keydown', keydown); document.removeEventListener('pointerdown', pointerdown); };
  }, [open]);

  const reset = () => {
    resetDiagnostics(); setSelected(null); setExpanded(null);
    const snapshot = getDiagnostics(); setCounters(snapshot.counters); setDetails(snapshot.details);
  };
  const grouped = (event: DiagnosticEvent) => groupDiagnosticDetails(details, event).sort((a, b) => b.detail.timestamp - a.detail.timestamp);
  const counterRow = (event: DiagnosticEvent) => {
    const row = rows.find(item => item.event === event)!;
    const value = counters[event];
    return <div class="stats-row" key={event}><dt>{row.label}</dt><dd>{value ? <button type="button" class="stats-value" aria-label={`${row.label}, ${value} records`} onClick={() => { setExpanded(null); setSelected(event); }}>{value.toLocaleString()} <span aria-hidden="true">›</span></button> : <span class="stats-value">0</span>}</dd></div>;
  };

  return <div class="stats-anchor" ref={rootRef}>
    <button class="nav-button stats-trigger" type="button" aria-label="Lookup statistics" aria-haspopup="dialog" aria-expanded={open} onClick={() => { const snapshot = getDiagnostics(); setCounters(snapshot.counters); setDetails(snapshot.details); setSelected(null); setExpanded(null); setOpen(value => !value); }}>
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 19V5m0 14h17M8 16v-4m4 4V8m4 8v-6m4 6V5"/></svg><span>Stats</span>
    </button>
    {open && <section class="stats-popover" role="dialog" aria-label="Lookup statistics" tabIndex={-1}>
      <header class="stats-heading">{selected ? <><button class="stats-back" type="button" onClick={() => { setSelected(null); setExpanded(null); }}>‹ <span>Statistics</span></button><h2>{eventLabel(selected)}</h2></> : <h2>Statistics</h2>}<button class="stats-close" type="button" aria-label="Close statistics" onClick={close}>×</button></header>
      {selected ? <>
        <p class="stats-detail-count">{counters[selected].toLocaleString()} {selected === 'quickLookup' ? 'lookups' : 'events'} · recent details</p>
        <div class="stats-detail-list" role="region" aria-label={`${eventLabel(selected)} details`}>
          {grouped(selected).map(group => {
            const key = `${group.detail.normalizedText}\u0000${group.detail.event}\u0000${group.detail.mode ?? ''}`;
            const route = selected === 'quickLookup' ? relatedRoute(group.detail, details) : [];
            return <div class="stats-detail-item" key={key}>
              <button type="button" class="stats-detail-term" aria-expanded={expanded === key} onClick={() => setExpanded(expanded === key ? null : key)}><span>{group.detail.text}</span><small>×{group.count}{group.detail.mode ? ` · ${modeLabel(group.detail.mode)}` : ''}</small></button>
              {expanded === key && <div class="stats-route">{route.length ? route.map((item, index) => <div key={`${item.event}-${item.timestamp}-${index}`}><span>{eventLabel(item.event)}{item.status && item.status !== 'request' ? ` · ${item.status}` : item.status === 'request' ? ' · request started' : ''}</span>{item.mode && <small>{modeLabel(item.mode)}</small>}</div>) : <span>{selected === 'quickLookup' ? 'No route detail recorded' : `${eventLabel(group.detail.event)}${group.detail.status ? ` · ${group.detail.status}` : ''}${group.detail.provider ? ` · ${group.detail.provider}` : ''}`}</span>}</div>}
            </div>;
          })}
          {!grouped(selected).length && <p class="stats-no-details">No selected text in the recent runtime history.</p>}
        </div>
      </> : <>
        <section class="stats-section stats-quick" aria-labelledby="stats-quick-title"><h3 id="stats-quick-title">Quick Lookup</h3><dl>{rows.slice(0, 8).map(row => counterRow(row.event))}</dl></section>
        <section class="stats-section stats-gemini" aria-labelledby="stats-gemini-title"><h3 id="stats-gemini-title">Gemini</h3><dl>{rows.slice(8).map(row => counterRow(row.event))}</dl></section>
      </>}
      <footer class="stats-footer"><button class="text-button" type="button" onClick={reset}>Reset</button></footer>
    </section>}
  </div>;
}
