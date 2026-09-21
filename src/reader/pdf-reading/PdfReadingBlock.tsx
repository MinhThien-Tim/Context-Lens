import type { PdfTextBlock } from '../../documents/pdf/types';
import type { ReaderHighlight } from '../../db/database';

export function PdfReadingBlock({ block, highlights = [] }: { block: PdfTextBlock; highlights?: ReaderHighlight[] }) {
  const props = { id: block.id, 'data-offset': block.startOffset };
  const content = highlightedText(block.text, block.startOffset, highlights);
  if (block.type === 'heading') { const Tag = `h${block.level ?? 2}` as 'h1' | 'h2' | 'h3'; return <Tag {...props}>{content}</Tag>; }
  if (block.type === 'list') return <ul {...props}>{(block.items ?? block.text.split('\n')).map((item, index) => <li key={index}>{item}</li>)}</ul>;
  if (block.type === 'quote') return <blockquote {...props}>{content}</blockquote>;
  if (block.type === 'footnote') return <aside {...props} class="pdf-reading-footnote">{content}</aside>;
  if (block.type === 'dialogue') { const body = block.speaker ? block.text.replace(new RegExp(`^${escapeRegExp(block.speaker)}:\\s*`), '') : block.text; return <p {...props} class="pdf-reading-dialogue">{block.speaker && <strong>{block.speaker}: </strong>}{body}</p>; }
  return <p {...props}>{content}</p>;
}

function highlightedText(text: string, blockOffset: number, highlights: ReaderHighlight[]) {
  const relevant = highlights.filter(item => item.endOffset > blockOffset && item.startOffset < blockOffset + text.length).sort((a, b) => a.startOffset - b.startOffset);
  if (!relevant.length) return text;
  const parts = [];
  let cursor = 0;
  for (const item of relevant) {
    const start = Math.max(cursor, item.startOffset - blockOffset);
    const end = Math.min(text.length, item.endOffset - blockOffset);
    if (start > cursor) parts.push(text.slice(cursor, start));
    if (end > start) parts.push(<mark key={item.id} class={`reader-highlight reader-highlight-${item.color}`}>{text.slice(start, end)}</mark>);
    cursor = Math.max(cursor, end);
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
