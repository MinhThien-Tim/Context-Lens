import type { PdfSourceTextItem } from './types';

const line = (str: string, y: number, x = 40, size = 12, width = 480): PdfSourceTextItem => ({ str, width, height: size, transform: [size, 0, 0, size, x, y] });

/** Small synthetic PDF.js item samples; coordinates and source order are explicit. */
export const readingExtractionSamples = {
  book: [line('The first paragraph ends here.', 700, 40, 12, 210), line('A new paragraph starts here', 684, 58), line('and continues on the next line.', 668)],
  article: [line('Research findings', 740, 40, 16), line('The article explains the findings', 700), line('with a second line of evidence.', 684), line('Another paragraph follows.', 650)],
  furniture: [line('Journal of Reading', 780, 40, 9), line('Methods', 740, 40, 16), line('Readers compare the available evidence', 700), line('before drawing a conclusion.', 684), line('Journal of Reading — 12', 20, 40, 9)],
  hyphens: [line('A well-', 700), line('known example uses inter\u00ad', 684), line('national evidence and re-', 668), line('creation as distinct terms.', 652)],
};
