import { htmlSections, textSections, pdfSections, epubSections, epubHeadingSections } from '../sections';
import { initialTextLocation } from '../location';
import { ImportError, type ImportedDocument, type ImportOptions } from './types';
import { extractStructuredPage, shiftStructuredPage } from '../pdf/extractStructuredPages';
import type { PdfSourceTextItem, PdfStructuredPage } from '../pdf/types';
import { detectPdfContents, inferPdfHeadings } from '../pdf/detectContents';

const MAX_TEXT_BYTES = 5 * 1024 * 1024;
const MAX_BOOK_BYTES = 50 * 1024 * 1024;

export async function importLocalFile(file: File, options: ImportOptions = {}): Promise<ImportedDocument> {
  throwIfAborted(options.signal);
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'txt' || extension === 'md' || extension === 'markdown') return importText(file, extension === 'txt' ? 'text' : 'markdown', options);
  if (extension === 'pdf') return importPdf(file, options);
  if (extension === 'epub') return importEpub(file, options);
  if (extension === 'docx') return importDocx(file, options);
  throw new ImportError('Choose a TXT, Markdown, PDF, EPUB, or DOCX file.', 'unsupported');
}

async function importText(file: File, kind: 'text' | 'markdown', options: ImportOptions): Promise<ImportedDocument> {
  if (file.size > MAX_TEXT_BYTES) throw new ImportError('This text file is larger than the 5 MB limit.', 'too_large');
  const content = await readFileText(file);
  throwIfAborted(options.signal);
  if (!content.trim()) throw new ImportError('This file does not contain readable text.', 'invalid_file');
  if (kind === 'markdown') {
    options.onProgress?.({ stage: 'extracting', completed: 0, total: 1, label: 'Rendering Markdown' });
    const [{ marked }, { sanitizeReaderHtml }] = await Promise.all([import('marked'), import('./sanitize')]);
    const safeHtml = sanitizeReaderHtml(await marked.parse(content, { gfm: true }));
    return { title: baseName(file.name), kind, ...htmlSections(safeHtml), safeHtml, location: initialTextLocation() };
  }
  return { title: baseName(file.name), kind, content, toc: textSections(content), location: initialTextLocation() };
}

async function importPdf(file: File, options: ImportOptions): Promise<ImportedDocument> {
  if (file.size > MAX_BOOK_BYTES) throw new ImportError('This PDF is larger than the 50 MB limit.', 'too_large');
  try {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const loadingTask = pdfjs.getDocument({ data: bytes });
    const pdf = await loadingTask.promise;
    const metadata = await pdf.getMetadata().catch(() => null);
    const pages: string[] = [];
    const pdfPages: PdfStructuredPage[] = [];
    const pageOffsets: number[] = [];
    const sourcePages: Array<{ number: number; width: number; height: number; items: PdfSourceTextItem[] }> = [];
    const outline = await pdf.getOutline().catch(() => null) ?? [];
    let offset = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      throwIfAborted(options.signal);
      options.onProgress?.({ stage: 'extracting', completed: pageNumber - 1, total: pdf.numPages, label: `Extracting page ${pageNumber} of ${pdf.numPages}` });
      const page = await pdf.getPage(pageNumber);
      const text = await page.getTextContent();
      const viewport = page.getViewport?.({ scale: 1 }) ?? { width: 612, height: 792 };
      const sourceItems = text.items.filter((item): item is Extract<typeof item, { str: string }> => 'str' in item).map((item, index) => ({ str: item.str, transform: item.transform ?? [12, 0, 0, 12, 36, viewport.height - 36 - index * 16], width: item.width ?? item.str.length * 6, height: item.height ?? 12, hasEOL: item.hasEOL, fontName: item.fontName })) as PdfSourceTextItem[];
      if (!outline.length && pageNumber <= Math.min(40, Math.max(12, Math.ceil(pdf.numPages * .15)))) sourcePages.push({ number: pageNumber, width: viewport.width, height: viewport.height, items: sourceItems });
      const structured = extractStructuredPage(pageNumber, sourceItems, viewport.width, viewport.height);
      const pageText = structured.plainText;
      pageOffsets.push(offset);
      pages.push(pageText);
      pdfPages.push(shiftStructuredPage(structured, offset));
      offset += pageText.length + 2;
      page.cleanup();
    }
    const resolveDestination = async (destination: string | unknown[]) => {
      const dest = typeof destination === 'string' ? await pdf.getDestination(destination) : destination;
      if (!dest?.length) return undefined;
      const target = dest[0];
      const index = typeof target === 'number' ? target : await pdf.getPageIndex(target as { num: number; gen: number });
      return index >= 0 && index < pdf.numPages ? index + 1 : undefined;
    };
    const outlineToc = await pdfSections(outline, resolveDestination, pageOffsets);
    const pageLabels = !outlineToc.length ? await pdf.getPageLabels?.().catch(() => null) ?? null : null;
    const printedToc = outlineToc.length ? [] : await detectPdfContents(sourcePages, pdfPages, pageOffsets, pageLabels, async pageNumber => {
      const page = await pdf.getPage(pageNumber);
      try { return await page.getAnnotations({ intent: 'display' }); }
      finally { page.cleanup(); }
    }, resolveDestination);
    const toc = outlineToc.length ? outlineToc : printedToc.length ? printedToc : inferPdfHeadings(pdfPages, pageOffsets);
    await loadingTask.destroy();
    const content = pages.join('\n\n');
    const info = metadata?.info as { Title?: string } | undefined;
    return {
      title: info?.Title?.trim() || baseName(file.name), kind: 'pdf', content, data: file,
      pageOffsets, pdfPages, toc, tocSource: outlineToc.length ? 'pdf-outline' : printedToc.length ? 'pdf-printed' : toc.length ? 'pdf-headings' : 'none', tocVersion: 2, location: { kind: 'pdf', page: 1, pageOffset: 0, textOffset: 0, scrollY: 0, progress: 0, updatedAt: Date.now() }
    };
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError('Unable to read this PDF.', 'invalid_file');
  }
}

async function importEpub(file: File, options: ImportOptions): Promise<ImportedDocument> {
  if (file.size > MAX_BOOK_BYTES) throw new ImportError('This EPUB is larger than the 50 MB limit.', 'too_large');
  let book: import('epubjs').Book | null = null;
  try {
    const { default: ePub } = await import('epubjs');
    book = ePub(await file.arrayBuffer());
    await book.ready;
    const metadata = await book.loaded.metadata;
    const spineItems: import('epubjs/types/section').default[] = [];
    book.spine.each((section: import('epubjs/types/section').default) => spineItems.push(section));
    const chapters: string[] = [];
    const chapterMap: Array<{ href: string; offset: number; anchors: Record<string, number>; headings: Array<{ title: string; level: number; offset: number }> }> = [];
    const chapterOffsets: number[] = [];
    let offset = 0;
    for (let itemIndex = 0; itemIndex < spineItems.length; itemIndex++) {
      throwIfAborted(options.signal);
      options.onProgress?.({ stage: 'extracting', completed: itemIndex, total: spineItems.length, label: `Extracting chapter ${itemIndex + 1} of ${spineItems.length}` });
      const section = spineItems[itemIndex];
      await Promise.resolve(section.load(book.load.bind(book)));
      const chapterDocument = section.document;
      const body = chapterDocument.querySelector('body');
      const text = body?.textContent ?? '';
      const anchors: Record<string, number> = {};
      const headings: Array<{ title: string; level: number; offset: number }> = [];
      for (const element of body?.querySelectorAll('[id]') ?? []) {
        const range = chapterDocument.createRange(); range.selectNodeContents(body!); range.setEndBefore(element);
        anchors[element.id] = range.toString().length;
      }
      for (const heading of body?.querySelectorAll('h1,h2,h3,h4,h5,h6') ?? []) {
        const range = chapterDocument.createRange(); range.selectNodeContents(body!); range.setEndBefore(heading);
        const title = heading.textContent?.trim();
        if (title) headings.push({ title, level: Number(heading.tagName[1]), offset: range.toString().length });
      }
      if (!headings.length) for (const paragraph of body?.querySelectorAll('p') ?? []) {
        const title = paragraph.textContent?.trim() ?? '';
        if (!textSections(title).length) continue;
        const range = chapterDocument.createRange(); range.selectNodeContents(body!); range.setEndBefore(paragraph);
        headings.push({ title, level: 1, offset: range.toString().length });
      }
      {
        chapterMap.push({ href: section.href, offset, anchors, headings });
        chapterOffsets.push(offset);
        chapters.push(text);
        offset += text.length + 2;
      }
      section.unload();
    }
    const content = chapters.join('\n\n');
    if (!content) throw new ImportError('No readable text was found in this EPUB.', 'extraction');
    const navigation = await book.loaded.navigation;
    const navigationToc = epubSections(navigation.toc ?? [], chapterMap);
    return {
      title: metadata.title?.trim() || baseName(file.name), kind: 'epub', content, data: file,
      chapterOffsets, toc: navigationToc.length ? navigationToc : epubHeadingSections(chapterMap), tocSource: navigationToc.length ? 'epub-nav' : 'epub-headings', tocVersion: 2, source: { author: metadata.creator },
      location: { kind: 'epub', chapter: 1, cfi: null, scrollY: 0, progress: 0, updatedAt: Date.now() }
    };
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError('Unable to read this EPUB.', 'invalid_file');
  } finally {
    book?.destroy();
  }
}

async function importDocx(file: File, options: ImportOptions): Promise<ImportedDocument> {
  if (file.size > MAX_BOOK_BYTES) throw new ImportError('This DOCX is larger than the 50 MB limit.', 'too_large');
  try {
    options.onProgress?.({ stage: 'extracting', completed: 0, total: 1, label: 'Extracting Word document' });
    throwIfAborted(options.signal);
    const module = await import('mammoth');
    const mammoth = module.default;
    const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }, { styleMap: [
      "p[style-name='Chapter Title'] => h1:fresh",
      "p[style-name='Part Title'] => h1:fresh",
      "p[style-name='Book Title'] => h1:fresh",
      "p[style-name='Section Title'] => h2:fresh",
      "p[style-name='Subsection Title'] => h3:fresh",
      "p[style-name='Título 1'] => h1:fresh",
      "p[style-name='Título 2'] => h2:fresh"
    ] });
    throwIfAborted(options.signal);
    const { sanitizeReaderHtml } = await import('./sanitize');
    const safeHtml = sanitizeReaderHtml(result.value);
    const { content, toc } = htmlSections(safeHtml);
    if (!content) throw new ImportError('No readable text was found in this DOCX.', 'extraction');
    return { title: baseName(file.name), kind: 'docx', content, toc, safeHtml, data: file, location: initialTextLocation() };
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError('Unable to read this DOCX.', 'invalid_file');
  }
}

function baseName(name: string): string {
  return name.replace(/\.(?:txt|md|markdown|pdf|epub|docx)$/i, '') || 'Untitled reading';
}

function readFileText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('File read failed'));
    reader.readAsText(file);
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ImportError('Import cancelled.', 'cancelled');
}
