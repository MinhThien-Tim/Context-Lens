export interface DocumentSection {
  id: string;
  title: string;
  level: number;
  parentId?: string;
  page?: number;
  chapter?: number;
  offset?: number;
  href?: string;
}

/** Offsets use the rendered textContent coordinate system. */
export function htmlSections(html: string): { content: string; toc: DocumentSection[] } {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  const toc: DocumentSection[] = [];
  const parents: DocumentSection[] = [];
  for (const heading of body.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    const range = document.createRange();
    range.selectNodeContents(body);
    range.setEndBefore(heading);
    const level = Number(heading.tagName[1]);
    while (parents.length && parents[parents.length - 1].level >= level) parents.pop();
    const section = { id: `heading-${toc.length}`, title: heading.textContent?.trim() || 'Untitled section', level, parentId: parents.at(-1)?.id, offset: range.toString().length };
    toc.push(section); parents.push(section);
  }
  return { content: body.textContent ?? '', toc };
}

export function textSections(content: string): DocumentSection[] {
  const toc: DocumentSection[] = [];
  const pattern = /^(?:chapter|part|book|section)\s+(?:\d+|[IVXLCDM]+)(?:\s*[:.\-–—]\s*[^\n]{1,100})?\s*$/gim;
  for (const match of content.matchAll(pattern)) toc.push({ id: `text-${match.index}`, title: match[0].trim(), level: 1, offset: match.index });
  return toc;
}

interface OutlineItem { title: string; dest: string | unknown[] | null; items?: OutlineItem[] }
export async function pdfSections(items: OutlineItem[], resolve: (destination: string | unknown[]) => Promise<number | undefined>, offsets: number[]): Promise<DocumentSection[]> {
  const toc: DocumentSection[] = [];
  async function visit(items: OutlineItem[], level: number, parentId?: string) {
    for (const item of items) {
      const page = item.dest ? await resolve(item.dest).catch(() => undefined) : undefined;
      const id = `pdf-${toc.length}`;
      toc.push({ id, title: item.title, level, parentId, page, offset: page ? offsets[page - 1] : undefined });
      await visit(item.items ?? [], level + 1, id);
    }
  }
  await visit(items, 1);
  return toc;
}

export interface EpubNavItem { label: string; href: string; subitems?: EpubNavItem[] }
export function epubSections(items: EpubNavItem[], chapters: Array<{ href: string; offset: number; anchors: Record<string, number> }>): DocumentSection[] {
  const toc: DocumentSection[] = [];
  const normalize = (href: string) => new URL(href, 'https://epub.local/').pathname;
  function visit(items: EpubNavItem[], level: number, parentId?: string) {
    for (const item of items) {
      const [path, hash] = item.href.split('#');
      const index = chapters.findIndex(chapter => normalize(chapter.href) === normalize(path));
      const chapter = chapters[index];
      const id = `epub-${toc.length}`;
      toc.push({ id, title: item.label.trim(), level, parentId, href: item.href, chapter: chapter ? index + 1 : undefined, offset: chapter ? chapter.offset + (chapter.anchors[hash] ?? 0) : undefined });
      visit(item.subitems ?? [], level + 1, id);
    }
  }
  visit(items, 1);
  return toc;
}
