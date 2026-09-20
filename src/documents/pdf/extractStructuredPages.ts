import type { PdfSourceTextItem, PdfStructuredPage, PdfTextBlock } from './types';

interface Line { text: string; x: number; y: number; width: number; fontSize: number; column: number }

export function extractStructuredPage(pageNumber: number, sourceItems: PdfSourceTextItem[], pageWidth: number, pageHeight: number): PdfStructuredPage {
  if (!sourceItems.some(item => item.str.trim())) return { pageNumber, startOffset: 0, endOffset: 0, plainText: '', blocks: [], extractionQuality: 'poor' };
  const lines = groupTextItems(sourceItems, pageWidth);
  const fontSizes = lines.map(line => line.fontSize).sort((a, b) => a - b);
  const median = fontSizes[Math.floor(fontSizes.length / 2)] || 12;
  const groups: Line[][] = [];
  for (const line of lines) {
    const previous = groups.at(-1);
    const prior = previous?.at(-1);
    const gap = prior ? Math.abs(prior.y - line.y) : Infinity;
    if (!previous || !prior || line.column !== prior.column || gap > Math.max(median * 1.65, prior.fontSize * 1.7) || classifyLine(line, median, pageHeight) !== classifyLine(prior, median, pageHeight)) groups.push([line]);
    else previous.push(line);
  }
  const rawBlocks = groups.map((group, index) => classifyBlock(group, median, pageHeight, pageNumber, index));
  let cursor = 0;
  const blocks: PdfTextBlock[] = rawBlocks.map(block => {
    const startOffset = cursor;
    cursor += block.text.length;
    const result = { ...block, startOffset, endOffset: cursor };
    cursor += 2;
    return result;
  });
  const plainText = blocks.map(block => block.text).join('\n\n');
  const suspiciousColumns = new Set(lines.map(line => line.column)).size > 2;
  const quality = plainText.length < 24 ? 'poor' : suspiciousColumns || sourceItems.length > 0 && lines.length / sourceItems.length > .8 ? 'partial' : 'good';
  return { pageNumber, startOffset: 0, endOffset: plainText.length, plainText, blocks, extractionQuality: quality };
}

function groupTextItems(items: PdfSourceTextItem[], pageWidth: number): Line[] {
  const sorted = items.filter(item => item.str.trim()).map(item => ({ item, x: item.transform[4] ?? 0, y: item.transform[5] ?? 0, fontSize: Math.abs(item.transform[3] ?? item.height ?? 12) || 12 })).sort((a, b) => {
    const columnA = columnFor(a.x, pageWidth), columnB = columnFor(b.x, pageWidth);
    return columnA - columnB || b.y - a.y || a.x - b.x;
  });
  const lines: Array<{ y: number; column: number; parts: typeof sorted }> = [];
  for (const part of sorted) {
    const column = columnFor(part.x, pageWidth);
    const line = lines.find(candidate => candidate.column === column && Math.abs(candidate.y - part.y) <= Math.max(2, part.fontSize * .28));
    if (line) line.parts.push(part); else lines.push({ y: part.y, column, parts: [part] });
  }
  return lines.sort((a, b) => a.column - b.column || b.y - a.y).map(line => {
    line.parts.sort((a, b) => a.x - b.x);
    let text = '', right = 0;
    for (const part of line.parts) {
      const averageChar = part.item.str.length ? part.item.width / part.item.str.length : part.fontSize * .5;
      if (text && part.x - right > Math.max(1.5, averageChar * .35)) text += ' ';
      text += part.item.str;
      right = part.x + part.item.width;
    }
    return { text: text.trim(), x: line.parts[0].x, y: line.y, width: Math.max(...line.parts.map(part => part.x + part.item.width)) - line.parts[0].x, fontSize: Math.max(...line.parts.map(part => part.fontSize)), column: line.column };
  });
}

function columnFor(x: number, pageWidth: number): number {
  if (x < pageWidth * .44) return 0;
  if (x > pageWidth * .56) return 1;
  return 0;
}

function classifyLine(line: Line, median: number, pageHeight: number): PdfTextBlock['type'] {
  if (line.fontSize >= median * 1.28 && line.text.length <= 100) return 'heading';
  if (/^(?:[-•▪‣]|\d+[.)])\s+/.test(line.text)) return 'list';
  if (/^[A-Z][A-Z\s.'-]{1,30}:\s+\S/.test(line.text)) return 'dialogue';
  if (/^[“"‘']/.test(line.text) && /[”"’']$/.test(line.text)) return 'quote';
  if (line.y < pageHeight * .22 && line.fontSize < median * .88 && /^(?:\d+|[*†‡])\s*/.test(line.text)) return 'footnote';
  return 'paragraph';
}

function classifyBlock(lines: Line[], median: number, pageHeight: number, pageNumber: number, index: number): Omit<PdfTextBlock, 'startOffset' | 'endOffset'> {
  const type = classifyLine(lines[0], median, pageHeight);
  const joined = joinLines(lines.map(line => line.text));
  const base = { id: `pdf-${pageNumber}-${index}`, type, text: joined };
  if (type === 'heading') return { ...base, level: lines[0].fontSize >= median * 1.7 ? 1 : lines[0].fontSize >= median * 1.42 ? 2 : 3 };
  if (type === 'dialogue') { const match = joined.match(/^([^:]+):\s*(.*)$/s); return { ...base, speaker: match?.[1], text: match?.[2] || joined }; }
  if (type === 'list') { const items = lines.map(line => line.text.replace(/^(?:[-•▪‣]|\d+[.)])\s+/, '')); return { ...base, text: items.join('\n'), items }; }
  return base;
}

export function joinLines(lines: string[]): string {
  return lines.reduce((text, line) => {
    if (!text) return line.trim();
    if (/\p{L}-$/u.test(text) && /^\p{Ll}/u.test(line)) return text.slice(0, -1) + line.trimStart();
    return `${text} ${line.trim()}`;
  }, '');
}

export function shiftStructuredPage(page: PdfStructuredPage, startOffset: number): PdfStructuredPage {
  return { ...page, startOffset, endOffset: startOffset + page.plainText.length, blocks: page.blocks.map(block => ({ ...block, startOffset: block.startOffset + startOffset, endOffset: block.endOffset + startOffset })) };
}
