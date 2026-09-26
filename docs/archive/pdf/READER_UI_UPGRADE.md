# Reader UI upgrade

## Implementation

- `ReaderShell`, `ReaderToolbar`, `ContentsPanel`, `DocumentPosition` and the
  navigation helpers separate reader layout and location handling from app orchestration.
- Desktop starts at 1024px. Optional 270px Contents and 340px context panels leave
  the reading column centered when closed. Smaller screens use drawers/sheets.
- Semantic surface, text, border, selection, danger, overlay and shadow tokens
  reuse the existing light/dark/system palette. Controls have visible focus and
  44px touch targets; reduced-motion preferences disable transitions.
- `QuickExplain` contains selection identity, POS/IPA and brief EN/VI meanings.
  `ExpandedExplain` adds local detail. Language controls, vocabulary, pronunciation,
  notes, settings and explicit provider actions remain outside Quick.
- Mobile sheets trap focus; desktop panels do not. Escape collapses Expanded,
  then closes Quick. Selection identity includes its offset, so selecting the same
  word elsewhere resets expansion without re-running language-mode requests.
- Navigation uses rendered text ranges, not scroll-percentage estimates of PDF
  pages. Original page boundaries, including empty pages, survive extraction.
  EPUB extraction uses the library's actual Spine.each and Section.document runtime
  contracts; its shipped declarations do not accurately describe the load result.
- PDF outline destinations, nested EPUB href/fragment destinations, sanitized
  HTML headings and conservative TXT headings provide local TOCs. No LLM is used.
- Notes capture location when the editor opens, preserve selection and sentence,
  support document notes, and focus/briefly mark the target paragraph on return.

## Data compatibility

Dexie v10 adds optional `DocumentRecord.toc` and `NoteRecord.structuredLocation`
without rewriting earlier migrations or manufacturing locations for legacy notes.
Locations optionally carry a rendered `absoluteOffset`; text locations may include
`sectionId`. Page/chapter totals derive from existing offsets, avoiding duplicate data.

Portable backup v3 preserves these fields and accepts v1/v2. API keys, AI caches
and original binary files remain excluded, following the established backup policy.
Legacy documents without TOC metadata derive HTML/TXT headings when opened; older
PDF/EPUB imports need re-importing to extract their native outlines/navigation.

## Verification

- Full Vitest suite, TypeScript, production build and bundle-budget check.
- Tests cover Quick/Expanded visibility, selection reset, deep failure retention,
  mobile-only focus trapping, page bounds/blank pages, EPUB runtime and chapter
  mapping, nested TOCs, legacy migration/notes, anchored notes and backup v3.
- Browser smoke checks at desktop and 390px mobile: three-column reading, quick
  explanation, expanded actions, selected-text note creation/jump, and themes.
- No provider, gateway, cache-key or prompt semantics were changed.

## Limits

PDF reading remains extracted text, not visual page rendering. EPUB positions use
chapter plus rendered text offset; native CFI rendering remains reserved for a future
renderer. Missing/unresolvable destinations stay disabled. OCR, full annotations,
cloud sync and physical Android/iOS accessibility QA remain outside this change.
The changes form one integrated commit because shared location contracts and UI
props connect import, reader and notes; no intermediate incomplete API is committed.
