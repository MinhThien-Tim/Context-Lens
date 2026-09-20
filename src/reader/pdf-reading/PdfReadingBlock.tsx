import type { PdfTextBlock } from '../../documents/pdf/types';

export function PdfReadingBlock({ block }: { block: PdfTextBlock }) {
  const props = { id: block.id, 'data-offset': block.startOffset };
  if (block.type === 'heading') { const Tag = `h${block.level ?? 2}` as 'h1' | 'h2' | 'h3'; return <Tag {...props}>{block.text}</Tag>; }
  if (block.type === 'list') return <ul {...props}>{(block.items ?? block.text.split('\n')).map((item, index) => <li key={index}>{item}</li>)}</ul>;
  if (block.type === 'quote') return <blockquote {...props}>{block.text}</blockquote>;
  if (block.type === 'footnote') return <aside {...props} class="pdf-reading-footnote">{block.text}</aside>;
  if (block.type === 'dialogue') { const body = block.speaker ? block.text.replace(new RegExp(`^${escapeRegExp(block.speaker)}:\\s*`), '') : block.text; return <p {...props} class="pdf-reading-dialogue">{block.speaker && <strong>{block.speaker}: </strong>}{body}</p>; }
  return <p {...props}>{block.text}</p>;
}

function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
