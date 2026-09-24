export type PdfExtractionQuality = 'good' | 'partial' | 'poor';

export type PdfTextBlock = {
  id: string;
  type: 'heading' | 'paragraph' | 'dialogue' | 'list' | 'quote' | 'footnote';
  text: string;
  startOffset: number;
  endOffset: number;
  level?: 1 | 2 | 3;
  speaker?: string;
  items?: string[];
};

export interface PdfStructuredPage {
  pageNumber: number;
  pageLabel?: string;
  startOffset: number;
  endOffset: number;
  plainText: string;
  blocks: PdfTextBlock[];
  extractionQuality: PdfExtractionQuality;
  /** True when PDF operators contain a painted image; absent for older imports. */
  hasImage?: boolean;
}

export interface PdfSourceTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
  fontName?: string;
}
