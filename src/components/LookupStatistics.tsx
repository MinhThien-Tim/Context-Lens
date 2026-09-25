import { useEffect, useRef, useState } from 'preact/hooks';
import { getDiagnostics, resetDiagnostics } from '../core/diagnostics';

export function LookupStatistics() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [counters, setCounters] = useState(() => getDiagnostics().counters);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    const refresh = () => setCounters(getDiagnostics().counters);
    if (!open) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { close(); rootRef.current?.querySelector<HTMLButtonElement>('.stats-trigger')?.focus(); }
    };
    const pointerdown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) close();
    };
    const timer = window.setInterval(refresh, 1000);
    document.addEventListener('keydown', keydown);
    document.addEventListener('pointerdown', pointerdown);
    return () => {
      clearInterval(timer);
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('pointerdown', pointerdown);
    };
  }, [open]);

  const reset = () => {
    resetDiagnostics();
    setCounters(getDiagnostics().counters);
  };
  const row = (label: string, value: number) => <div class="stats-row"><dt>{label}</dt><dd>{value.toLocaleString()}</dd></div>;

  return <div class="stats-anchor" ref={rootRef}>
    <button class="nav-button stats-trigger" type="button" aria-label="Lookup statistics" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setCounters(getDiagnostics().counters); setOpen(value => !value); }}>
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 19V5m0 14h17M8 16v-4m4 4V8m4 8v-6m4 6V5"/></svg><span>Stats</span>
    </button>
    {open && <section class="stats-popover" role="dialog" aria-label="Lookup statistics" tabIndex={-1}>
      <header class="stats-heading"><h2>Statistics</h2><button class="stats-close" type="button" aria-label="Close statistics" onClick={close}>×</button></header>
      <section class="stats-section stats-quick" aria-labelledby="stats-quick-title">
        <h3 id="stats-quick-title">Quick Lookup</h3>
        <dl>{row('Total lookup', counters.quickLookup)}{row('Local stop', counters.localStop)}{row('Wiktionary stop', counters.wiktionary)}{row('MyMemory accept', counters.mymemoryAccept)}{row('MyMemory uncertain', counters.mymemoryUncertain)}{row('MyMemory reject', counters.mymemoryReject)}{row('Actual Google requests', counters.googleFallback)}{row('Translation cache hits', counters.cacheHit)}</dl>
      </section>
      <section class="stats-section stats-gemini" aria-labelledby="stats-gemini-title">
        <h3 id="stats-gemini-title">Gemini</h3>
        <dl>{row('Gemini actions', counters.geminiAction)}{row('Gemini cache hits', counters.contextCacheHit)}{row('Actual Gemini requests', counters.geminiRequest)}</dl>
      </section>
      <footer class="stats-footer"><button class="text-button" type="button" onClick={reset}>Reset</button></footer>
    </section>}
  </div>;
}
