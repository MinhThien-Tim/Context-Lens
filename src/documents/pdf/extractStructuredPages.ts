import type { PdfSourceTextItem, PdfStructuredPage, PdfTextBlock } from './types';

interface Line { text: string; x: number; y: number; width: number; fontSize: number; column: number; letterSpaced: boolean }

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
    // An indent alone may be alignment. Require a terminal, short preceding line too.
    const paragraphStart = prior && line.x - prior.x >= median && prior.width < pageWidth * .6 && /[.!?]["'”’)]?$/.test(prior.text);
    const changedRole = prior && (Math.max(prior.fontSize, line.fontSize) / Math.max(1, Math.min(prior.fontSize, line.fontSize)) > 1.25 || line.x - prior.x > median * 1.8 && /[.!?]$/.test(prior.text));
    if (!previous || !prior || paragraphStart || line.column !== prior.column || gap > Math.max(median * 1.65, prior.fontSize * 1.7) || changedRole || classifyLine(line, median, pageHeight) !== classifyLine(prior, median, pageHeight)) groups.push([line]);
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
  const suspicious = lines.some(line => line.letterSpaced || /\b\p{L}{18,}\b/u.test(line.text) || /\s+[,.!?;]/.test(line.text)) || lines.filter(line => /^\p{L}$/u.test(line.text)).length > 1;
  const quality = plainText.length < 24 ? 'poor' : suspicious ? 'partial' : 'good';
  return { pageNumber, startOffset: 0, endOffset: plainText.length, plainText, blocks, extractionQuality: quality };
}

function groupTextItems(items: PdfSourceTextItem[], pageWidth: number): Line[] {
  const parts = items.map(item => ({ item, x: item.transform[4] ?? 0, y: item.transform[5] ?? 0, fontSize: Math.abs(item.transform[3] ?? item.height ?? 12) || 12 })).filter(part => part.item.str.length);
  // Infer a repeated right body edge before row joining can swallow a narrow gutter.
  const body = parts.filter(part => part.item.str.trim().length > 8 && part.item.width >= pageWidth * .15 && part.item.width <= pageWidth * .48 && !/^[“"‘']/.test(part.item.str));
  const rightRegion = body.find(candidate => {
    const right = body.filter(part => Math.abs(part.x - candidate.x) <= candidate.fontSize && Math.abs(part.fontSize - candidate.fontSize) <= candidate.fontSize * .25);
    const left = body.filter(part => part.x + part.item.width < candidate.x - candidate.fontSize && part.x < candidate.x - pageWidth * .25 && Math.abs(part.fontSize - candidate.fontSize) <= candidate.fontSize * .25);
    return new Set(right.map(part => Math.round(part.y))).size >= 3 && new Set(left.map(part => Math.round(part.y))).size >= 2 && right.filter(a => left.some(b => Math.abs(a.y - b.y) < candidate.fontSize * 3)).length >= 3;
  });
  const rows: Array<{ y: number; parts: typeof parts }> = [];
  for (const part of [...parts].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find(candidate => Math.abs(candidate.y - part.y) <= Math.max(2, part.fontSize * .28));
    if (row) row.parts.push(part); else rows.push({ y: part.y, parts: [part] });
  }
  const lines: Line[] = [];
  for (const row of rows) {
    row.parts.sort((a, b) => a.x - b.x);
    const chunks: Array<typeof parts> = [[]];
    let right = 0;
    for (const part of row.parts) {
      const gap = part.x - right;
      const crossesGutter = rightRegion && Math.abs(part.x - rightRegion.x) <= rightRegion.fontSize && right < rightRegion.x - rightRegion.fontSize;
      if (chunks.at(-1)!.length && (crossesGutter || gap > Math.max(part.fontSize * 2.8, pageWidth * .13))) chunks.push([]);
      chunks.at(-1)!.push(part);
      right = Math.max(right, part.x + part.item.width);
    }
    for (const chunk of chunks) {
      let text = '', rightEdge = 0, letterSpaced = false;
      for (const part of chunk) {
        const raw = part.item.str;
        if (!raw.trim()) { if (text && !text.endsWith(' ')) text += ' '; continue; }
        const spacedLetters = /^(?:\p{L}\s+){3,}\p{L}$/u.test(raw.trim());
        // Short tracked labels can be restored safely. Long mixed-case titles need review/OCR.
        const value = spacedLetters && raw.replace(/\s/g, '').length <= 9 ? raw.replace(/\s+/g, '') : raw;
        letterSpaced ||= spacedLetters && value === raw;
        const averageChar = raw.length ? part.item.width / raw.length : part.fontSize * .5;
        if (text && !text.endsWith(' ') && part.x - rightEdge > Math.max(1.5, averageChar * .35)) text += ' ';
        text += value;
        rightEdge = part.x + part.item.width;
      }
      text = text.trim();
      if (!text || (/^\p{L}$/u.test(text) && chunk.length === 1 && chunk[0].fontSize > 14)) continue;
      const x = chunk[0].x;
      lines.push({ text, x, y: row.y, width: Math.max(...chunk.map(part => part.x + part.item.width)) - x, fontSize: Math.max(...chunk.map(part => part.fontSize)), column: 0, letterSpaced });
    }
  }
  const visual = lines.sort((a, b) => b.y - a.y || a.x - b.x);
  if (!rightRegion) return visual;
  const edge = rightRegion.x;
  const ordered: Line[] = [];
  let band: Line[] = [], bandNumber = 0;
  const flush = () => {
    for (const line of band) line.column = bandNumber * 3 + (line.x >= edge - rightRegion.fontSize ? 1 : 0);
    ordered.push(...band.sort((a, b) => a.column - b.column || b.y - a.y || a.x - b.x));
    band = []; bandNumber++;
  };
  for (const line of visual) {
    if (line.x < edge - rightRegion.fontSize && line.x + line.width > edge + rightRegion.fontSize) {
      flush(); line.column = bandNumber * 3 - 1; ordered.push(line);
    } else band.push(line);
  }
  flush();
  return ordered;
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
  if (type === 'dialogue') { const match = joined.match(/^([^:]+):\s*(.*)$/s); return { ...base, speaker: match?.[1] }; }
  if (type === 'list') { const items = lines.map(line => line.text.replace(/^(?:[-•▪‣]|\d+[.)])\s+/, '')); return { ...base, text: items.join('\n'), items }; }
  return base;
}

export function joinLines(lines: string[]): string {
  return lines.reduce((text, line) => {
    if (!text) return line.trim();
    const next = line.trim();
    if (/\p{L}\u00ad$/u.test(text) && /^\p{Ll}/u.test(next)) return text.slice(0, -1) + next;
    // A hard hyphen can be lexical (well-known, re-creation). Retain it.
    if (/\p{L}-$/u.test(text) && /^\p{Ll}/u.test(next)) return text + next;
    return `${text} ${line.trim()}`;
  }, '');
}

export function shiftStructuredPage(page: PdfStructuredPage, startOffset: number): PdfStructuredPage {
  return { ...page, startOffset, endOffset: startOffset + page.plainText.length, blocks: page.blocks.map(block => ({ ...block, startOffset: block.startOffset + startOffset, endOffset: block.endOffset + startOffset })) };
}
