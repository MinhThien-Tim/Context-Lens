import type { ReaderHighlight } from '../../db/database';

export function upsertHighlight(current: ReaderHighlight[], next: ReaderHighlight): ReaderHighlight[] {
  const match = current.find(item => item.startOffset === next.startOffset && item.endOffset === next.endOffset);
  if (!match) return [...current, next];
  return current.map(item => item.id === match.id ? { ...item, color: next.color } : item);
}
