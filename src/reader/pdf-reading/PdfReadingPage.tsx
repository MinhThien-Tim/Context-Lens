import type { PdfStructuredPage } from '../../documents/pdf/types';
import type { ReaderHighlight } from '../../db/database';
import { PdfReadingBlock } from './PdfReadingBlock';

export function PdfReadingPage({ page, highlights = [] }: { page: PdfStructuredPage; highlights?: ReaderHighlight[] }) {
  return <section class="pdf-reading-page" data-pdf-reading-page={page.pageNumber} data-reader-text aria-labelledby={`pdf-page-label-${page.pageNumber}`}>
    <header id={`pdf-page-label-${page.pageNumber}`}>{page.pageLabel ?? `Page ${page.pageNumber}`}</header>
    <div class="pdf-reading-content">{page.blocks.length ? page.blocks.map(block => <PdfReadingBlock key={block.id} block={block} highlights={highlights} />) : <p class="pdf-reading-empty">This page has no extractable text. Switch to Original to view the page.</p>}</div>
  </section>;
}
