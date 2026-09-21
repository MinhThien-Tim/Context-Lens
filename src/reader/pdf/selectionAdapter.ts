import type { ReaderSelection } from '../TextReader';
import { normalizeSelection, sentenceContextForRange } from '../../lookup/context';
import { PdfTextIndex } from './PdfTextIndex';

export function pdfSelectionFromDom(root: HTMLElement, documentText: string, pageOffset: number, index = new PdfTextIndex(root, documentText, pageOffset)): ReaderSelection | null {
  const selection = window.getSelection();
  if (!root.isConnected || !index.root.isConnected || !selection || selection.isCollapsed || !selection.rangeCount || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return null;
  const range = selection.getRangeAt(0);
  const raw = range.toString();
  const text = normalizeSelection(raw.normalize('NFKC').replace(/\u00ad/g, '').replace(/-\s+/g, ''));
  if (!text) return null;
  const mapped = index.map(range);
  if (!mapped) return null;
  const { offset, endOffset } = mapped;
  const context = sentenceContextForRange(documentText, offset, endOffset);
  const selectedText = mapped.confidence === 'exact' && !/-\s+/.test(raw) ? normalizeSelection(documentText.slice(offset, endOffset).replace(/-\s+/g, '')) : text;
  return { text: selectedText, offset, endOffset, type: selectedText.includes(' ') ? (normalizeSelection(context.current) === selectedText ? 'sentence' : 'phrase') : 'word', context };
}
