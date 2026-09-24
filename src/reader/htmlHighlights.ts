import type { ReaderHighlight } from '../db/database';

/** Decorate rich reader HTML without changing the stored sanitized HTML. */
export function renderHtmlHighlights(root: HTMLElement, highlights: ReaderHighlight[]): void {
  for (const mark of Array.from(root.querySelectorAll('mark[data-reader-markup]'))) {
    mark.replaceWith(document.createTextNode(mark.textContent ?? ''));
  }
  root.normalize();

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Array<{ node: Text; start: number; end: number }> = [];
  let offset = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    const length = text.data.length;
    nodes.push({ node: text, start: offset, end: offset + length });
    offset += length;
  }

  const usable = highlights.filter(item => item.ocrPage === undefined).sort((a, b) => a.startOffset - b.startOffset);
  for (const entry of nodes) {
    const relevant = usable.filter(item => item.endOffset > entry.start && item.startOffset < entry.end);
    if (!relevant.length) continue;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const item of relevant) {
      const start = Math.max(cursor, item.startOffset - entry.start);
      const end = Math.min(entry.node.data.length, item.endOffset - entry.start);
      if (start > cursor) fragment.append(entry.node.data.slice(cursor, start));
      if (end > start) {
        const mark = document.createElement('mark');
        mark.dataset.readerMarkup = item.id;
        mark.className = `reader-highlight reader-highlight-${item.style ?? 'highlight'} reader-highlight-${item.color}`;
        mark.textContent = entry.node.data.slice(start, end);
        fragment.append(mark);
      }
      cursor = Math.max(cursor, end);
    }
    if (cursor < entry.node.data.length) fragment.append(entry.node.data.slice(cursor));
    entry.node.replaceWith(fragment);
  }
}
