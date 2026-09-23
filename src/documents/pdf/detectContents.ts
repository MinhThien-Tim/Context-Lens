import type { DocumentSection } from '../sections';
import type { PdfSourceTextItem, PdfStructuredPage } from './types';

interface SourcePage { number: number; height: number; width: number; items: PdfSourceTextItem[] }
interface Row { text: string; title: string; label: string; y: number; x: number; right: number; page: number }
interface Link { rect: number[]; dest?: string | unknown[] | null }

const CONTENTS_TITLE = /^(?:table of contents|contents|sum[aá]rio|[ií]ndice|sommaire|inhalt(?:sverzeichnis)?|indice|目录|目次|mục lục)\s*$/iu;
const NUMBER = /^(?:\d{1,4}|[ivxlcdm]{1,12})$/i;
const LEADER = /[.·•…]{2,}/g;

function normalize(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLocaleLowerCase();
}

function lines(page: SourcePage): Array<{ y: number; parts: Array<{ text: string; x: number; right: number }> }> {
  const result: ReturnType<typeof lines> = [];
  for (const item of page.items.filter(item => item.str.trim()).sort((a, b) => (b.transform[5] ?? 0) - (a.transform[5] ?? 0) || (a.transform[4] ?? 0) - (b.transform[4] ?? 0))) {
    const y = item.transform[5] ?? 0;
    const x = item.transform[4] ?? 0;
    const line = result.find(candidate => Math.abs(candidate.y - y) <= Math.max(2, Math.abs(item.transform[3] ?? 12) * .3));
    const part = { text: item.str.trim(), x, right: x + item.width };
    if (line) line.parts.push(part);
    else result.push({ y, parts: [part] });
  }
  return result.map(line => ({ ...line, parts: line.parts.sort((a, b) => a.x - b.x) }));
}

function rows(page: SourcePage): { rows: Row[]; hasTitle: boolean } {
  const pageLines = lines(page);
  const hasTitle = pageLines.some(line => CONTENTS_TITLE.test(line.parts.map(part => part.text).join(' ').trim()));
  const entries: Row[] = [];
  for (const [lineIndex, line] of pageLines.entries()) {
    const parts = line.parts;
    if (parts.length < 2) {
      const match = parts[0]?.text.match(/^(.{3,120}?)\s*(?:[.·•…]{2,}\s*)?(\d{1,4}|[ivxlcdm]{1,12})$/i);
      if (match && /[.·•…]{2,}|\s{2,}/.test(parts[0].text)) entries.push({ text: parts[0].text, title: match[1].replace(LEADER, '').trim(), label: match[2], y: line.y, x: parts[0].x, right: parts[0].right, page: page.number });
      continue;
    }
    let start = 0;
    for (let index = 1; index < parts.length; index++) {
      const numberPart = parts[index];
      const prior = parts[index - 1];
      if (!NUMBER.test(numberPart.text) || numberPart.x < page.width * .34 || numberPart.x - prior.right < 12 && !/^[.·•…]+$/.test(prior.text)) continue;
      const titleParts = parts.slice(start, index);
      let title = titleParts.map(part => part.text).join(' ').replace(LEADER, '').trim();
      const preceding = pageLines[lineIndex - 1];
      if (start === 0 && preceding && line.y < preceding.y && preceding.y - line.y < 28 && Math.abs(preceding.parts[0].x - titleParts[0].x) < 12 && !preceding.parts.some(part => NUMBER.test(part.text) && part.x > page.width * .34)) {
        const continuation = preceding.parts.map(part => part.text).join(' ').trim();
        if (!CONTENTS_TITLE.test(continuation) && continuation.length + title.length < 140) title = `${continuation} ${title}`;
      }
      if (title.length >= 3 && title.length <= 140 && !/^\d+$/.test(title)) entries.push({ text: titleParts.map(part => part.text).join(' ') + ' ' + numberPart.text, title, label: numberPart.text, y: line.y, x: titleParts[0].x, right: numberPart.right, page: page.number });
      start = index + 1;
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

/** Conservative fallback for PDFs without a usable outline. */
export async function detectPdfContents(
  sourcePages: SourcePage[], pages: PdfStructuredPage[], offsets: number[], labels: string[] | null,
  getLinks: (page: number) => Promise<Link[]>, resolve: (destination: string | unknown[]) => Promise<number | undefined>
): Promise<DocumentSection[]> {
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
  const matches = allRows.map(row => chapterPage(row.title, row.page, pages));
  const shifts = allRows.map((row, index) => matches[index] && numeric(row.label) !== undefined ? matches[index]! - numeric(row.label)! : undefined).filter((value): value is number => value !== undefined);
  const agreedShift = shifts.length >= 2 && shifts.every(value => value === shifts[0]) ? shifts[0] : undefined;
  const links = new Map<number, Link[]>();
  for (const candidate of selected) links.set(candidate.page.number, await getLinks(candidate.page.number).catch(() => []));
  const toc: DocumentSection[] = [];
  for (const [index, row] of allRows.entries()) {
    const annotation = links.get(row.page)?.find(link => link.dest && link.rect.length >= 4 && row.y >= Math.min(link.rect[1], link.rect[3]) - 5 && row.y <= Math.max(link.rect[1], link.rect[3]) + 5 && row.right >= Math.min(link.rect[0], link.rect[2]) && row.x <= Math.max(link.rect[0], link.rect[2]));
    const linkedPage = annotation?.dest ? await resolve(annotation.dest).catch(() => undefined) : undefined;
    const labelMatches = labels?.flatMap((label, pageIndex) => label.toLowerCase() === row.label.toLowerCase() && pageIndex + 1 > row.page ? [pageIndex + 1] : []) ?? [];
    const page = linkedPage ?? matches[index] ?? (labelMatches.length === 1 ? labelMatches[0] : undefined) ?? (agreedShift !== undefined && numeric(row.label) !== undefined ? numeric(row.label)! + agreedShift : undefined);
    const validPage = page && page > row.page && page <= offsets.length ? page : undefined;
    const level = row.x > selected[0].page.width * .08 + (selected[0].rows[0]?.x ?? 0) ? 2 : 1;
    toc.push({ id: `pdf-printed-${index}`, title: row.title, level, parentId: level === 2 ? [...toc].reverse().find(item => item.level === 1)?.id : undefined, page: validPage, pageLabel: row.label, offset: validPage ? offsets[validPage - 1] : undefined });
  }
  // A page-number list without corroborated destinations is too easy to mistake for an index.
  return toc.filter(item => item.offset !== undefined).length >= 2 ? toc : [];
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
