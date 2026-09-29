# PDF unmarked line splits

## TASK

Plan a conservative repair for words split across PDF visual lines when the text layer has no hyphen, such as `pres` + `ent`, `interpre` + `tation`, and `pur` + `suit`.

## AFFECTED SUBSYSTEM

PDF extraction and line reconstruction only.

## CURRENT STATE / ROOT CAUSE

`classifyBlock()` passes only line strings to `joinLines()` in `src/documents/pdf/extractStructuredPages.ts`. The function removes an explicit soft hyphen, retains a hard hyphen, and otherwise inserts a space. It cannot use line geometry or distinguish an unmarked word split from an ordinary line break. Existing PDF tests cover both hyphen forms and canonical block offsets, but no unmarked split repair.

## LIKELY FILES

- `src/documents/pdf/extractStructuredPages.ts`
- `src/documents/pdf/extractStructuredPages.test.ts`
- `docs/reader.md` if implemented behavior changes its line-joining description

## ARCHITECTURAL INVARIANTS

- Keep block grouping and `classifyLine()` / structure classification unchanged. Consider repair only between consecutive `Line` values already in the same paragraph block and column.
- Preserve explicit soft-hyphen removal and visible hard-hyphen retention. Do not touch OCR, TOC, PDF navigation, or page-offset logic.
- Recalculate existing block offsets from the resulting text as currently done; assert that each block slice and shifted page offset still match. No new offset representation.
- Keep extraction local and synchronous. Do not import the lookup engine, dictionary registry, assets, or network services. `src/core/language/lexicon.ts` imports several lookup modules and is unsuitable here.

## IMPLEMENTATION PLAN

1. Keep the exported string-only `joinLines()` behavior for callers/tests. Add a narrowly scoped internal join path that receives the original `Line[]` for a paragraph block; run the existing soft/hard-hyphen rules first.
2. Infer a credible body right edge from repeated, comparable body lines in the same column, excluding headings, short lines, and outliers. Treat missing or unstable edge evidence as a reason to retain the space. Require the previous line's right edge to fall within a small font-relative tolerance of that edge; require the next line to start at the block's normal left margin, with compatible font size and ordinary line spacing.
3. Consider only a single trailing and leading lowercase alphabetic fragment, with no terminal punctuation, quote, digit, visible hyphen, or intervening block boundary. Require both fragments to have useful length; exclude common complete short words. Confirm the joined token against a **small, explicit PDF-local set of high-confidence words/splits** (including `present`, `interpretation`, `pursuit`) or an existing dependency-free local lexical utility if one is found during implementation. Do not use substring shape alone as lexical proof. A tiny set deliberately limits coverage; leave unknown splits spaced.
4. Preserve the rest of both lines verbatim, replacing only the one line-boundary space when all gates pass. Keep the ordinary space for every ambiguous candidate. Do not change grouping or classification to make a candidate qualify.
5. Update the line-joining statement in `docs/reader.md` to describe the narrow unmarked-split exception and its limited coverage.

## TESTS REQUIRED

- Add geometry-based `extractStructuredPage()` cases in `src/documents/pdf/extractStructuredPages.test.ts` with enough repeated body lines to establish the right edge: `pres` + `ent` → `present`, `interpre` + `tation` → `interpretation`, `pur` + `suit` → `pursuit`.
- Negative cases: `well-` + `known` stays `well-known`; soft hyphen behavior stays intact; sentence ending at a line boundary retains its space; heading followed by paragraph remains distinct; adjacent legitimate short words remain separate; unknown or weak-geometry split retains its space; different columns or blocks never join.
- Assert `plainText`, block text, block slice offsets, and `shiftStructuredPage()` end offsets for repaired examples. Keep existing real PDF excerpt expectations unless directly contradicted by confirmed high-confidence evidence.
- Primary verification after implementation: `npm.cmd run verify:pdf` on Windows (the documented `npm run verify:pdf`). Planner check: **NOT RUN**; this task changes only the plan.

## OUT OF SCOPE

Structure classification, OCR, TOC, navigation, broad dictionary integration, network lookup, generalized dehyphenation, and repairs lacking strong layout and lexical evidence.

## OPEN QUESTIONS / RISKS

- No geometry-only rule can reliably decide whether arbitrary adjacent letter fragments form a word. The narrow lexical set gives high precision but limited recall; broaden it only with reviewed cases and negative tests.
- A body edge inferred from too few lines or unusual layouts can be wrong. Fail closed to a normal space when edge evidence is unstable.
