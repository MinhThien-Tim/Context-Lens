import type { ReaderSelection } from '../TextReader';
import { normalizeSelection, sentenceContextForRange } from '../../lookup/context';
import { PdfTextIndex } from './PdfTextIndex';

export function pdfSelectionFromDom(root: HTMLElement, documentText: string, pageOffset: number, index = new PdfTextIndex(root, documentText, pageOffset)): ReaderSelection | null {
  const selection = window.getSelection();
  if (!root.isConnected || !index.root.isConnected || !selection || selection.isCollapsed || !selection.rangeCount || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return null;
  return pdfSelectionFromRange(root, selection.getRangeAt(0), documentText, pageOffset, index);
}

export function pdfSelectionFromRange(root: HTMLElement, range: Range, documentText: string, pageOffset: number, index = new PdfTextIndex(root, documentText, pageOffset)): ReaderSelection | null {
  if (!root.isConnected || !index.root.isConnected || range.collapsed || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const raw = range.toString();
  const text = normalizeSelection(raw.normalize('NFKC').replace(/\u00ad/g, '').replace(/-\s+/g, ''));
  if (!text) return null;
  const mapped = index.map(range);
  if (!mapped) return null;
  const { offset, endOffset } = mapped;
  const context = sentenceContextForRange(documentText, offset, endOffset);
  const canonicalText = normalizeSelection(documentText.slice(offset, endOffset).replace(/-\s+/g, ''));
  const selectedText = /-\s+/.test(raw) ? text : canonicalText || text;
  const rect = range.getBoundingClientRect?.() ?? { left: 0, top: 0, right: 0, bottom: 0 };
  return { text: selectedText, offset, endOffset, type: selectedText.includes(' ') ? (normalizeSelection(context.current) === selectedText ? 'sentence' : 'phrase') : 'word', context,
    anchor: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } };
}
