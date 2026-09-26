# PDF OCR — stage 2 verification

Date: 2026-09-24

## Implemented

- PDF.js keeps the original page. OCR is offered only when the current page has fewer than 40 extracted characters; import never starts OCR.
- A click renders that page to a canvas capped at 3 million pixels and a 4096-pixel edge, then loads Tesseract.js and English data. One worker is reused for completed jobs. Cancel terminates it; retry creates a new worker.
- Progress, cancel, errors and retry are visible. OCR text is stored in Dexie by document ID, page, language and configuration version. The original PDF and extracted text are unchanged.
- Reading mode exposes OCR text for selection, lookup, vocabulary save and notes, with a one-click return to the original page. A cached result suppresses the OCR button after reopening. Deleting a document deletes its OCR records.

## Verification

- Typecheck, all Vitest tests and production build passed (278 passed, 1 skipped).
- Browser OCR tests passed on Chrome laptop (1366 × 900) and Pixel 7 emulation: scanned page import, recognition, lookup, vocabulary save, selected-text note, note location, mode switch, reopen without OCR, document deletion and cancel/retry.
- Production preview passed the scanned-page end-to-end test. The `ocr-reader` bundle remains lazy and is excluded from service-worker precache.
- A blurred two-column image-only PDF was recognized. Output was `FIRST COLUMN SECOND COLUMN` followed by the two body lines left-to-right. OCR reading order for columns is therefore not reliable; the original page remains the reference.

## Measurements

The synthetic clear scan was 1224 × 1584 JPEG pixels on one 612 × 792 PDF page. Measurements are from Chromium browser tests, not physical devices, and include first-load runtime/model work. They are observations, not speed targets.

| Browser profile | OCR click to text | JS heap before | JS heap after |
| --- | ---: | ---: | ---: |
| Laptop Chrome | 4.01 s | 114.1 MB | 118.0 MB |
| Pixel 7 emulation | 4.07 s | 122.3 MB | 121.0 MB |

The request observer saw approximately 2.95 MB for English trained data, 1.37 MB for the selected Tesseract core script, 0.03 MB for its worker and 0.04 MB for the development module. These figures are transferred response bodies observed in this test; they do not cover every browser cache or peak memory allocation. The UI advises an estimated 5–10 MB for the first OCR download.

## Remaining limits

- English only. Vietnamese data and an English + Vietnamese choice require separate size and quality tests.
- OCR may miss or reorder words on faint, rotated, mixed-layout or multi-column scans. No OCR text overlay is placed on the original page.
- Physical phone testing, accessibility testing with VoiceOver/TalkBack, peak memory profiling and low-storage testing remain open. Multi-page OCR is not enabled.
