import type { DocumentRecord } from '../db/database';
import type { DocumentLocation } from '../documents/location';

export function indexAtOffset(offsets: number[] | undefined, offset: number): number {
  if (!offsets?.length) return 0;
  const next = offsets.findIndex(value => value > offset);
  return next < 0 ? offsets.length - 1 : Math.max(0, next - 1);
}

export function locationAtOffset(doc: DocumentRecord, offset: number): DocumentLocation {
  const absoluteOffset = Math.max(0, Math.min(doc.content.length, offset));
  const base = { absoluteOffset, scrollY: window.scrollY, progress: doc.content.length ? absoluteOffset / doc.content.length : 0, updatedAt: Date.now() };
  if (doc.kind === 'pdf') return { ...base, kind: 'pdf', page: indexAtOffset(doc.pageOffsets, absoluteOffset) + 1 };
  if (doc.kind === 'epub') return { ...base, kind: 'epub', chapter: indexAtOffset(doc.chapterOffsets, absoluteOffset) + 1, cfi: null };
  return { ...base, kind: 'text', sectionId: doc.toc?.filter(item => item.offset !== undefined && item.offset <= absoluteOffset).at(-1)?.id };
}

export function positionLabel(doc: DocumentRecord, location: DocumentLocation): string {
  const percent = `${Math.round(location.progress * 100)}%`;
  if (doc.kind === 'pdf' && location.kind === 'pdf' && doc.pageOffsets?.length) return `${location.page} / ${doc.pageOffsets.length}`;
  if (doc.kind === 'epub' && location.kind === 'epub' && doc.chapterOffsets?.length) return `Chapter ${location.chapter} / ${doc.chapterOffsets.length} · ${percent}`;
  return percent;
}

export function navigationOffset(doc: DocumentRecord, value: number): number | null {
  const offsets = doc.kind === 'pdf' ? doc.pageOffsets : doc.kind === 'epub' ? doc.chapterOffsets : undefined;
  if (offsets?.length) return Number.isInteger(value) && value >= 1 && value <= offsets.length ? offsets[value - 1] : null;
  return Number.isFinite(value) && value >= 0 && value <= 100 ? Math.round(doc.content.length * value / 100) : null;
}

export function keyboardCanNavigate(event: KeyboardEvent): boolean {
  return !event.defaultPrevented && !event.ctrlKey && !event.metaKey && !event.altKey && !(event.target instanceof Element && event.target.closest('input,textarea,select,button,a,[contenteditable="true"],[role="dialog"]')) && !document.querySelector('[aria-modal="true"]') && !window.getSelection()?.toString();
}

export function rangeAtOffset(root: HTMLElement, offset: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, offset);
  let last: Node | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    last = node;
    if (remaining < (node.textContent?.length ?? 0)) {
      const range = document.createRange(); range.setStart(node, remaining); range.setEnd(node, remaining + 1); return range;
    }
    remaining -= node.textContent?.length ?? 0;
  }
  if (!last) return null;
  const range = document.createRange(); range.selectNodeContents(last); range.collapse(false); return range;
}

export function jumpToOffset(offset: number): void {
  const root = document.querySelector<HTMLElement>('[data-reader-text]');
  if (!root) return;
  const range = rangeAtOffset(root, offset);
  const rect = range?.getBoundingClientRect?.();
  if (rect) window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - 110), behavior: 'auto' });
  root.focus({ preventScroll: true });
  const element = range?.startContainer.parentElement;
  element?.classList.add('location-target');
  window.setTimeout(() => element?.classList.remove('location-target'), 1400);
}

export function visibleOffset(): number | undefined {
  const root = document.querySelector<HTMLElement>('[data-reader-text]');
  if (!root) return undefined;
  const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null; caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  const bounds = root.getBoundingClientRect();
  const x = bounds.left + 1, y = Math.max(110, bounds.top + 1);
  const caret = doc.caretRangeFromPoint?.(x, y);
  const position = doc.caretPositionFromPoint?.(x, y);
  const node = caret?.startContainer ?? position?.offsetNode;
  if (node && root.contains(node)) {
    const before = document.createRange(); before.selectNodeContents(root); before.setEnd(node, caret?.startOffset ?? position!.offset); return before.toString().length;
  }
  let offset = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const range = document.createRange(); range.selectNodeContents(node);
    if ((range.getBoundingClientRect?.().bottom ?? 0) >= 110) return offset;
    offset += node.textContent?.length ?? 0;
  }
  return offset;
}
