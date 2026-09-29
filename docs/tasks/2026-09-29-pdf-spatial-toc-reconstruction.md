# PDF spatial TOC reconstruction

## TASK

Reconstruct printed PDF Contents entries from visual geometry when PDF.js TextItem order separates chapter numbers, titles, and printed page numbers.

## AFFECTED SUBSYSTEM

PDF extraction and printed TOC recognition. Role for this artifact: Planner. Architecture route: `docs/reader.md`.

## CURRENT STATE / ROOT CAUSE

`recognizePdfContents` in `src/documents/pdf/detectContents.ts` groups items by baseline, then treats each sufficiently rightward numeric part encountered in a line as a page label. It cannot reliably distinguish a leading entry number from a trailing page label, and its row assembly assumes the needed title and label appear in one recoverable line. PDF.js may emit complete number and title columns in separate sequences. The current two-column ordering and conservative destination gate must survive the reconstruction change.

## LIKELY FILES

`src/documents/pdf/detectContents.ts`, `src/documents/pdf/detectContents.test.ts`; a small geometry helper in `src/documents/pdf/` only if it avoids duplicated PDF coordinate handling. Consult `src/documents/pdf/types.ts`, `extractStructuredPages.ts`, and `src/documents/import/fileImport.ts` for the source-item, canonical-block, and import contracts. Update `docs/reader.md` if recognition control flow or supported layouts change. Avoid changing the structured-page extractor solely to repair TOC recognition.

## ARCHITECTURAL INVARIANTS

Preserve canonical `plainText`, `pageOffsets`, block offsets, and the stored `PdfStructuredPage` contract. Recognition produces visual rows independently of destination resolution. Existing link annotations, chapter heading matches, unique PDF page labels, and agreed numeric shift remain the only destination evidence; an accepted printed navigation still needs two verified targets. A recognized unresolved entry remains visual-only under the preceding TOC representation contract. Outline navigation retains priority. No OCR, Original Reader, global Reading Mode layout, Quick Card, dictionary, or network changes.

## IMPLEMENTATION PLAN

1. Convert native TextItems into bounded visual tokens with baseline, horizontal extent, and font size. Cluster by baseline with tolerance scaled to text size, then order tokens by x within each cluster. Derive rows from geometry rather than source array order; reject items with unusable geometry conservatively.
2. Infer one or two TOC regions per page from repeated title/label alignments and a credible gutter. For each region, detect a repeated right-side printed-page-label column and an optional separate left-side entry-number column. Associate titles with the trailing label by row position, including when PDF.js emits all labels before all titles. Prevent a left entry number from being consumed as the printed page label. Treat dotted leaders as separators, not title words. Support both title + page and number + title + page rows.
3. Join nearby continuation baselines into wrapped titles only when x alignment, vertical spacing, and absence of a competing page label support the association. Keep a visible row's source page, baseline, left/right bounds, reconstructed text, title, and printed label sufficient for annotation overlap and conservative canonical tagging. Infer level from title-region indentation relative to peer rows within the same column, rather than from absolute page x. Order two-column rows down the left column, then down the right, and preserve continued-page behavior.
4. Require page-level TOC evidence before returning rows: a Contents heading or a sufficiently repeated, aligned title/terminal-label pattern, with existing early-page and continuation bounds. Reject isolated numeric lists, body prose, and indexes with ambiguous or non-repeated row structure. Do not accept a list solely because printed numbers increase. Preserve the current three-row minimum and conservative navigation threshold unless tests establish a narrower equivalent rule.
5. Feed reconstructed rows to `resolvePdfContents` without adding destination inference. Keep `tagPdfContents` exact and unique against canonical blocks; if spatial reconstruction cannot match a complete canonical block, leave that block unchanged and keep the recognized row available for navigation resolution. Do not synthesize offsets or rewrite structured-page text to force visual tagging.

## TESTS REQUIRED

- Geometric unit fixtures with deliberately shuffled TextItem order: title + dotted leader + page; three-part number + title + page; title and number split across multiple TextItems; all printed-page labels emitted as one separate sequence.
- Wrapped title with its label on the final baseline, plus indented subentries; assert title, label, row order, and level. Include a title-only continuation baseline that must not become a separate entry.
- Existing two-column and continued-page behavior, with both columns sharing y positions and distinct label columns. Assert left-column-then-right-column ordering and per-column indentation.
- Destination regression: valid links, heading matches, unique PDF labels, and agreed shift resolve reconstructed rows; zero or one verified target leaves navigation empty, with unresolved entries remaining visual-only. Check out-of-range and ambiguous targets.
- False positives: an ordinary numbered list and an index or unrelated numeric page with no credible TOC structure must not become printed navigation or falsely tagged TOC entries. Include a numeric sequence without titles as a rejection case.
- Canonical tagging regression: only a unique whole matching block becomes `toc-entry`; its original text and offsets remain unchanged. A reconstructed row whose source text is distributed across blocks remains untagged rather than gaining fabricated offsets.
- Authoritative implementation verification: `npm.cmd run verify:pdf`. Add `verify:import` only if import behavior changes. Browser E2E is conditional on a UI interaction change. Planning/document check: inspect this spec and its diff; application tests `NOT RUN`.

## OUT OF SCOPE

Rewriting the structured-page extractor; OCR for native text; new target inference from printed numbers; page-offset or Original Reader changes; global Reading Mode layout; Quick Card and dictionary work.

## OPEN QUESTIONS / RISKS

Some PDFs place a chapter number and printed page label in similar horizontal positions, or extract a multi-column page with overlapping baselines. The implementation should require repeated column evidence and leave ambiguous rows unresolved/unrecognized rather than pair numbers across regions. Canonical block extraction may not contain a whole spatial row, so visual tagging can remain incomplete while destination resolution still succeeds.
