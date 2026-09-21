import { useEffect, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';
import type { PdfDocumentLocation } from '../../documents/location';

export function pageAtPosition(slots: HTMLElement[], root: HTMLElement, previous: number): number {
  const top = root.getBoundingClientRect().top + root.clientTop;
  const probe = top + Math.min(80, root.clientHeight * .2);
  const current = slots[previous - 1]?.getBoundingClientRect();
  if (current && current.top <= probe + 12 && current.bottom > probe - 12) return previous;
  const index = slots.findIndex(slot => slot.getBoundingClientRect().bottom > probe);
  return index < 0 ? slots.length : index + 1;
}

/** Passive tracking cannot navigate. Only a changed command token or initial mount can restore. */
export function usePdfScroll(rootRef: RefObject<HTMLDivElement>, selector: string, ready: boolean,
  location: PdfDocumentLocation, navigationToken: number,
  onVisible: (page: number, fraction: number, scrollY: number) => void, geometryKey?: unknown) {
  const latest = useRef({ location, onVisible });
  latest.current = { location, onVisible };
  const currentPage = useRef(location.page);
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
    latest.current.onVisible(page, fraction, root.scrollTop);
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
      const page = pageAtPosition(slots, root, currentPage.current);
      const slot = slots[page - 1];
      if (!slot) return;
      currentPage.current = page;
      const fraction = Math.max(0, Math.min(1, (root.getBoundingClientRect().top + root.clientTop - slot.getBoundingClientRect().top) / Math.max(1, slot.offsetHeight)));
      latest.current.onVisible(page, fraction, root.scrollTop);
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(track); };
    root.addEventListener('scroll', schedule, { passive: true });
    return () => { root.removeEventListener('scroll', schedule); cancelAnimationFrame(raf); };
  }, [ready, selector]);
  // Resize/zoom preserves the current visual fraction, independently of navigation commands.
  const oldGeometry = useRef(geometryKey);
  useEffect(() => {
    if (ready && oldGeometry.current !== geometryKey) navigate(latest.current.location.page, latest.current.location.pageOffset ?? 0);
    oldGeometry.current = geometryKey;
  }, [ready, geometryKey]);
  return navigate;
}
