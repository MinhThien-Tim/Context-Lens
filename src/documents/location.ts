export type DocumentLocation = TextDocumentLocation | PdfDocumentLocation | EpubDocumentLocation;

export interface TextDocumentLocation {
  absoluteOffset?: number;
  sectionId?: string;
  kind: 'text';
  scrollY: number;
  progress: number;
  updatedAt: number;
}

export interface PdfDocumentLocation {
  absoluteOffset?: number;
  kind: 'pdf';
  page: number;
  viewMode?: 'original' | 'reading';
  pageOffset?: number;
  textOffset?: number;
  textSource?: 'pdf' | 'ocr';
  scrollY: number;
  progress: number;
  updatedAt: number;
}

export interface EpubDocumentLocation {
  absoluteOffset?: number;
  kind: 'epub';
  chapter: number;
  cfi: string | null;
  scrollY: number;
  progress: number;
  updatedAt: number;
}

export const initialTextLocation = (): TextDocumentLocation => ({
  kind: 'text',
  scrollY: 0,
  progress: 0,
  updatedAt: Date.now()
});

export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function getScrollProgress(scrollY: number, scrollHeight: number, viewportHeight: number): number {
  const available = Math.max(0, scrollHeight - viewportHeight);
  return available === 0 ? 1 : clampProgress(scrollY / available);
}

export function getRestoreScrollY(location: TextDocumentLocation, scrollHeight: number, viewportHeight: number): number {
  const available = Math.max(0, scrollHeight - viewportHeight);
  const proportional = available * clampProgress(location.progress);
  if (!Number.isFinite(location.scrollY) || location.scrollY < 0) return proportional;
  // Layout can change after font or viewport changes. Prefer the ratio when the
  // absolute position and saved progress have drifted substantially.
  return Math.abs(location.scrollY - proportional) > viewportHeight ? proportional : location.scrollY;
}
