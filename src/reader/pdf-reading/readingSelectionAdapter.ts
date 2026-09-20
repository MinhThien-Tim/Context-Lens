import type { ReaderSelection } from '../TextReader';
import { normalizeSelection, sentenceContextForRange } from '../../lookup/context';

export function readingSelectionFromDom(root: HTMLElement, documentText: string): ReaderSelection | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return null;
  const range = selection.getRangeAt(0);
  const start = endpointOffset(root, range.startContainer, range.startOffset);
  const end = endpointOffset(root, range.endContainer, range.endOffset);
  if (start === null || end === null) return null;
  const raw = selection.toString();
  const text = normalizeSelection(raw.replace(/-\s+/g, ''));
  if (!text) return null;
  const from = Math.min(start, end), to = Math.max(start, end);
  const context = sentenceContextForRange(documentText, from, to);
  return { text, offset: from, type: text.includes(' ') ? (normalizeSelection(context.current) === text ? 'sentence' : 'phrase') : 'word', context };
}

function endpointOffset(root: HTMLElement, node: Node, offset: number): number | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  const block = element?.closest<HTMLElement>('[data-offset]');
  if (!block || !root.contains(block)) return null;
  const before = document.createRange(); before.selectNodeContents(block); before.setEnd(node, offset);
  return Number(block.dataset.offset) + before.toString().length;
}
