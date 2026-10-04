import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useDesktop } from '../components/useDesktop';

// Reader Behavior Contract §6.0/§6.1: quiet and reveal share ONE travel constant applied in opposite
// directions, so a deliberate 32px commitment to quiet is not undone by an incidental upward twitch.
const CHROME_TRAVEL = 32;
// Contract §6.0: reaching the true content top always reveals chrome, with no travel threshold.
const CONTENT_TOP = 40;
// Contract §6.4: only focus entering real Reader chrome reveals it. The reading surface, page content
// and selection handles are not chrome and must never reveal.
const CHROME = '.reader-header,.reader-progress,.reader-reveal';
const OVERLAY_OPEN = '.reader-more-menu,.pdf-reading-options,.pdf-more-menu,.pdf-reading-selection-wrap,.pdf-reading-selection-actions,.selection-actions';

export function ReaderShell({ children, contentsOpen, contextOpen, interfaceMode, surface, controlsLocked = false }: {
  interfaceMode: 'simple' | 'advanced'; children: ComponentChildren; contentsOpen: boolean; contextOpen: boolean;
  surface: 'text' | 'original' | 'reading'; controlsLocked?: boolean;
}) {
  const desktop = useDesktop();
  const [quiet, setQuiet] = useState(false);
  const root = useRef<HTMLDivElement>(null);
    useEffect(() => {
      setQuiet(false);
      // §4.3 quiet is a Mobile Chrome state only; §4.4 a blocking overlay or locked controls keep chrome shown.
      if (desktop || controlsLocked || contentsOpen || contextOpen) return;
      let lastReadingGesture = -Infinity;
      // §5.2 only real input counts as reading travel: a wheel, a touchmove or a paging key over the
      // reading surface marks the following scroll deltas as user-driven.
      const readingGesture = (event: Event) => {
        if (event.target instanceof Element && event.target.closest('.reader-viewport,.pdf-scroll,.pdf-reading-scroll,[data-reader-text]')) lastReadingGesture = performance.now();
      };
      const readingKey = (event: KeyboardEvent) => {
        if (['PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', ' '].includes(event.key)) readingGesture(event);
      };
      let previousTarget: EventTarget | null = null;
      let previousTop = window.scrollY;
      let downTravel = 0;
      let upTravel = 0;
      const scroll = (event: Event) => {
        const target = event.target;
        if (target !== document && !(target instanceof Element && target.matches('.pdf-scroll,.pdf-reading-scroll'))) return;
        const top = target instanceof Element ? target.scrollTop : window.scrollY;
        const same = previousTarget === target;
        const delta = top - (same ? previousTop : 0);
        previousTarget = target; previousTop = top;
        // §6.2 the accumulator resets on any direction change BEFORE the new travel is applied.
        if (!same) { downTravel = 0; upTravel = 0; }
        if (delta > 0) { downTravel += delta; upTravel = 0; }
        else if (delta < 0) { upTravel -= delta; downTravel = 0; }
        // §4.4 an open overlay or a live text selection keeps chrome shown and drops accumulated travel.
        if (window.getSelection()?.toString() || document.querySelector(OVERLAY_OPEN)) { downTravel = 0; upTravel = 0; return; }
        const reading = performance.now() - lastReadingGesture < 1200;
        // §6.0/§6.3 transitions are driven by the accumulated total only. A single-event delta of any size
        // never reveals, and quiet additionally requires having travelled away from the true content top.
        if (reading && downTravel >= CHROME_TRAVEL && top > CONTENT_TOP) setQuiet(true);
        else if (top <= CONTENT_TOP || (reading && upTravel >= CHROME_TRAVEL)) setQuiet(false);
      };
      document.addEventListener('scroll', scroll, { capture: true, passive: true });
      document.addEventListener('wheel', readingGesture, { passive: true });
      document.addEventListener('touchmove', readingGesture, { passive: true });
      document.addEventListener('keydown', readingKey);
      return () => {
        document.removeEventListener('scroll', scroll, true);
        document.removeEventListener('wheel', readingGesture);
        document.removeEventListener('touchmove', readingGesture);
        document.removeEventListener('keydown', readingKey);
      };
    }, [desktop, contentsOpen, contextOpen, controlsLocked, surface]);
      return <div ref={root} data-interface-mode={interfaceMode} data-reader-surface={surface} class={`reader-shell ${contentsOpen ? 'has-contents' : ''} ${contextOpen ? 'has-context' : ''} ${quiet ? 'chrome-quiet' : ''}`} onFocusCapture={(event) => { if (event.target instanceof Element && event.target.closest(CHROME)) setQuiet(false); }}>
    {children}
    {quiet && <button class="reader-reveal" aria-label="Show reading controls" onClick={() => setQuiet(false)}>Aa &#183;&#183;&#183;</button>}
  </div>;
}
