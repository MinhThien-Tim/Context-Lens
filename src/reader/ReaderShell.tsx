import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useDesktop } from '../components/useDesktop';

// Same tap convention as the Original PDF detector in `PdfPage`: primary touch, button 0,
// bounded duration, bounded movement and an unchanged scroll position.
const TAP_MS = 450;
const TAP_SLOP = 10;
// Downward reading travel required before the chrome re-quiets, so one flick cannot reveal then re-hide.
const QUIET_TRAVEL = 32;
const OVERLAY_OPEN = '.reader-more-menu,.pdf-reading-options,.pdf-more-menu,.pdf-reading-selection-wrap,.pdf-reading-selection-actions,.selection-actions';

export function ReaderShell({ children, contentsOpen, contextOpen, interfaceMode, surface, controlsLocked = false }: {
  interfaceMode: 'simple' | 'advanced'; children: ComponentChildren; contentsOpen: boolean; contextOpen: boolean;
  surface: 'text' | 'original' | 'reading'; controlsLocked?: boolean;
}) {
  const desktop = useDesktop();
  const [quiet, setQuiet] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const press = useRef<{ id: number; x: number; y: number; at: number; top: number } | null>(null);
  // A press inside the reading surface is a scroll candidate, not a control request. Original keeps its
  // existing `.pdf-page` exemption; Reading Mode gets the identical rule through its own scroll surface.
  const readingSurface = surface === 'original' ? '.pdf-page' : '.pdf-reading-scroll';
  useEffect(() => {
    setQuiet(false);
    press.current = null;
    if (desktop || controlsLocked || contentsOpen || contextOpen) return;
    let lastReadingGesture = -Infinity;
    const readingGesture = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('.reader-viewport,.pdf-scroll,.pdf-reading-scroll,[data-reader-text]')) lastReadingGesture = performance.now();
    };
    const readingKey = (event: KeyboardEvent) => {
      if (['PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', ' '].includes(event.key)) readingGesture(event);
    };
    const inReadingSurface = (target: EventTarget | null) => target instanceof Element && !!target.closest(readingSurface);
    const scrollTopNear = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>('.pdf-scroll,.pdf-reading-scroll')?.scrollTop ?? 0 : 0);
    let previousTarget: EventTarget | null = null;
    let previousTop = window.scrollY;
    let travel = 0;
    const down = (event: PointerEvent) => {
      press.current = null;
      travel = 0;
      if (!inReadingSurface(event.target)) { setQuiet(false); return; }
      if (event.pointerType === 'touch' && event.isPrimary && event.button === 0) press.current = { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now(), top: scrollTopNear(event.target) };
    };
    const move = (event: PointerEvent) => { if (press.current && Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > TAP_SLOP) press.current = null; };
    const up = (event: PointerEvent) => {
      const candidate = press.current;
      press.current = null;
      if (event.type !== 'pointerup' || !candidate || candidate.id !== event.pointerId || performance.now() - candidate.at > TAP_MS ||
        Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y) > TAP_SLOP || scrollTopNear(event.target) !== candidate.top ||
        window.getSelection()?.toString()) return;
      travel = 0;
      setQuiet(false);
    };
    const host = root.current;
    if (!host) return;
    const scroll = (event: Event) => {
      const target = event.target;
      if (target !== document && !(target instanceof Element && target.matches('.pdf-scroll,.pdf-reading-scroll'))) return;
      const top = target instanceof Element ? target.scrollTop : window.scrollY;
      const same = previousTarget === target;
      const delta = top - (same ? previousTop : 0);
      previousTarget = target; previousTop = top;
      if (!same) travel = 0;
      if (delta > 0) travel += delta; else if (delta < 0) travel = 0;
      if (window.getSelection()?.toString() || document.querySelector(OVERLAY_OPEN)) { travel = 0; return; }
      if (travel > QUIET_TRAVEL && top > 40 && performance.now() - lastReadingGesture < 1200) setQuiet(true);
      else if (delta < -8 || top < 40) setQuiet(false);
    };
    document.addEventListener('scroll', scroll, { capture: true, passive: true });
    host.addEventListener('pointerdown', down, true);
    host.addEventListener('pointermove', move, true);
    host.addEventListener('pointerup', up, true);
    host.addEventListener('pointercancel', up, true);
    document.addEventListener('wheel', readingGesture, { passive: true });
    document.addEventListener('touchmove', readingGesture, { passive: true });
    document.addEventListener('keydown', readingKey);
    return () => {
      document.removeEventListener('scroll', scroll, true);
      host.removeEventListener('pointerdown', down, true);
      host.removeEventListener('pointermove', move, true);
      host.removeEventListener('pointerup', up, true);
      host.removeEventListener('pointercancel', up, true);
      document.removeEventListener('wheel', readingGesture);
      document.removeEventListener('touchmove', readingGesture);
      document.removeEventListener('keydown', readingKey);
    };
  }, [desktop, contentsOpen, contextOpen, controlsLocked, surface]);
  return <div ref={root} data-interface-mode={interfaceMode} data-reader-surface={surface} class={`reader-shell ${contentsOpen ? 'has-contents' : ''} ${contextOpen ? 'has-context' : ''} ${quiet ? 'chrome-quiet' : ''}`} onFocusCapture={() => setQuiet(false)}>
    {children}
    {quiet && <button class="reader-reveal" aria-label="Show reading controls" onClick={() => setQuiet(false)}>Aa &#183;&#183;&#183;</button>}
  </div>;
}
