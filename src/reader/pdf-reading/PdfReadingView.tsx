import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { DocumentRecord } from '../../db/database';
import type { PdfDocumentLocation } from '../../documents/location';
import { PdfReadingPage } from './PdfReadingPage';
import { PdfReadingNavigation } from './PdfReadingNavigation';
import { readingPagesForDocument } from './structuredPages';
import type { ReaderSelection } from '../TextReader';
import { readingSelectionFromDom, readingWordAtPoint } from './readingSelectionAdapter';

export function PdfReadingView({ documentRecord, location, style, onOriginal, onLocation, onLookup, onAddNote }: { documentRecord: DocumentRecord; location: PdfDocumentLocation; style: Record<string, string | number>; onOriginal: () => void; onLocation: (location: PdfDocumentLocation) => void; onLookup: (selection: ReaderSelection) => void; onAddNote: (selection: ReaderSelection) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ignoreClick = useRef(false);
  const [pending, setPending] = useState<ReaderSelection | null>(null);
  const pages = useMemo(() => readingPagesForDocument(documentRecord), [documentRecord]);
  const goTo = (page: number) => rootRef.current?.querySelector(`[data-pdf-reading-page="${Math.max(1, Math.min(pages.length, page))}"]`)?.scrollIntoView({ block: 'start' });
  const captureSelection = () => {
    if (!rootRef.current) return null;
    const next = readingSelectionFromDom(rootRef.current, documentRecord.content);
    if (next) { setPending(next); ignoreClick.current = true; }
    return next;
  };
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
    return () => observer.disconnect();
  }, [documentRecord.id]);
  useEffect(() => { requestAnimationFrame(() => goTo(location.page)); }, [location.page]);
  useEffect(() => {
    let timer: number | undefined;
    const capture = () => {
      clearTimeout(timer);
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !rootRef.current?.contains(selection.anchorNode) || !rootRef.current?.contains(selection.focusNode)) return;
      timer = window.setTimeout(captureSelection, 160);
    };
    document.addEventListener('selectionchange', capture);
    return () => { clearTimeout(timer); document.removeEventListener('selectionchange', capture); };
  }, [documentRecord.id, documentRecord.content]);
  return <div class="pdf-reading-view" style={style}>
    <PdfReadingNavigation page={location.page} total={pages.length} onPrevious={() => goTo(location.page - 1)} onNext={() => goTo(location.page + 1)} onOriginal={onOriginal} />
    <div ref={rootRef} class="pdf-reading-scroll" onPointerUp={() => window.setTimeout(captureSelection, 0)} onKeyUp={event => { if (event.shiftKey) captureSelection(); }} onClick={event => {
      if (ignoreClick.current) { ignoreClick.current = false; return; }
      const nativeSelection = window.getSelection();
      if (nativeSelection && !nativeSelection.isCollapsed) return;
      const next = rootRef.current && readingWordAtPoint(rootRef.current, documentRecord.content, event.clientX, event.clientY);
      if (next) onLookup(next);
    }}>{pages.map(page => <PdfReadingPage key={page.pageNumber} page={page} />)}</div>
    {pending && <div class="pdf-reading-selection-actions" role="toolbar" aria-label="Selected text actions"><button onPointerDown={event => event.preventDefault()} onClick={() => onLookup(pending)}>Explain</button><button onPointerDown={event => event.preventDefault()} onClick={() => onAddNote(pending)}>Note</button><button onPointerDown={event => event.preventDefault()} onClick={() => void navigator.clipboard?.writeText(pending.text)}>Copy</button><button aria-label="Close selection actions" onClick={() => { setPending(null); window.getSelection()?.removeAllRanges(); }}>×</button></div>}
  </div>;
}
