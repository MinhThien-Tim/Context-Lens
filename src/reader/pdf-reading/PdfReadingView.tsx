import { useEffect, useMemo, useRef } from 'preact/hooks';
import type { DocumentRecord } from '../../db/database';
import type { PdfDocumentLocation } from '../../documents/location';
import { PdfReadingPage } from './PdfReadingPage';
import { PdfReadingNavigation } from './PdfReadingNavigation';
import { readingPagesForDocument } from './structuredPages';

export function PdfReadingView({ documentRecord, location, style, onOriginal, onLocation }: { documentRecord: DocumentRecord; location: PdfDocumentLocation; style: Record<string, string | number>; onOriginal: () => void; onLocation: (location: PdfDocumentLocation) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pages = useMemo(() => readingPagesForDocument(documentRecord), [documentRecord]);
  const goTo = (page: number) => rootRef.current?.querySelector(`[data-pdf-reading-page="${Math.max(1, Math.min(pages.length, page))}"]`)?.scrollIntoView({ block: 'start' });
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(entries => {
      const current = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!current) return;
      const page = Number((current.target as HTMLElement).dataset.pdfReadingPage);
      const model = pages[page - 1];
      const element = current.target as HTMLElement;
      const pageOffset = Math.max(0, -element.getBoundingClientRect().top) / Math.max(1, element.offsetHeight);
      const textOffset = Math.round(model.plainText.length * Math.min(1, pageOffset));
      onLocation({ kind: 'pdf', page, viewMode: 'reading', pageOffset, textOffset, absoluteOffset: model.startOffset + textOffset, scrollY: root.scrollTop, progress: pages.length ? (page - 1 + pageOffset) / pages.length : 0, updatedAt: Date.now() });
    }, { root, threshold: [.1, .35, .65] });
    root.querySelectorAll('[data-pdf-reading-page]').forEach(page => observer.observe(page));
    requestAnimationFrame(() => goTo(location.page));
    return () => observer.disconnect();
  }, [documentRecord.id]);
  return <div class="pdf-reading-view" style={style}>
    <PdfReadingNavigation page={location.page} total={pages.length} onPrevious={() => goTo(location.page - 1)} onNext={() => goTo(location.page + 1)} onOriginal={onOriginal} />
    <div ref={rootRef} class="pdf-reading-scroll">{pages.map(page => <PdfReadingPage key={page.pageNumber} page={page} />)}</div>
  </div>;
}
