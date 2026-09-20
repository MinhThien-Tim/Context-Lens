export function PdfReadingNavigation({ page, total, onPrevious, onNext, onOriginal }: { page: number; total: number; onPrevious: () => void; onNext: () => void; onOriginal: () => void }) {
  return <nav class="pdf-reading-navigation" aria-label="PDF reading navigation"><button aria-label="Previous page" disabled={page <= 1} onClick={onPrevious}>‹</button><span>Page {page} / {total}</span><button aria-label="Next page" disabled={page >= total} onClick={onNext}>›</button><button class="pdf-reading-original" onClick={onOriginal}>Original</button></nav>;
}
