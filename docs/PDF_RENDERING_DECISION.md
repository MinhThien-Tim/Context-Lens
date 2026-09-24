# PDF rendering decision

Status: accepted for the first production deployment (2026-09-19).

Historical decision. Original-page rendering and opt-in single-page English OCR were subsequently implemented; see [stage 2 OCR verification](PDF_OCR_STAGE2_REPORT.md).

## Decision

Ship the current text-first PDF reader for born-digital PDFs. Add visual page rendering before OCR. Keep OCR out of the first deployment and reject image-only/scanned PDFs with the existing explicit error.

PDF.js is already lazy-loaded and can render pages without another runtime or server. A visual layer preserves diagrams, columns, tables, and page geometry while extracted text remains the selection, lookup, search, and accessibility source. Browser OCR adds a large model download, memory/CPU and battery cost, inconsistent bilingual accuracy, and a page-to-text mapping problem.

The initial release supports selectable-text PDFs up to 50 MB. It does not claim scanned-PDF support or page-faithful display. Visual rendering is the next PDF slice; OCR is reconsidered only after demand and device memory/thermal budgets are measured.

## Visual-rendering acceptance gate

- Render only the current page plus one adjacent page and release offscreen canvases.
- Cap device-pixel-ratio rendering; keep extracted text as the lookup/accessibility source.
- Test rotation, mixed page sizes, two-column text, links, and 50 MB documents.
- Pass VoiceOver/TalkBack navigation and memory tests on the oldest supported devices.
