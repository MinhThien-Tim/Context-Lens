import type { PDFPageProxy } from 'pdfjs-dist';

const leases = new WeakMap<PDFPageProxy, number>();
/** A stale render must never clean a proxy already reused by a newer render. */
export function acquirePage(page: PDFPageProxy) {
  leases.set(page, (leases.get(page) ?? 0) + 1);
  let released = false;
  return (settled: Promise<unknown> = Promise.resolve()) => {
    if (released) return;
    released = true;
    void settled.catch(() => {}).then(() => {
      const remaining = (leases.get(page) ?? 1) - 1;
      if (remaining > 0) leases.set(page, remaining);
      else { leases.delete(page); page.cleanup(); }
    });
  };
}
