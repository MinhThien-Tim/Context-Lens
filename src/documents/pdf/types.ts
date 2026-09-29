export type PdfExtractionQuality = 'good' | 'partial' | 'poor';
export type PdfTextIntegrity = 'valid' | 'suspect' | 'corrupt';

export type PdfTextBlock = {
  id: string;
  type: 'heading' | 'paragraph' | 'dialogue' | 'list' | 'quote' | 'footnote' | 'toc-entry';
  text: string;
  startOffset: number;
  endOffset: number;
  /** Optional native-PDF presentation hint; absent on legacy blocks. */
  contentRole?: 'semantic' | 'decorative' | 'uncertain';
  level?: 1 | 2 | 3;
  speaker?: string;
  items?: string[];
  /** Present on newly imported, exactly aligned printed Contents rows only. */
  title?: string;
  printedPageLabel?: string;
  resolvedPage?: number;
};

export interface PdfStructuredPage {
  pageNumber: number;
  pageLabel?: string;
  startOffset: number;
  endOffset: number;
  plainText: string;
  blocks: PdfTextBlock[];
  extractionQuality: PdfExtractionQuality;
  /** Absent on legacy imports: their character integrity has not been assessed. */
  textIntegrity?: PdfTextIntegrity;
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
