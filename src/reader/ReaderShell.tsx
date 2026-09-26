import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useDesktop } from '../components/useDesktop';

export function ReaderShell({ children, contentsOpen, contextOpen, interfaceMode, surface, controlsLocked = false }: {
  interfaceMode: 'simple' | 'advanced'; children: ComponentChildren; contentsOpen: boolean; contextOpen: boolean;
  surface: 'text' | 'original' | 'reading'; controlsLocked?: boolean;
}) {
  const desktop = useDesktop();
  const [quiet, setQuiet] = useState(false);
  useEffect(() => {
    setQuiet(false);
    if (desktop || controlsLocked || contentsOpen || contextOpen) return;
    let lastReadingGesture = -Infinity;
    const readingGesture = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('.reader-viewport,.pdf-scroll,.pdf-reading-scroll,[data-reader-text]')) lastReadingGesture = performance.now();
    };
    const readingKey = (event: KeyboardEvent) => {
      if (['PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', ' '].includes(event.key)) readingGesture(event);
    };
    let previousTarget: EventTarget | null = null;
    let previousTop = window.scrollY;
    const scroll = (event: Event) => {
      const target = event.target;
      if (target !== document && !(target instanceof Element && target.matches('.pdf-scroll,.pdf-reading-scroll'))) return;
      const top = target instanceof Element ? target.scrollTop : window.scrollY;
      const delta = top - (previousTarget === target ? previousTop : 0);
      previousTarget = target; previousTop = top;
      if (window.getSelection()?.toString() || document.querySelector('.reader-more-menu,.pdf-reading-options,.pdf-more-menu,.pdf-reading-selection-wrap,.selection-actions')) return;
      if (delta > 8 && top > 40 && performance.now() - lastReadingGesture < 1200) setQuiet(true);
      else if (delta < -8 || top < 40) setQuiet(false);
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
  return <div data-interface-mode={interfaceMode} data-reader-surface={surface} class={`reader-shell ${contentsOpen ? 'has-contents' : ''} ${contextOpen ? 'has-context' : ''} ${quiet ? 'chrome-quiet' : ''}`}
    onPointerDownCapture={() => setQuiet(false)} onFocusCapture={() => setQuiet(false)}>
    {children}
    {quiet && <button class="reader-reveal" aria-label="Show reading controls" onClick={() => setQuiet(false)}>Aa &#183;&#183;&#183;</button>}
  </div>;
}
