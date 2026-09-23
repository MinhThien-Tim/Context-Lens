import type { DocumentLocation } from '../location';
import type { DocumentRecord } from '../../db/database';
import type { PdfStructuredPage } from '../pdf/types';

export interface ImportedDocument {
  toc?: DocumentRecord['toc'];
  tocSource?: DocumentRecord['tocSource'];
  tocVersion?: number;
  title: string;
  kind: DocumentRecord['kind'];
  content: string;
  data?: Blob;
  safeHtml?: string;
  pageOffsets?: number[];
  pdfPages?: PdfStructuredPage[];
  chapterOffsets?: number[];
  source?: DocumentRecord['source'];
  location: DocumentLocation;
}

export interface ImportProgress {
  stage: 'reading' | 'extracting';
  completed: number;
  total: number;
  label: string;
}

export interface ImportOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ImportProgress) => void;
}

export class ImportError extends Error {
  constructor(message: string, readonly code: 'unsupported' | 'too_large' | 'cors' | 'network' | 'extraction' | 'invalid_file' | 'cancelled') {
    super(message);
    this.name = 'ImportError';
  }
}
