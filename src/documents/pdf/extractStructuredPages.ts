import type { PdfSourceTextItem, PdfStructuredPage, PdfTextBlock, PdfTextIntegrity } from './types';

interface Line { text: string; x: number; y: number; width: number; fontSize: number; fontName?: string; column: number; letterSpaced: boolean }

/** Reconstruct only a geometrically consistent run of at least four letter items. */
export function reconstructTextRuns(sourceItems: PdfSourceTextItem[]): PdfSourceTextItem[] {
  const result: PdfSourceTextItem[] = [];
  const isLetter = (item: PdfSourceTextItem) => /^\p{L}$/u.test(item.str);
  let index = 0;
  while (index < sourceItems.length) {
    const first = sourceItems[index];
    if (!isLetter(first)) { result.push(first); index++; continue; }
    const run = [first];
    const gaps: number[] = [];
    while (index + run.length < sourceItems.length) {
      const previous = run.at(-1)!;
      const next = sourceItems[index + run.length];
      const size = Math.abs(previous.transform[3] ?? previous.height) || previous.height;
      const nextSize = Math.abs(next.transform[3] ?? next.height) || next.height;
      const gap = (next.transform[4] ?? 0) - (previous.transform[4] ?? 0) - previous.width;
      if (!isLetter(next) || previous.hasEOL || !Number.isFinite(size) || size <= 0 ||
          (previous.transform[0] ?? 0) <= 0 || (next.transform[0] ?? 0) <= 0 ||
          Math.abs(nextSize - size) > size * .1 ||
          run.some(part => part.fontName && next.fontName && part.fontName !== next.fontName) ||
          Math.abs((next.transform[5] ?? 0) - (previous.transform[5] ?? 0)) > Math.max(.75, size * .08) ||
          previous.width < size * .12 || previous.width > size * 1.1 ||
          next.width < size * .12 || next.width > size * 1.1 ||
          gap < 0 || gap > Math.min(size * .4, Math.min(previous.width, next.width) * .65)) break;
      gaps.push(gap);
      run.push(next);
    }
    // A few independent labels are ambiguous. Require four letters and uniform tracking.
    const averageGap = gaps.reduce((sum, gap) => sum + gap, 0) / (gaps.length || 1);
    if (run.length >= 4 && gaps.every(gap => Math.abs(gap - averageGap) <= Math.max(.75, averageGap * .35))) {
      const right = (run.at(-1)!.transform[4] ?? 0) + run.at(-1)!.width;
      result.push({ ...first, str: run.map(part => part.str).join(''), width: right - (first.transform[4] ?? 0), hasEOL: run.at(-1)!.hasEOL });
      index += run.length;
    } else {
      result.push(first);
      index++;
    }
  }
  return result;
}

export function extractStructuredPage(pageNumber: number, sourceItems: PdfSourceTextItem[], pageWidth: number, pageHeight: number): PdfStructuredPage {
  if (!sourceItems.some(item => item.str.trim())) return { pageNumber, startOffset: 0, endOffset: 0, plainText: '', blocks: [], extractionQuality: 'poor', textIntegrity: 'valid' };
  const lines = groupTextItems(sourceItems, pageWidth);
  const fontSizes = lines.map(line => line.fontSize).sort((a, b) => a - b);
  const median = fontSizes[Math.floor(fontSizes.length / 2)] || 12;
  const headings = headingCandidates(lines, median, pageWidth, pageHeight);
  const groups: Line[][] = [];
  for (const line of lines) {
    const previous = groups.at(-1);
    const prior = previous?.at(-1);
    const gap = prior ? Math.abs(prior.y - line.y) : Infinity;
    // An indent alone may be alignment. Require a terminal, short preceding line too.
    const paragraphStart = prior && line.x - prior.x >= median && prior.width < pageWidth * .6 && /[.!?]["'”’)]?$/.test(prior.text);
    const changedRole = prior && (Math.max(prior.fontSize, line.fontSize) / Math.max(1, Math.min(prior.fontSize, line.fontSize)) > 1.25 || line.x - prior.x > median * 1.8 && /[.!?]$/.test(prior.text));
    if (!previous || !prior || paragraphStart || line.column !== prior.column || gap > Math.max(median * 1.65, prior.fontSize * 1.7) || changedRole || headings.has(line) && headings.has(prior) && /^(?:CHAPTER|PART|BOOK|SECTION)\s+[\dIVXLCDM]+$/i.test(prior.text) || classifyLine(line, median, pageHeight, headings) !== classifyLine(prior, median, pageHeight, headings)) groups.push([line]);
    else previous.push(line);
  }
  const rawBlocks = groups.map((group, index) => classifyBlock(group, median, pageHeight, pageNumber, index, headings));
  markDecorativeBlocks(rawBlocks, groups, lines, pageWidth, pageHeight, median);
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
  return { pageNumber, startOffset: 0, endOffset: plainText.length, plainText, blocks, extractionQuality: quality, textIntegrity: assessTextIntegrity(lines) };
}

/** Character evidence only; quality and OCR eligibility remain separate decisions. */
function assessTextIntegrity(lines: Line[]): PdfTextIntegrity {
  const text = lines.map(line => line.text).join(' ');
  const characters = Array.from(text).filter(char => !/\s/u.test(char));
  if (!characters.length) return 'valid';
  const badCharacter = (char: string) => /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ufffd\p{Co}]/u.test(char);
  const badCount = characters.filter(badCharacter).length;
  const badLines = lines.filter(line => Array.from(line.text).some(badCharacter)).length;
  const badRatio = badCount / characters.length;
  // Widespread broken mappings are decisive; an isolated glyph is never decisive.
  if (badCount >= 8 && badRatio >= .04 && badLines >= 2) return 'corrupt';

  const substantive = lines.filter(line => Array.from(line.text).filter(char => /\p{L}/u.test(char)).length >= 12);
  const symbolHeavy = substantive.filter(line => {
    const visible = Array.from(line.text).filter(char => !/\s/u.test(char));
    const symbols = visible.filter(char => /[\p{S}]/u.test(char)).length;
    // A contents leader is layout, not an encoded word.
    return symbols >= 5 && symbols / visible.length >= .25 && !/\.{3,}/u.test(line.text);
  }).length;
  const mixedTokens = text.split(/\s+/u).filter(token => token.length >= 5 && /\p{L}/u.test(token) && /\p{S}/u.test(token) && Array.from(token).filter(char => /\p{S}/u.test(char)).length >= 2).length;
  if (badCount >= 4 && badRatio >= .02 && badLines >= 2 && (symbolHeavy >= 2 || mixedTokens >= 3)) return 'corrupt';
  if (badCount > 0 || symbolHeavy >= 2 && mixedTokens >= 3) return 'suspect';
  return 'valid';
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
    for (const originalChunk of chunks) {
      // Chunk boundaries already encode large gaps and the detected column gutter.
      const chunk = reconstructTextRuns(originalChunk.map(part => part.item)).map(item => ({ item, x: item.transform[4] ?? 0, y: item.transform[5] ?? 0, fontSize: Math.abs(item.transform[3] ?? item.height ?? 12) || 12 }));
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
      const named = chunk.filter(part => part.item.str.trim() && part.item.fontName);
      const fontName = named.length && named.length === chunk.filter(part => part.item.str.trim()).length && new Set(named.map(part => part.item.fontName)).size === 1 ? named[0].item.fontName : undefined;
      lines.push({ text, x, y: row.y, width: Math.max(...chunk.map(part => part.x + part.item.width)) - x, fontSize: Math.max(...chunk.map(part => part.fontSize)), fontName, column: 0, letterSpaced });
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

function headingCandidates(lines: Line[], median: number, pageWidth: number, pageHeight: number): Set<Line> {
  const body = lines.filter(line => line.text.length >= 24 && line.width >= pageWidth * .22 &&
    line.fontSize <= median * 1.12 && !/^[“"‘']/.test(line.text));
  const bodySizes = body.map(line => line.fontSize).sort((a, b) => a - b);
  const bodyMedian = bodySizes.length >= 2 ? bodySizes[Math.floor((bodySizes.length - 1) / 2)] : median;
  const named = body.filter(line => line.fontName);
  const counts = new Map<string, number>();
  for (const line of named) counts.set(line.fontName!, (counts.get(line.fontName!) ?? 0) + 1);
  const common = [...counts].sort((a, b) => b[1] - a[1])[0];
  const bodyFont = common && common[1] >= 2 && common[1] >= named.length * .6 ? common[0] : undefined;
  const candidates = new Set<Line>();
  const center = pageWidth / 2;
  const chapter = (text: string) => /^(?:CHAPTER|PART|BOOK|SECTION)\s+[\dIVXLCDM]+$/i.test(text);
  lines.forEach((line, index) => {
    if (line.text.length > 100 || line.text.split(/\s+/).length > 12 || /[.!?][”"']?$/.test(line.text) ||
        /^(?:[-•▪‣]|\d+[.)])\s+/.test(line.text) || /^[A-Z][A-Z\s.'-]{1,30}:\s+\S/.test(line.text) ||
        /^[“"‘']/.test(line.text) || line.y < pageHeight * .22 && line.fontSize < median * .88) return;
    const previous = lines[index - 1], next = lines[index + 1];
    const large = line.fontSize >= bodyMedian * 1.28;
    const distinctFont = !!(bodyFont && line.fontName && line.fontName !== bodyFont &&
      (/(?:bold|black|heavy|semi.?bold|demi)/i.test(line.fontName) || body.length >= 3));
    if (!large && !distinctFont) return;
    const centered = Math.abs(line.x + line.width / 2 - center) <= pageWidth * .09 && line.width < pageWidth * .8;
    const above = previous ? Math.abs(previous.y - line.y) : Infinity;
    const below = next ? Math.abs(line.y - next.y) : Infinity;
    const separated = above >= median * 1.8 || below >= median * 1.8;
    const paired = chapter(line.text) && next && below <= median * 2.5 && next.text.length <= 70 &&
      (Math.abs(next.x + next.width / 2 - center) <= pageWidth * .12 || Math.abs(next.x - line.x) <= median);
    if (centered || separated || paired) candidates.add(line);
  });
  // A nearby title inherits the chapter marker's relationship, but still needs typography.
  lines.forEach((line, index) => {
    const previous = lines[index - 1];
    if (!previous || !candidates.has(previous) || !chapter(previous.text) || line.text.length > 70) return;
    if (Math.abs(previous.y - line.y) > median * 2.5 || /[.!?]$/.test(line.text)) return;
    if (line.fontSize >= bodyMedian * 1.28 || bodyFont && line.fontName && line.fontName !== bodyFont) candidates.add(line);
  });
  return candidates;
}

function classifyLine(line: Line, median: number, pageHeight: number, headings: Set<Line>): PdfTextBlock['type'] {
  if (/^(?:[-•▪‣]|\d+[.)])\s+/.test(line.text)) return 'list';
  if (/^[A-Z][A-Z\s.'-]{1,30}:\s+\S/.test(line.text)) return 'dialogue';
  if (/^[“"‘']/.test(line.text) && /[”"’']$/.test(line.text)) return 'quote';
  if (line.y < pageHeight * .22 && line.fontSize < median * .88 && /^(?:\d+|[*†‡])\s*/.test(line.text)) return 'footnote';
  if (headings.has(line)) return 'heading';
  return 'paragraph';
}

function classifyBlock(lines: Line[], median: number, pageHeight: number, pageNumber: number, index: number, headings: Set<Line>): Omit<PdfTextBlock, 'startOffset' | 'endOffset'> {
  const type = classifyLine(lines[0], median, pageHeight, headings);
  const joined = type === 'paragraph' ? joinParagraphLines(lines) : joinLines(lines.map(line => line.text));
  const base = { id: `pdf-${pageNumber}-${index}`, type, text: joined };
  if (type === 'heading') return { ...base, level: lines[0].fontSize >= median * 1.7 ? 1 : lines[0].fontSize >= median * 1.42 ? 2 : 3 };
  if (type === 'dialogue') { const match = joined.match(/^([^:]+):\s*(.*)$/s); return { ...base, speaker: match?.[1] }; }
  if (type === 'list') { const items = lines.map(line => line.text.replace(/^(?:[-•▪‣]|\d+[.)])\s+/, '')); return { ...base, text: items.join('\n'), items }; }
  return base;
}

function markDecorativeBlocks(blocks: Array<Omit<PdfTextBlock, 'startOffset' | 'endOffset'>>, groups: Line[][], lines: Line[], pageWidth: number, pageHeight: number, median: number): void {
  const prose = blocks.filter(block => block.text.length >= 30 && /\s/.test(block.text)).map(block => block.text);
  const bodyX = lines.filter(line => line.text.length >= 24 && line.width >= pageWidth * .22).map(line => line.x).sort((a, b) => a - b);
  if (bodyX.length < 2) return;
  const typicalX = bodyX[Math.floor(bodyX.length / 2)];
  blocks.forEach((block, index) => {
    if (block.type !== 'paragraph' || groups[index].length !== 1 || block.text.length > 12 || /^\p{L}$/u.test(block.text) || /[.!?=]/.test(block.text) ||
        /\d/.test(block.text) ||
        /^(?:CHAPTER|PART|BOOK|SECTION)\b/i.test(block.text) || prose.some(text => text.includes(block.text))) return;
    const line = groups[index][0];
    const prior = groups[index - 1]?.at(-1), next = groups[index + 1]?.[0];
    const isolated = (!prior || Math.abs(prior.y - line.y) >= median * 2) && (!next || Math.abs(line.y - next.y) >= median * 2);
    const outOfColumn = Math.abs(line.x - typicalX) >= pageWidth * .18;
    const titleRegion = line.y >= pageHeight * .55 && (prior || next) && outOfColumn;
    const abnormal = /^[^\p{L}\p{N}]+$/u.test(block.text) || /[\ufffd\p{Co}\p{Cc}]/u.test(block.text);
    const styled = line.fontSize <= median * .75 || line.fontSize >= median * 1.5 || line.letterSpaced;
    if (isolated && outOfColumn && (abnormal || titleRegion && styled)) block.contentRole = 'decorative';
  });
}

// Deliberately small: unfamiliar splits retain their source boundary space.
const unmarkedSplits = new Set(['pres|ent', 'interpre|tation', 'pur|suit']);

function joinParagraphLines(lines: Line[]): string {
  const normalLeft = Math.min(...lines.map(line => line.x));
  const joins = lines.map((line, index) => {
    if (!index) return false;
    const previous = lines[index - 1];
    const tail = previous.text.match(/(?:^|\s)([a-z]+)$/u)?.[1];
    const head = line.text.match(/^([a-z]+)(?=\s|[.,;:!?]|$)/u)?.[1];
    if (!tail || !head || !unmarkedSplits.has(`${tail}|${head}`)) return false;
    if (line.column !== previous.column || Math.abs(line.x - normalLeft) > previous.fontSize * .5 ||
        Math.abs(line.fontSize - previous.fontSize) > previous.fontSize * .1 ||
        previous.y - line.y < previous.fontSize * .9 || previous.y - line.y > previous.fontSize * 1.5) return false;
    const comparable = lines.filter(other => other !== previous && other !== line &&
      other.column === previous.column && Math.abs(other.x - normalLeft) <= previous.fontSize * .5 &&
      Math.abs(other.fontSize - previous.fontSize) <= previous.fontSize * .1 &&
      other.width >= previous.fontSize * 12);
    const right = previous.x + previous.width;
    return comparable.filter(other => Math.abs(other.x + other.width - right) <= previous.fontSize * .75).length >= 2;
  });
  return lines.reduce((text, line, index) => {
    if (!index) return line.text.trim();
    const next = line.text.trim();
    if (/\p{L}\u00ad$/u.test(text) && /^\p{Ll}/u.test(next)) return text.slice(0, -1) + next;
    if (/\p{L}-$/u.test(text) && /^\p{Ll}/u.test(next)) return text + next;
    return text + (joins[index] ? '' : ' ') + next;
  }, '');
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
