// Contract §5.1/§5.2: programmatic movement — a page jump, zoom re-pagination, a mode switch, geometry
// reconciliation or saved-position restoration — must neither quiet nor reveal the Chrome, and must not
// feed its travel accumulator.
//
// A programmatic `scrollTop` assignment fires the same trusted scroll event as a wheel, so a Reader
// cannot tell the two apart by recency or by `isTrusted`. Whoever performs the move declares the
// scroll position it produces; the Chrome state machine ignores exactly that position once and then
// resumes normal accumulation. Attribution is therefore positional and deterministic instead of
// time-based, and the default is always "treat as ordinary scroll" rather than "treat as user travel".
let expected: { top: number; target: EventTarget | null } | null = null;

/** Declares the scroll position a programmatic move is about to produce on `target`. */
export function expectProgrammaticScroll(top: number, target: EventTarget | null): void {
  expected = { top, target };
}

/**
 * Consumes a declared programmatic scroll. Matching is strict on both target and position, so a
 * normal user scroll that merely lands near the declared value is still treated as real travel.
 */
export function isProgrammaticScroll(target: EventTarget | null, top: number): boolean {
  if (!expected || expected.target !== target) return false;
  if (Math.abs(expected.top - top) >= 1) return false;
  expected = null;
  return true;
}

/** Drops any pending declaration; a real reading gesture always wins over a stale declaration. */
export function clearProgrammaticScroll(): void {
  expected = null;
}