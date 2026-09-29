# PDF text integrity detection

## TASK

Add a conservative, local integrity assessment for characters returned by PDF.js, separate from the existing `good | partial | poor` extraction-quality estimate. This stage detects bad mappings; it does not change OCR execution or page-source selection.

## AFFECTED SUBSYSTEM

PDF import-time structured extraction only. Follow `docs/ARCHITECTURE.md` and `docs/reader.md`.

## CURRENT STATE / ROOT CAUSE

`extractStructuredPage` calls text `good` when it is at least 24 characters and lacks four layout symptoms. It never checks character validity. In the supplied `C:\Users\Admin\Downloads\unfixpages.pdf`, PDF.js extraction of pages 16, 18, and 20 is labeled `good` despite control characters and encoded symbol sequences; pages 17 and 19 are only `partial`. Pages 17–20 have 60–1,526 control characters in the raw joined PDF.js items. By contrast, `unfixpages2.pdf` pages 1–3 contain mostly readable prose with spacing/recognition defects and are `partial`; they must not be called corrupt. The existing `e2e/fixtures/transformer-xl/P19-1285.pdf` is a readable academic regression sample.

## LIKELY FILES

- Production: `src/documents/pdf/types.ts`, `src/documents/pdf/extractStructuredPages.ts` only.
- Tests: `src/documents/pdf/extractStructuredPages.test.ts`; extend `src/documents/pdf/ocrEligibility.test.ts` and the existing legacy-page test in `src/reader/pdf-reading/PdfReadingPage.test.tsx` only if needed to pin compatibility and unchanged OCR eligibility.
- Update `docs/reader.md` to describe the new persisted metadata and its limited use.

## ARCHITECTURAL INVARIANTS

Keep one `PdfStructuredPage` model and all current `plainText`, block text, page offsets, and `shiftStructuredPage` behavior. Do not normalize or delete suspicious characters. Do not change Original rendering, Reading Mode extraction, OCR worker/queue/eligibility, text-source choice, or selection/lookup paths. No dictionary, API, or network calls.

## IMPLEMENTATION PLAN

1. Choose **B**: retain `PdfExtractionQuality`; add optional `textIntegrity?: 'valid' | 'suspect' | 'corrupt'` to `PdfStructuredPage`. Set it for newly extracted pages, including empty pages (`valid` means no corruption observed; `extractionQuality: 'poor'` still expresses absent text). Missing metadata on stored/legacy pages means *unassessed* and preserves present behavior. `shiftStructuredPage` already copies extra page fields. This is an additive stored-object type change, with no IndexedDB schema/index migration or backfill; old imports require reimport to receive an assessment.
2. Add a small, pure assessment helper beside the existing quality calculation; assess the extracted page text without changing it. Count C0/C1 controls except ordinary whitespace, U+FFFD, and private-use code points as strong evidence. Require both a minimum count and meaningful non-whitespace ratio, and distribution beyond a single isolated item/line, before calling a page corrupt. A single malformed glyph should at most be suspect.
3. Use supporting evidence only in combination: excessive symbols embedded in would-be words (excluding dotted contents leaders and ordinary punctuation), implausible mixed letter/digit/symbol tokens, repeated mojibake-like sequences, and fractured Latin word spacing across substantive lines. Check script-aware token composition; do not score unfamiliar words, diacritics, CJK spacing, academic names, formulas, short headings, or isolated decorative glyphs as corruption by themselves. Entropy and letter-spacing alone are insufficient. Keep `suspect` for ambiguous/mixed pages and `corrupt` for widespread independent evidence; tune thresholds against the supplied PDFs and clean fixtures.
4. Do not reinterpret `textIntegrity` as `extractionQuality: 'poor'` or wire it into OCR eligibility in this stage. A later, separately reviewed change can decide how corrupt pages affect Reading Mode and OCR. Normal pages therefore retain current OCR candidate behavior.

## TESTS REQUIRED

- Normal prose and the real Transformer-XL excerpt: `valid`; existing quality and exact text/block offsets unchanged.
- Short headings, letter-spaced title, isolated decorative glyph, dotted contents, and non-English/diacritic or academic tokens: never `corrupt`; preserve existing quality results.
- Empty/scan-only page: `poor` quality, empty text, no false corruption.
- Small escaped PDF.js item excerpts from `unfixpages.pdf` pages 17–20: `corrupt` despite current `good`/`partial` quality; page 16 may be `suspect` unless enough independent evidence supports `corrupt`. Include readable `unfixpages2.pdf` excerpts as negative controls.
- One replacement/private-use/control glyph amid readable prose: not `corrupt`; repeated, distributed bad mappings: `corrupt`. Assert source strings, canonical `plainText`, block spans, and shifted page offsets are unchanged.
- Legacy `PdfStructuredPage` without `textIntegrity` still loads; readable pages do not newly pass `ocrCandidate`.
- Verification after implementation: `npm.cmd run verify:pdf` (PowerShell). Do not run browser E2E unless a later change reaches rendering or OCR execution. Planner checks: **NOT RUN** (diagnosis used direct PDF.js inspection; no code changed).

## OUT OF SCOPE

OCR execution/eligibility and automatic scheduling, Original PDF rendering, zoom/pan, text-layer selection, lookup, annotations, navigation, page offsets, re-extraction of stored documents, or a second Reading Mode pipeline.

## OPEN QUESTIONS / RISKS

PDFs whose broken mapping yields only ordinary-looking letters may remain `suspect` or `valid` without linguistic evidence. Prefer that false negative to classifying uncommon or non-English readable text as corrupt. Calibrate on real page excerpts before fixing numeric thresholds.
