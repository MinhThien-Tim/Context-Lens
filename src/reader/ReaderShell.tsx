import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useDesktop } from '../components/useDesktop';
import { clearProgrammaticScroll, isProgrammaticScroll } from './programmaticScroll';

// Reader Behavior Contract §6.0/§6.1: quiet and reveal share ONE travel constant applied in opposite
// directions, so a deliberate 32px commitment to quiet is not undone by an incidental upward twitch.
const CHROME_TRAVEL = 32;
// Contract §6.0: reaching the true content top always reveals chrome, with no travel threshold.
const CONTENT_TOP = 40;
// §5.2 how long a real gesture keeps authorising the scroll deltas it produces. This bounds the lifetime
// of one gesture's momentum; it never decides whether a scroll was user-driven. That is declared
// explicitly by whoever moved the content, so a jump landing inside a live momentum window stays
// unclassified instead of being mistaken for travel.
const GESTURE_WINDOW = 1200;
// Contract §6.4: only focus entering real Reader chrome reveals it. The reading surface, page content
// and selection handles are not chrome and must never reveal.
const CHROME = '.reader-header,.reader-progress,.reader-reveal';
// §4.4/§9.8: any open Reader overlay blocks quieting. Contract §3.6 makes More the only popup
// architecture, so the former `.pdf-more-menu` entries are gone with the deleted PDF zoom popover.
const OVERLAY_OPEN = '.reader-more-menu,.pdf-reading-options,.pdf-reading-selection-wrap,.pdf-reading-selection-actions,.selection-actions';

export function ReaderShell({ children, contentsOpen, contextOpen, interfaceMode, surface, controlsLocked = false }: {
  interfaceMode: 'simple' | 'advanced'; children: ComponentChildren; contentsOpen: boolean; contextOpen: boolean;
  surface: 'text' | 'original' | 'reading'; controlsLocked?: boolean;
}) {
  const desktop = useDesktop();
  const [quiet, setQuiet] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // Travel lives in the effect closure; this ref lets the reveal control reset it without lifting state.
  const resetTravel = useRef<() => void>(() => {});

  useEffect(() => {
    setQuiet(false);
    // §4.3 quiet is a Mobile Chrome state only; §4.4 a blocking overlay or locked controls keep chrome shown.
    if (desktop || controlsLocked || contentsOpen || contextOpen) return;
    let lastReadingGesture = -Infinity;
    let previousTarget: EventTarget | null = null;
    let previousTop = window.scrollY;
    let downTravel = 0;
    let upTravel = 0;

    // §5.2 only real input counts as reading travel: a wheel, a touchmove or a paging key over the
    // reading surface marks the following scroll deltas as user-driven.
    const readingGesture = (event: Event) => {
      // A real gesture is authoritative: it cancels any pending declaration so a user scroll that
      // happens to land on the same position is still counted as real travel (§5.2).
      clearProgrammaticScroll();
      if (event.target instanceof Element && event.target.closest('.reader-viewport,.pdf-scroll,.pdf-reading-scroll,[data-reader-text]')) lastReadingGesture = performance.now();
    };
    const readingKey = (event: KeyboardEvent) => {
      if (['PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', ' '].includes(event.key)) readingGesture(event);
    };
    const scroll = (event: Event) => {
      const target = event.target;
      if (target !== document && !(target instanceof Element && target.matches('.pdf-scroll,.pdf-reading-scroll'))) return;
      const top = target instanceof Element ? target.scrollTop : window.scrollY;
      const same = previousTarget === target;
      const delta = top - (same ? previousTop : 0);
      previousTarget = target; previousTop = top;
      // §5.1/§5.2 a programmatic scroll is identified by whoever produced it, not by guessing from
      // timing. It is matched positionally and consumed once, so the jump neither feeds the
      // accumulator nor drives a transition; the next real gesture accumulates normally again.
      if (isProgrammaticScroll(target, top)) { downTravel = 0; upTravel = 0; previousTop = top; return; }
      // §6.2 the accumulator resets on any direction change BEFORE the new travel is applied.
      if (!same) { downTravel = 0; upTravel = 0; }
      if (delta > 0) { downTravel += delta; upTravel = 0; }
      else if (delta < 0) { upTravel -= delta; downTravel = 0; }
      // §4.4 an open overlay or a live text selection keeps chrome shown and drops accumulated travel.
      if (window.getSelection()?.toString() || document.querySelector(OVERLAY_OPEN)) { downTravel = 0; upTravel = 0; return; }
      const reading = performance.now() - lastReadingGesture < GESTURE_WINDOW;
      // §6.0/§6.3 transitions are driven by the accumulated total only. A single-event delta of any size
      // never reveals, and quiet additionally requires having travelled away from the true content top.
      if (reading && downTravel >= CHROME_TRAVEL && top > CONTENT_TOP) setQuiet(true);
      else if (top <= CONTENT_TOP || (reading && upTravel >= CHROME_TRAVEL)) setQuiet(false);
    };

    document.addEventListener('scroll', scroll, { capture: true, passive: true });
    document.addEventListener('wheel', readingGesture, { passive: true });
    document.addEventListener('touchmove', readingGesture, { passive: true });
    document.addEventListener('keydown', readingKey);
    resetTravel.current = () => { downTravel = 0; upTravel = 0; };
    return () => {
      document.removeEventListener('scroll', scroll, true);
      document.removeEventListener('wheel', readingGesture);
      document.removeEventListener('touchmove', readingGesture);
      document.removeEventListener('keydown', readingKey);
      resetTravel.current = () => {};
    };
  }, [desktop, contentsOpen, contextOpen, controlsLocked, surface]);

  return <div ref={root} data-interface-mode={interfaceMode} data-reader-surface={surface} class={`reader-shell ${contentsOpen ? 'has-contents' : ''} ${contextOpen ? 'has-context' : ''} ${quiet ? 'chrome-quiet' : ''}`} onFocusCapture={(event) => { if (event.target instanceof Element && event.target.closest(CHROME)) { resetTravel.current(); setQuiet(false); } }}>
    {children}
    {quiet && <button class="reader-reveal" aria-label="Show reading controls" onClick={() => { resetTravel.current(); setQuiet(false); }}>Aa &#183;&#183;&#183;</button>}
  </div>;
}