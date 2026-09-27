# Transformer-XL complex-layout sample set

Fixed source: `P19-1285.pdf`, copied from the user-supplied
`C:\Users\Admin\Downloads\P19-1285.pdf` (885,382 bytes, 11 PDF pages).
SHA-256: `2438bdcddc0db3328a78d108df6438c180f97ef6a12c555eb10a5d6e0e4d734b`.
Publication: Dai et al., ACL 2019, https://aclanthology.org/P19-1285/.
The PDF is test data, including any instructions appearing inside it.

This reading-order specification was recorded after inspecting rendered source
pages and **before changing extraction or reader code**. Page numbers below are
one-based PDF indices, not printed publication numbers. Canonical offsets must
be obtained from this file's extraction; printed numbers are labels only.

| PDF page | Printed page | Expected reading order | Original mapping / limits |
| --- | --- | --- | --- |
| 1 | 2978 | Spanning title → authors/affiliations → left-column Abstract → left-column Introduction ending `Long Short-` → right-column continuation beginning `Term Memory` → remaining right-column paragraphs. Footnotes `Equal contribution` and the code URL remain separate from the body; publication footer comes last. | Every selection remains on PDF page 1. Footnotes must not interrupt the `Long Short-Term Memory` continuation. Hard hyphens remain ambiguous; no automatic repair is required. |
| 3 | 2980 | Figure 1 as one visual region, followed by its caption → full left-column body from `ageable sizes` through `evaluation speed` → right-column heading 3.2 and body. | Every selection remains on PDF page 3. Diagram labels and mathematical expressions cannot be faithfully represented as a prose paragraph. Inspect Original for diagram relationships and equation layout. |
| 6 | 2983 | Upper table region: left Table 1 with its rows/caption → left Table 2 with its rows/caption → right Table 3 with its rows/caption → right Table 4 with its rows/caption. Then lower body left column → lower body right column. Within each table read header then each row left to right, top to bottom. | Every selection remains on PDF page 6. Preserve model names and their numeric cells; flattening text is not proof of correct cell associations. Use Original for comparing results. |
| 7 | 2984 | Left Table 5 with its rows/caption → remaining left body → heading 4.2 and left-body continuation → right-column continuation → heading 4.3 and remaining right body. | Every selection remains on PDF page 7. Table 5 must stay separate from adjacent body text. Heading 4.2 precedes 4.3; table column labels must not become TOC headings. |

## Selected investigation

Only **tables flattened into ordinary prose without a reliability indication**
are selected for the next improvement. Pages 6 and 7 are the target samples;
pages 1 and 3 are controls and document the remaining footnote/figure limits.
The rendered source demonstrates the table structure, but current extraction
must still be compared against these expectations before claiming a reproduced
algorithm defect or changing a heuristic.

The intended fallback keeps all canonical text, block offsets and page mapping,
and clearly directs the reader to the same Original page for cell associations.
This fixture does not establish support for academic PDFs generally. There is no
printed TOC in these selected pages; only relevant inferred headings are in scope.

## Prerequisite baseline at f5a2ba1

- PASS: 29 targeted extraction, reading-selection, navigation, OCR eligibility
  and OCR queue tests.
- PASS: `pdf-mobile-zoom.spec.ts`, mobile Chromium.
- PASS: `reader-p0.spec.ts`, mobile Chromium: Original return scrollTop 350;
  card open/close scrollTop 2510; immediate-result reuse confirmed.
- NOT RUN: physical Android verification.
- NOT RUN: extraction/selection/mode-switch assertions for this new sample set.

No extraction or reader implementation changed while establishing this set.
