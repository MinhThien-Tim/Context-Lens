import type { ReaderSelection } from '../TextReader';
import { normalizeSelection, sentenceContextForRange } from '../../lookup/context';

export function pdfSelectionFromDom(root: HTMLElement, documentText: string, pageOffset: number): ReaderSelection | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return null;
  const range = selection.getRangeAt(0);
  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  const localOffset = before.toString().length;
  const raw = range.toString();
  const text = normalizeSelection(raw.replace(/-\s+/g, ''));
  if (!text) return null;
  const offset = Math.min(documentText.length, pageOffset + localOffset);
  const context = sentenceContextForRange(documentText, offset, Math.min(documentText.length, offset + raw.length));
  return { text, offset, type: text.includes(' ') ? (normalizeSelection(context.current) === text ? 'sentence' : 'phrase') : 'word', context };
}
