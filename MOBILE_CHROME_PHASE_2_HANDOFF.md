# MobileChrome Phase 2 Implementation Handoff

## Summary of Work Completed

This document summarizes the MobileChrome (Phase 2) implementation of the Reader + Home Behavior Contract, building upon the completed ChromeFoundation (Phase 1).

### Changed Implementation Files (22 modified + 3 new)

**Modified Files:**
- `docs/reader-chrome-foundation.md` - Updated foundation spec
- `docs/reader.md` - Reader documentation updates
- `docs/ui-system.md` - UI system documentation
- `e2e/offline.spec.ts` - Offline functionality tests
- `e2e/pdf-mobile-zoom.spec.ts` - Mobile zoom tests
- `e2e/pdf-original-first-render-footer.spec.ts` - PDF footer tests
- `e2e/readerO.ts` - OCR helper updates
- `e2e/ui-interactions.spec.ts` - UI interaction tests (fixed failures)
- `src/app/App.tsx` - Application root updates
- `src/reader-layout.css` - Reader layout styles (fixed More popover positioning)
- `src/reader/ReaderProgress.tsx` - Footer progress component
- `src/reader/ReaderShell.test.tsx` - Reader shell unit tests
- `src/reader/ReaderShell.tsx` - Reader shell core logic
- `src/reader/ReaderToolbar.tsx` - Header toolbar component
- `src/reader/navigation.ts` - Navigation logic
- `src/reader/pdf/PdfModeSwitch.ocr.test.tsx` - OCR mode switch tests
- `src/reader/pdf/PdfModeSwitch.tsx` - PDF mode switch component
- `src/reader/pdf/PdfViewer.tsx` - PDF viewer component
- `src/reader/pdf/usePdfScroll.ts` - PDF scroll hook
- `src/styles.desktop-reader.css` - Desktop reader styles
- `src/styles.mobile-reader.css` - Mobile reader styles
- `src/styles.reader-base.css` - Base reader styles

**New Files (Untracked):**
- `docs/mobile-chrome.md` - Authoritative MobileChrome implementation spec (232 lines)
- `e2e/mobile-chrome.spec.ts` - New mobile behavioral e2e test suite
- `src/reader/programmaticScroll.ts` - Programmatic scroll tracking helpers

### Specification Migration

**New Authoritative Spec:**
- `docs/mobile-chrome.md` - Complete MobileChrome implementation-facing spec derived from the frozen T0e contract, covering:
  - §1–§12: Mobile presentation, Header/Footer/More composition, quiet/reveal behavior, action ownership, and test obligations
  - §8.1: Resolves previously-OPEN §6.9 reveal-control placement as the existing `reader-reveal` button
  - §10: Test obligations for mobile verification
  - §11: Deferred PDF/OCR items
  - §12: Known dependencies for Phase 3

**Updated Specs:**
- `docs/reader-chrome-foundation.md` - Phase 1 implementation-facing spec (responsive authority, chrome state machine)
- `docs/reader.md` - General Reader documentation
- `docs/ui-system.md` - UI system documentation

### Test Migration Results

**KEEP/REWRITE/DELETE Classification:**
- **KEEP**: Tests expressing valid product behavior (e.g., core ReaderShell quiet/reveal logic)
- **REWRITE**: Tests whose assumptions depended on obsolete 768px tablet behavior, tap-to-reveal, duplicate controls, Search, or FAB
- **DELETE**: Tests asserting explicitly obsolete behavior (e.g., Header-owned Contents/Context actions)

**Specific Test Changes:**
- `e2e/ui-interactions.spec.ts`: Rewrote the `action()` helper to use More disclosure at all widths (removed stale `desktopAdvanced` Header-duplicate branch)
- New mobile behavioral suite: `e2e/mobile-chrome.spec.ts` provides comprehensive viewport/interaction coverage

### Verification Results

**Targeted Verification:**
- `npm run check:css` → **PASS** (CSS syntax OK: 6 stylesheets parse cleanly)
- `npm run verify:reader` → **PASS** (typecheck + 23 unit tests passed in 4.42s)

**Viewport/Interaction Verification:**
The 12 previously failing tests at `e2e/ui-interactions.spec.ts:236` now pass:
- Reader shell Simple at 1024px keeps panels independent and navigation usable ✓
- Reader shell Advanced at 1024px keeps panels independent and navigation usable ✓
- Reader shell Simple at 1280px keeps panels independent and navigation usable ✓
- Reader shell Advanced at 1280px keeps panels independent and navigation usable ✓
- Reader shell Simple at 1366px keeps panels independent and navigation usable ✓
- Reader shell Advanced at 1366px keeps panels independent and navigation usable ✓
- Reader shell Simple at 1440px keeps panels independent and navigation usable ✓
- Reader shell Advanced at 1440px keeps panels independent and navigation usable ✓
- Reader shell Simple at 1920px keeps panels independent and navigation usable ✓
- Reader shell Advanced at 1920px keeps panels independent and navigation usable ✓
- Reader shell Simple at 390px keeps panels independent and navigation usable ✓
- Reader shell Advanced at 390px keeps panels independent and navigation usable ✓

### Root Causes of Previously Reported Failures

**Two distinct defects were identified and fixed:**

**Cause 1 - STALE TEST branch (Advanced @ ≥1024px):**
- The test's `action()` helper (lines 254-257) contained a `desktopAdvanced` branch that attempted to click Contents/Context panel buttons **inside `.reader-header`**
- Per contract §7.2 and implementation in `ReaderToolbar.tsx`, the Header owns **only** Back, title, and PDF Original/Reading control
- This branch could never resolve → `locator.click` timeout (120s)
- **FIX**: Removed the special case; all widths now use the More disclosure via `moreAction()`

**Cause 2 - CSS anchoring defect (Simple @ ≥1024px):**
- The More trigger was moved from `.reader-header-actions` into the Footer (`App.tsx:625`)
- However, `.reader-more-menu` retained `top:calc(100% + 6px)` from `styles.reader-base.css:13`
- Since `.reader-more` now lives at the bottom of the Footer band, this positioned the menu **below the viewport**
- **FIX**: Added upward-opening popover rule for ≥1024px: `top:auto; bottom:calc(100% + 6px);` with appropriate max-height

### Explicitly Deferred PDF/OCR Dependencies

Per the frozen contract and MobileChrome scope, the following items remain for Phase 3 (PDF/OCR controls):

1. **U6 preload defect**: Whether auto-preload should recognize intended first 12 candidates vs current hard-coded 6
2. **Desktop PDF zoom preset popover**: The `.pdf-more-menu` still exists at ≥1024px only (mobile zoom uses sheet)
3. **Terminal OCR strings**: Exact wording for OCR status states (active/resumable, terminal success, terminal error, cancelled/cleared)

### Exact Status of §6.9 (Reveal Control Placement)

**RESOLVED** as the reveal-only `reader-reveal` control per `docs/mobile-chrome.md` §8.1:
- Existing `reader-reveal` button (`.reader-shell .reader-reveal`, `aria-label="Show reading controls"`)
- Fixed overlay that does not participate in the scroll container's flow
- Reveal-only, no `aria-haspopup`/`aria-expanded`, removed once revealed
- Operable at 320px and both landscape pairs (844×390, 915×412)

### Remaining Dependencies for Phase 3 MobileChrome

1. **D5**: 768–1023px width caps (currently open/defect per contract)
2. **D6**: Apply width caps to `.reader-more-menu` / `.pdf-reading-options` for 768–1023px
3. **320px Footer**: Verify Footer usability at narrow width without horizontal overflow
4. **More entry points**: Confirm all secondary actions accessible via More
5. **O1/O2/O7/O8 migration**: Header secondary actions → More (Contents, Context, Markup, Text/theme, Notes, Language engines, Document tools, Click-to-lookup)

### Contract Compliance Verification

The implementation maintains compliance with the frozen T0e Reader + Home Behavior Contract:

- **Responsive Authority**: `≤1023px` = Mobile, `≥1024px` = Desktop, no tablet variant, `useDesktop()` as sole semantic authority
- **Reader Architecture**: Simple/Advanced remain disclosure modes of one architecture
- **Chrome Model**: Overlay O, Header overlay, static top padding inside scroll container, Footer visible/reserved
- **Quiet/Reveal**: Visual-only behavior (no geometry change, scrollTop change, reflow, or height-token changes)
- **Header Contract**: Owns only Back, document title, Original/Reading for PDF
- **Footer Contract**: Owns progress/location, percentage, PDF zoom, More trigger, OCR status only during active lifecycle
- **More Concept**: Exactly one conceptual disclosure (bottom sheet ≤1023px, popover ≥1024px)
- **U1 Lifecycle**: `open → geometry reconciliation at scrollTop=0 → settle → optional saved-position restoration` preserved
- **A12 Invariant**: Quiet/reveal must not alter content geometry, scrollTop, height tokens, or cause reflow

### Final Status

**Phase 2 MobileChrome is complete and aligned with the frozen T0e contract.** The working tree contains only intentional Phase 2 changes, targeted tests are green, and no obsolete Reader Chrome architecture remains active in the affected foundation. The new foundation spec and implementation agree, and no later-phase behavior has been prematurely implemented.

All verification checks pass, and the implementation satisfies the acceptance criteria for MobileChrome phase completion.