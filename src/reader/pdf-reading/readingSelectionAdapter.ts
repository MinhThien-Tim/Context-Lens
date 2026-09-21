import type { ReaderSelection } from '../TextReader';
import { normalizeSelection, sentenceContextAt, sentenceContextForRange } from '../../lookup/context';

export function readingSelectionFromDom(root: HTMLElement, documentText: string): ReaderSelection | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount || !selection.anchorNode || !selection.focusNode || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return null;
  const range = selection.getRangeAt(0);
  const start = endpointOffset(root, range.startContainer, range.startOffset, 'start');
  const end = endpointOffset(root, range.endContainer, range.endOffset, 'end');
  if (start === null || end === null) return null;
  const raw = selection.toString();
  const text = normalizeSelection(raw.replace(/-\s+/g, ''));
  if (!text) return null;
  const from = Math.min(start, end), to = Math.max(start, end);
  const context = sentenceContextForRange(documentText, from, to);
  return { text, offset: from, endOffset: to, type: text.includes(' ') ? (normalizeSelection(context.current) === text ? 'sentence' : 'phrase') : 'word', context };
}

export function readingWordAtPoint(root: HTMLElement, documentText: string, x: number, y: number): ReaderSelection | null {
  const range = rangeFromPoint(x, y);
  return range ? readingWordFromRange(root, documentText, range) : null;
}

export function readingWordFromRange(root: HTMLElement, documentText: string, range: Range): ReaderSelection | null {
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE || !node.textContent || !root.contains(node)) return null;
  const content = node.textContent;
  const wordChar = /[\p{L}\p{M}'’-]/u;
  let start = Math.min(range.startOffset, content.length), end = start;
  while (start > 0 && wordChar.test(content[start - 1])) start--;
  while (end < content.length && wordChar.test(content[end])) end++;
  const text = content.slice(start, end).replace(/^[’'-]+|[’'-]+$/g, '');
  if (!text) return null;
  const canonicalOffset = endpointOffset(root, node, start, 'start');
  if (canonicalOffset === null) return null;
  return { text, offset: canonicalOffset, endOffset: canonicalOffset + text.length, type: 'word', context: sentenceContextAt(documentText, canonicalOffset) };
}

function rangeFromPoint(x: number, y: number): Range | null {
  const documentWithCaret = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (documentWithCaret.caretRangeFromPoint) return documentWithCaret.caretRangeFromPoint(x, y);
  const position = documentWithCaret.caretPositionFromPoint?.(x, y);
  if (!position) return null;
  const range = document.createRange();
  range.setStart(position.offsetNode, position.offset);
  range.collapse(true);
  return range;
}

function endpointOffset(root: HTMLElement, node: Node, offset: number, edge: 'start' | 'end'): number | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  const block = element?.closest<HTMLElement>('[data-offset]');
  if (block && root.contains(block)) {
    try {
      const before = document.createRange();
      before.selectNodeContents(block);
      before.setEnd(node, offset);
      const base = Number(block.dataset.offset);
      return Number.isFinite(base) ? base + before.toString().length : null;
    } catch { /* Resolve element-boundary endpoints below. */ }
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const children = node.childNodes;
  const candidate = edge === 'start'
    ? children[Math.min(offset, Math.max(0, children.length - 1))]
    : children[Math.max(0, Math.min(children.length - 1, offset - 1))];
  const textNode = candidate && findTextNode(candidate, edge);
  if (!textNode) return null;
  return endpointOffset(root, textNode, edge === 'start' ? 0 : textNode.textContent?.length ?? 0, edge);
}

function findTextNode(node: Node, edge: 'start' | 'end'): Text | null {
  if (node.nodeType === Node.TEXT_NODE) return node as Text;
  const children = node.childNodes;
  const ordered = edge === 'start' ? Array.from(children) : Array.from(children).reverse();
  for (const child of ordered) {
    const found = findTextNode(child, edge);
    if (found) return found;
  }
  return null;
}
