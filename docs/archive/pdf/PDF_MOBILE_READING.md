# PDF mobile Reading mode

## Baseline

Before this change, PDF Reading reused the continuous `TextReader`, so page boundaries and basic document structure were lost. At mobile widths the 98 px shared header and a wrapping PDF toolbar consumed several rows. Original view used Fit page, which made printed text too small. PDF selection offsets were inferred from the rendered text layer rather than persisted canonical text.

The automated baseline passed TypeScript and the existing PDF/reader tests. Playwright covers browser-level touch input and the production long-press fallback; Android Chrome's OS selection handles remain a manual release check because the repository has no physical-device harness.

## Implementation

- Mobile uses a one-row 54 px reader header. Secondary actions live in an accessible menu.
- Original view uses Fit width on mobile and keeps zoom/fit actions in More.
- Imported PDFs retain serializable structured pages with canonical offsets, semantic blocks and extraction quality. Blank/scanned pages remain explicit page records.
- Reading renders one semantic DOM section per PDF page with reflowed typography and compact page navigation.
- Mobile defaults to Reading when usable extracted text exists. Scan-only documents fall back to Original.
- Selection listens to `selectionchange` and interaction completion without a fixed debounce. Original view retains a canonical selection snapshot through scroll and text-layer rerenders. On touch devices, a held word also has a coordinate-based fallback when the browser does not expose its native selection in time; the fallback uses the same canonical PDF index and does not synthesize a DOM selection.
- Existing PDF records without structured pages use a conservative page-level paragraph fallback.

## Manual acceptance checklist

- Check portrait widths 360, 390, 412 and 430 px and landscape orientation.
- Confirm the header and PDF navigation never wrap or require horizontal scrolling.
- On Android Chrome, long-press a word, drag both handles, then use Explain, Note and Copy.
- Change browser chrome height and confirm the `100dvh` reading surface remains usable above the safe area.
- Switch Original/Reading and use Contents, page navigation and a note jump on the same page.
- Check light, dark and system themes.

## Limits

OCR is not included. Extraction heuristics intentionally fall back on uncertain layouts rather than invent structure. Repeated running headers/footers are not removed unless they can be identified safely. Selection spanning multiple Original pages remains separate hardening work. Physical Android selection handles and accessibility still require release QA on a device; browser automation covers the production long-press fallback.
