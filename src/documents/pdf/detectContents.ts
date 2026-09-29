import type { DocumentSection } from '../sections';
import type { PdfSourceTextItem, PdfStructuredPage } from './types';

export interface SourcePage { number: number; height: number; width: number; items: PdfSourceTextItem[] }
interface Row { text: string; title: string; label: string; y: number; x: number; right: number; page: number }
export interface PrintedRow extends Row { level: 1 | 2; resolvedPage?: number }
interface Link { rect: number[]; dest?: string | unknown[] | null }

const CONTENTS_TITLE = /^(?:table of contents|contents|sum[aá]rio|[ií]ndice|sommaire|inhalt(?:sverzeichnis)?|indice|目录|目次|mục lục)\s*$/iu;
const NUMBER = /^(?:\d{1,4}|[ivxlcdm]{1,12})$/i;
const LEADER = /[.·•…]{2,}/g;

function normalize(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLocaleLowerCase();
}

interface Part { text: string; x: number; right: number; size: number }
interface VisualLine { y: number; parts: Part[] }
const leaderOnly = /^[.\u00b7\u2022\u2026]+$/;

function lines(page: SourcePage): VisualLine[] {
  const result: VisualLine[] = [];
  const items = page.items.map(item => ({
    text: item.str.trim(), x: item.transform[4], y: item.transform[5],
    right: item.transform[4] + item.width, size: Math.abs(item.transform[3]) || item.height
  })).filter(part => part.text && [part.x, part.y, part.right, part.size].every(Number.isFinite) && part.right >= part.x && part.size > 0);
  for (const part of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = result.find(candidate => Math.abs(candidate.y - part.y) <= Math.max(2, Math.min(part.size, candidate.parts[0].size) * .3));
    if (line) line.parts.push(part);
    else result.push({ y: part.y, parts: [part] });
  }
  return result.map(line => ({ ...line, parts: line.parts.sort((a, b) => a.x - b.x) }));
}

function rows(page: SourcePage): { rows: Row[]; hasTitle: boolean } {
  const pageLines = lines(page);
  const hasTitle = pageLines.some(line => CONTENTS_TITLE.test(line.parts.map(part => part.text).join(' ').trim()));
  const rightLabels = pageLines.flatMap(line => line.parts.filter(part => NUMBER.test(part.text) && part.x > page.width * .72));
  const leftLabels = pageLines.flatMap(line => line.parts.filter(part => NUMBER.test(part.text) && part.x > page.width * .34 && part.x < page.width * .5));
  const twoColumns = rightLabels.length >= 1 && leftLabels.length >= 1 &&
    pageLines.some(line => line.parts.some(part => part.x < page.width * .25) && line.parts.some(part => part.x > page.width * .5 && !NUMBER.test(part.text)));
  const regions = twoColumns ? [[0, page.width * .5], [page.width * .5, page.width]] : [[0, page.width]];
  const entries: Row[] = [];
  for (const [minX, maxX] of regions) {
    const regionLines = pageLines.map(line => ({ y: line.y, parts: line.parts.filter(part => part.x >= minX && part.x < maxX) })).filter(line => line.parts.length);
    const candidates = regionLines.flatMap(line => {
      const parts = line.parts;
      const last = parts.at(-1)!;
      if (parts.length === 1) {
        const match = last.text.match(/^(.{3,120}?)\s*(?:[.\u00b7\u2022\u2026]{2,}\s*)?(\d{1,4}|[ivxlcdm]{1,12})$/i);
        if (!match || !/[.\u00b7\u2022\u2026]{2,}|\s{2,}/.test(last.text)) return [];
        return [{ line, label: match[2], labelX: last.right, labelRight: last.right, titleParts: [last], title: match[1].replace(LEADER, '').trim(), text: last.text }];
      }
      if (!NUMBER.test(last.text) || last.x < minX + (maxX - minX) * .55) return [];
      const before = parts.slice(0, -1).filter(part => !leaderOnly.test(part.text));
      if (!before.length || last.x - before.at(-1)!.right < 12 && !parts.slice(0, -1).some(part => leaderOnly.test(part.text))) return [];
      const numbered = before.length > 1 && NUMBER.test(before[0].text) && before[1].x - before[0].right >= 8;
      const titleParts = numbered ? before.slice(1) : before;
      const title = titleParts.map(part => part.text).join(' ').replace(LEADER, '').trim();
      return [{ line, label: last.text, labelX: last.x, labelRight: last.right, titleParts, title, text: parts.map(part => part.text).join(' ') }];
    }).filter(candidate => candidate.title.length >= 3 && candidate.title.length <= 140 && !/^\d+$/.test(candidate.title));
    const aligned = candidates.filter(candidate => candidates.filter(peer =>
      Math.abs(peer.labelX - candidate.labelX) <= 8 || Math.abs(peer.labelRight - candidate.labelRight) <= 8
    ).length >= (twoColumns ? 1 : hasTitle ? 2 : 5));
    if (aligned.length < (twoColumns ? 1 : 2)) continue;
    for (const candidate of aligned) {
      const first = candidate.titleParts[0];
      const preceding = regionLines.find(line => line.y > candidate.line.y && line.y - candidate.line.y < 28 &&
        !aligned.some(peer => peer.line === line) && line.parts.length &&
        Math.abs(line.parts[0].x - first.x) < 12 &&
        !line.parts.some(part => NUMBER.test(part.text) && part.x > minX + (maxX - minX) * .55));
      const continuation = preceding?.parts.map(part => part.text).join(' ').trim();
      const title = continuation && !CONTENTS_TITLE.test(continuation) && continuation.length + candidate.title.length < 140
        ? continuation + ' ' + candidate.title : candidate.title;
      entries.push({ text: continuation && title !== candidate.title ? continuation + ' ' + candidate.text : candidate.text, title, label: candidate.label, y: candidate.line.y,
        x: first.x, right: candidate.line.parts.at(-1)!.right, page: page.number });
    }
  }
  return { rows: entries, hasTitle };
}

function chapterPage(title: string, tocPage: number, pages: PdfStructuredPage[]): number | undefined {
  const target = normalize(title);
  if (target.length < 4) return undefined;
  for (const page of pages) {
    if (page.pageNumber <= tocPage) continue;
    const beginning = page.blocks.slice(0, 5).some(block => {
      const text = normalize(block.text);
      return text === target || text.startsWith(`${target} `) && text.length <= target.length + 45;
    });
    if (beginning) return page.pageNumber;
  }
  return undefined;
}

function numeric(label: string): number | undefined {
  return /^\d+$/.test(label) ? Number(label) : undefined;
}

/** Recognize printed rows without consulting destinations or assuming the whole book is present. */
export function recognizePdfContents(sourcePages: SourcePage[]): PrintedRow[] {
  const candidates = sourcePages.map(page => ({ page, ...rows(page) }));
  const tocPages = candidates.filter(candidate => candidate.rows.length >= 3 && (candidate.hasTitle || candidate.rows.length >= 6));
  if (!tocPages.length) return [];
  const firstPage = tocPages[0].page.number;
  const selected: typeof candidates = [];
  for (const candidate of candidates.filter(candidate => candidate.page.number >= firstPage && candidate.page.number <= firstPage + 5)) {
    if (selected.length && candidate.rows.length < 2) break;
    selected.push(candidate);
  }
  const allRows = selected.flatMap(candidate => {
    const twoColumns = candidate.rows.some(row => row.x > candidate.page.width * .5) && candidate.rows.some(row => row.x < candidate.page.width * .25);
    return twoColumns ? [...candidate.rows].sort((a, b) => Number(a.x > candidate.page.width * .5) - Number(b.x > candidate.page.width * .5) || b.y - a.y) : candidate.rows;
  });
  if (allRows.length < 3) return [];
  return allRows.map(row => {
    const column = row.x >= selected.find(candidate => candidate.page.number === row.page)!.page.width * .5 ? 1 : 0;
    const peers = allRows.filter(peer => peer.page === row.page && Number(peer.x >= selected.find(candidate => candidate.page.number === peer.page)!.page.width * .5) === column);
    const base = Math.min(...peers.map(peer => peer.x));
    return { ...row, level: row.x - base >= 14 ? 2 : 1 };
  });
}

/** Resolve destinations separately; printed navigation retains its two-target gate. */
export async function resolvePdfContents(
  allRows: PrintedRow[], pages: PdfStructuredPage[], offsets: number[], labels: string[] | null,
  getLinks: (page: number) => Promise<Link[]>, resolve: (destination: string | unknown[]) => Promise<number | undefined>
): Promise<{ rows: PrintedRow[]; navigation: DocumentSection[] }> {
  if (!allRows.length) return { rows: [], navigation: [] };
  const matches = allRows.map(row => chapterPage(row.title, row.page, pages));
  const shifts = allRows.map((row, index) => matches[index] && numeric(row.label) !== undefined ? matches[index]! - numeric(row.label)! : undefined).filter((value): value is number => value !== undefined);
  const agreedShift = shifts.length >= 2 && shifts.every(value => value === shifts[0]) ? shifts[0] : undefined;
  const links = new Map<number, Link[]>();
  for (const page of new Set(allRows.map(row => row.page))) links.set(page, await getLinks(page).catch(() => []));
  const toc: DocumentSection[] = [];
  const resolvedRows: PrintedRow[] = [];
  for (const [index, row] of allRows.entries()) {
    const annotation = links.get(row.page)?.find(link => link.dest && link.rect.length >= 4 && row.y >= Math.min(link.rect[1], link.rect[3]) - 5 && row.y <= Math.max(link.rect[1], link.rect[3]) + 5 && row.right >= Math.min(link.rect[0], link.rect[2]) && row.x <= Math.max(link.rect[0], link.rect[2]));
    const linkedPage = annotation?.dest ? await resolve(annotation.dest).catch(() => undefined) : undefined;
    const labelMatches = labels?.flatMap((label, pageIndex) => label.toLowerCase() === row.label.toLowerCase() && pageIndex + 1 > row.page ? [pageIndex + 1] : []) ?? [];
    const page = linkedPage ?? matches[index] ?? (labelMatches.length === 1 ? labelMatches[0] : undefined) ?? (agreedShift !== undefined && numeric(row.label) !== undefined ? numeric(row.label)! + agreedShift : undefined);
    const validPage = Number.isInteger(page) && page! > row.page && page! <= offsets.length && Number.isFinite(offsets[page! - 1]) ? page : undefined;
    resolvedRows.push({ ...row, resolvedPage: validPage });
    toc.push({ id: `pdf-printed-${index}`, title: row.title, level: row.level, parentId: row.level === 2 ? [...toc].reverse().find(item => item.level === 1)?.id : undefined, page: validPage, pageLabel: row.label, offset: validPage ? offsets[validPage - 1] : undefined });
  }
  // A page-number list without corroborated destinations is too easy to mistake for an index.
  return { rows: resolvedRows, navigation: toc.filter(item => item.offset !== undefined).length >= 2 ? toc : [] };
}

/** Conservative fallback for PDFs without a usable outline. */
export async function detectPdfContents(
  sourcePages: SourcePage[], pages: PdfStructuredPage[], offsets: number[], labels: string[] | null,
  getLinks: (page: number) => Promise<Link[]>, resolve: (destination: string | unknown[]) => Promise<number | undefined>
): Promise<DocumentSection[]> {
  return (await resolvePdfContents(recognizePdfContents(sourcePages), pages, offsets, labels, getLinks, resolve)).navigation;
}

/** Tag only a unique, whole canonical block matching a recognized printed row. */
export function tagPdfContents(pages: PdfStructuredPage[], rows: PrintedRow[]): PdfStructuredPage[] {
  const comparable = (text: string) => text.trim().replace(/\s+/g, ' ');
  return pages.map(page => {
    const pageRows = rows.filter(row => row.page === page.pageNumber);
    if (!pageRows.length) return page;
    const blocks = page.blocks.map(block => {
      const matches = pageRows.filter(row => comparable(row.text) === comparable(block.text));
      const matchingBlocks = page.blocks.filter(candidate => comparable(candidate.text) === comparable(block.text));
      if (matches.length !== 1 || matchingBlocks.length !== 1) return block;
      const row = matches[0];
      return { ...block, type: 'toc-entry' as const, title: row.title, printedPageLabel: row.label, resolvedPage: row.resolvedPage, level: row.level };
    });
    return { ...page, blocks };
  });
}

/** Chapter headings provide a last resort when the file has neither bookmarks nor a printed TOC. */
export function inferPdfHeadings(pages: PdfStructuredPage[], offsets: number[]): DocumentSection[] {
  const sections: DocumentSection[] = [];
  const pattern = /^(?:book|part|chapter|section|volume|livro|parte|cap[ií]tulo|chapitre|livre|kapitel|chương|phần|quyển)\s+(?:\d+|[IVXLCDM]+)\b/i;
  for (const page of pages) {
    if (page.extractionQuality === 'poor' || CONTENTS_TITLE.test(page.blocks[0]?.text.trim() ?? '')) continue;
    for (const block of page.blocks.slice(0, 3)) {
      const title = block.text.trim();
      if (!pattern.test(title) || title.length > 100) continue;
      // A TOC row has a trailing page number; a chapter opening normally does not.
      if (/\s(?:\d{1,4}|[ivxlcdm]{1,12})$/i.test(title.replace(pattern, '').trim())) continue;
      sections.push({ id: `pdf-heading-${page.pageNumber}-${sections.length}`, title, level: 1, page: page.pageNumber, offset: offsets[page.pageNumber - 1] });
      break;
    }
  }
  return sections.length >= 2 ? sections : [];
}
