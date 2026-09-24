import type { PdfStructuredPage } from '../../documents/pdf/types';
import type { ReaderHighlight } from '../../db/database';
import { PdfReadingBlock } from './PdfReadingBlock';

export function PdfReadingPage({ page, highlights = [], hasOcr = false, onSource }: { page: PdfStructuredPage; highlights?: ReaderHighlight[]; hasOcr?: boolean; onSource?: (source: 'pdf' | 'ocr') => void }) {
  return <section class="pdf-reading-page" data-pdf-reading-page={page.pageNumber} data-reader-text aria-labelledby={`pdf-page-label-${page.pageNumber}`}>
    <header id={`pdf-page-label-${page.pageNumber}`}>{page.pageLabel ?? `Page ${page.pageNumber}`}{hasOcr && <label> Nguồn chữ <select aria-label={`Nguồn chữ trang ${page.pageNumber}`} value="pdf" onChange={event => onSource?.(event.currentTarget.value as 'pdf' | 'ocr')}><option value="pdf">Chữ PDF</option><option value="ocr">Chữ OCR</option></select></label>}</header>
    <div class="pdf-reading-content">{page.blocks.length ? page.blocks.map(block => <PdfReadingBlock key={block.id} block={block} highlights={highlights} />) : <p class="pdf-reading-empty">This page has no extractable text. Switch to Original to view the page.</p>}</div>
  </section>;
}
