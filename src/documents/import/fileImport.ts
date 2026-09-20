import { htmlSections, textSections, pdfSections, epubSections } from '../sections';
import { initialTextLocation } from '../location';
import { ImportError, type ImportedDocument, type ImportOptions } from './types';

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
    const pageOffsets: number[] = [];
    let offset = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      throwIfAborted(options.signal);
      options.onProgress?.({ stage: 'extracting', completed: pageNumber - 1, total: pdf.numPages, label: `Extracting page ${pageNumber} of ${pdf.numPages}` });
      const page = await pdf.getPage(pageNumber);
      const text = await page.getTextContent();
      const pageText = text.items.map((item) => 'str' in item ? item.str : '').join(' ').replace(/\s+/g, ' ').trim();
      pageOffsets.push(offset);
      pages.push(pageText);
      offset += pageText.length + 2;
      page.cleanup();
    }
    const toc = await pdfSections(await pdf.getOutline().catch(() => null) ?? [], async destination => {
      const dest = typeof destination === 'string' ? await pdf.getDestination(destination) : destination;
      if (!dest?.length) return undefined;
      const target = dest[0];
      const index = typeof target === 'number' ? target : await pdf.getPageIndex(target as { num: number; gen: number });
      return index >= 0 && index < pdf.numPages ? index + 1 : undefined;
    }, pageOffsets);
    await loadingTask.destroy();
    const content = pages.join('\n\n');
    if (!content.trim()) throw new ImportError('No selectable text was found in this PDF. Scanned PDFs are not supported yet.', 'extraction');
    const info = metadata?.info as { Title?: string } | undefined;
    return {
      title: info?.Title?.trim() || baseName(file.name), kind: 'pdf', content, data: file,
      pageOffsets, toc, location: { kind: 'pdf', page: 1, scrollY: 0, progress: 0, updatedAt: Date.now() }
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
    const chapterMap: Array<{ href: string; offset: number; anchors: Record<string, number> }> = [];
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
      for (const element of body?.querySelectorAll('[id]') ?? []) {
        const range = chapterDocument.createRange(); range.selectNodeContents(body!); range.setEndBefore(element);
        anchors[element.id] = range.toString().length;
      }
      {
        chapterMap.push({ href: section.href, offset, anchors });
        chapterOffsets.push(offset);
        chapters.push(text);
        offset += text.length + 2;
      }
      section.unload();
    }
    const content = chapters.join('\n\n');
    if (!content) throw new ImportError('No readable text was found in this EPUB.', 'extraction');
    return {
      title: metadata.title?.trim() || baseName(file.name), kind: 'epub', content, data: file,
      chapterOffsets, toc: epubSections((await book.loaded.navigation).toc, chapterMap), source: { author: metadata.creator },
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
    const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
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
