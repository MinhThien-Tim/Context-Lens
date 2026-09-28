import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';
import type { PdfDocumentLocation } from '../../documents/location';

export function pageAtPosition(slots: HTMLElement[], root: HTMLElement, previous: number): number {
  const top = root.getBoundingClientRect().top + root.clientTop;
  const bottom = top + root.clientHeight;
  const probe = top + root.clientHeight * .5;
  const current = slots[previous - 1]?.getBoundingClientRect();
  if (current) {
    const visible = Math.max(0, Math.min(current.bottom, bottom) - Math.max(current.top, top));
    if (root.clientHeight > 0 && visible >= Math.min(current.height, root.clientHeight) * .45) return previous;
  }
  const index = slots.findIndex(slot => slot.getBoundingClientRect().bottom > probe);
  return index < 0 ? slots.length : index + 1;
}

/** Passive tracking cannot navigate. Only a changed command token or initial mount can restore. */
export function usePdfScroll(rootRef: RefObject<HTMLDivElement>, selector: string, ready: boolean,
  location: PdfDocumentLocation, navigationToken: number,
  onVisible: (page: number, fraction: number, scrollY: number, visiblePage: number) => void, geometryKey?: unknown) {
  const latest = useRef({ location, onVisible });
  latest.current = { location, onVisible };
  const currentPage = useRef(location.page);
  const horizontalAnchor = useRef(.5);
  const commandedTop = useRef<number | undefined>(undefined);
  const navigate = (page: number, fraction = 0) => {
    const root = rootRef.current;
    const slots = root?.querySelectorAll<HTMLElement>(selector);
    if (!root || !slots?.length) return;
    page = Math.max(1, Math.min(slots.length, page));
    const slot = slots[page - 1];
    currentPage.current = page;
    root.scrollTop = root.scrollTop + slot.getBoundingClientRect().top - root.getBoundingClientRect().top - root.clientTop + slot.offsetHeight * Math.max(0, Math.min(1, fraction));
    commandedTop.current = root.scrollTop;
    latest.current.onVisible(page, fraction, root.scrollTop, page);
  };
  useEffect(() => {
    if (!ready) return;
    navigate(latest.current.location.page, latest.current.location.pageOffset ?? 0);
  }, [ready, navigationToken]);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !ready) return;
    let raf = 0;
    const track = () => {
      raf = 0;
      const commanded = commandedTop.current;
      commandedTop.current = undefined;
      if (commanded !== undefined && Math.abs(root.scrollTop - commanded) < 1) return;
      const slots = Array.from(root.querySelectorAll<HTMLElement>(selector));
      const reference = slots[currentPage.current - 1];
      if (reference?.offsetWidth) {
        const viewport = root.getBoundingClientRect();
        horizontalAnchor.current = Math.max(0, Math.min(1,
          (viewport.left + root.clientLeft + root.clientWidth / 2 - reference.getBoundingClientRect().left) / reference.offsetWidth));
      }
      const visiblePage = pageAtPosition(slots, root, currentPage.current);
      // Visibility hysteresis is for rendering. Persist the page crossing the
      // viewport's top so restoring page + fraction cannot skip visible text.
      const top = root.getBoundingClientRect().top + root.clientTop;
      const anchor = slots.findIndex(slot => slot.getBoundingClientRect().bottom > top);
      const page = anchor < 0 ? slots.length : anchor + 1;
      const slot = slots[page - 1];
      if (!slot) return;
      currentPage.current = visiblePage;
      const fraction = Math.max(0, Math.min(1, (top - slot.getBoundingClientRect().top) / Math.max(1, slot.offsetHeight)));
      latest.current.onVisible(page, fraction, root.scrollTop, visiblePage);
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(track); };
    root.addEventListener('scroll', schedule, { passive: true });
    return () => { root.removeEventListener('scroll', schedule); cancelAnimationFrame(raf); };
  }, [ready, selector]);
  // Resize/zoom preserves the current visual fraction, independently of navigation commands.
  const oldGeometry = useRef(geometryKey);
  useLayoutEffect(() => {
    if (ready && oldGeometry.current !== geometryKey) {
      navigate(latest.current.location.page, latest.current.location.pageOffset ?? 0);
      const root = rootRef.current;
      const slot = root?.querySelectorAll<HTMLElement>(selector)[latest.current.location.page - 1];
      if (root && slot) root.scrollLeft += slot.getBoundingClientRect().left - root.getBoundingClientRect().left - root.clientLeft +
        slot.offsetWidth * horizontalAnchor.current - root.clientWidth / 2;
    }
    oldGeometry.current = geometryKey;
  }, [ready, geometryKey]);
  return navigate;
}
