import type { ReaderHighlight } from '../../db/database';

export function upsertHighlight(current: ReaderHighlight[], next: ReaderHighlight): ReaderHighlight[] {
  const match = current.find(item => item.startOffset === next.startOffset && item.endOffset === next.endOffset && item.ocrPage === next.ocrPage && item.ocrLanguage === next.ocrLanguage);
  if (!match) return [...current, next];
  return current.map(item => item.id === match.id ? { ...item, color: next.color, style: next.style } : item);
}

export function eraseHighlights(current: ReaderHighlight[], startOffset: number, endOffset: number, ocrPage?: number, ocrLanguage?: ReaderHighlight['ocrLanguage']): ReaderHighlight[] {
  return current.filter(item => item.ocrPage !== ocrPage || item.ocrLanguage !== ocrLanguage || item.endOffset <= startOffset || item.startOffset >= endOffset);
}
