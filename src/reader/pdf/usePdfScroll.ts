import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';
import type { PdfDocumentLocation } from '../../documents/location';
import { expectProgrammaticScroll } from '../programmaticScroll';

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

export function dominantPageAtPosition(slots: HTMLElement[], root: HTMLElement): number {
  const top = root.getBoundingClientRect().top + root.clientTop;
  const bottom = top + root.clientHeight;
  let page = 1, greatestOverlap = -1;
  slots.forEach((slot, index) => {
    const rect = slot.getBoundingClientRect();
    const overlap = Math.max(0, Math.min(rect.bottom, bottom) - Math.max(rect.top, top));
    if (overlap > greatestOverlap) { page = index + 1; greatestOverlap = overlap; }
  });
  return page;
}

/** Passive tracking cannot navigate. Only a changed command token or initial mount can restore. */
export function usePdfScroll(rootRef: RefObject<HTMLDivElement>, selector: string, ready: boolean,
  location: PdfDocumentLocation, navigationToken: number,
  onVisible: (page: number, fraction: number, scrollY: number, visiblePage: number, dominantPage: number) => void, geometryKey?: unknown) {
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
    // CHR-1: at the overlay bands the scroll container carries the chrome clearance as its own top
    // padding. Aligning a slot's top to the content edge would scroll that padding away and park the
    // page under the overlaying Header, so the inset is subtracted from the alignment target. The
    // desktop chrome is in flow and leaves the marker unset, keeping the previous alignment.
    const styles = getComputedStyle(root);
    const inset = styles.getPropertyValue('--reader-chrome-overlay').trim() === '1'
      ? Number.parseFloat(styles.paddingTop) || 0
      : 0;
    const target = root.scrollTop + slot.getBoundingClientRect().top - root.getBoundingClientRect().top - root.clientTop + slot.offsetHeight * Math.max(0, Math.min(1, fraction)) - inset;
    // §5.1/§5.2 the Reader must not read this jump as user reading travel, so the resulting position is
    // declared before it is observed rather than being told apart from a gesture after the fact.
    expectProgrammaticScroll(target, root);
    root.scrollTop = target;
    commandedTop.current = root.scrollTop;
    latest.current.onVisible(page, fraction, root.scrollTop, page, page);
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
      const dominantPage = dominantPageAtPosition(slots, root);
      // Keep hysteresis separate from the dominant page and persist the page
      // crossing the viewport top so restoring cannot skip visible text.
      const top = root.getBoundingClientRect().top + root.clientTop;
      const anchor = slots.findIndex(slot => slot.getBoundingClientRect().bottom > top);
      const page = anchor < 0 ? slots.length : anchor + 1;
      const slot = slots[page - 1];
      if (!slot) return;
      currentPage.current = visiblePage;
      const fraction = Math.max(0, Math.min(1, (top - slot.getBoundingClientRect().top) / Math.max(1, slot.offsetHeight)));
      latest.current.onVisible(page, fraction, root.scrollTop, visiblePage, dominantPage);
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
