# Mobile Reader Header + FAB Redesign — Implementation Handoff

**Date:** 2025-10-03  
**Status:** In progress — CSS/TSX implemented, E2E failing, unit tests stale  
**Role:** Implementer → Verifier

---

## Summary

Implemented the single-bar mobile header (56px via `--reader-header-height`), More menu with OCR next, and expandable FAB per the Vietnamese spec.  
**Critical blocker:** `PdfModeSwitch` was removed from the DOM entirely (ReaderToolbar no longer renders `{children}`), causing `pdf-mobile-chrome-space.spec.ts` to timeout waiting for `.pdf-mode-switch` on mobile-chromium (Pixel 7 viewport). Desktop/tablet mode switch and OCR next button are also gone.

---

## Files Modified (git diff --stat)

| File | Δ |
|------|---|
| `src/reader/ReaderToolbar.tsx` | +31/−? (rewritten; **drops `{children}` and `{primaryActions}`**) |
| `src/reader/ReaderFab.tsx` | NEW (untracked) |
| `src/reader/pdf/PdfModeSwitch.tsx` | +3/−3 (removed OCR-next button, toggle icon → `MoreVertical`) |
| `src/styles.mobile-reader.css` | +162/−? (56px header token, 1-bar flex, FAB block) |
| `src/reader-layout.css` | +2 (`--reader-fab-size:48px; --reader-fab-gap:16px;`) |
| `src/app/App.tsx` | +4/−2 (imports `ReaderFab`, passes `primaryActions={null}`, `mode`/`onModeSwitch`, still passes `PdfModeSwitch` as `children` but it's ignored) |
| `e2e/pdf-mode-layout.spec.ts` | +11/−2 (literal `88` → CSS var read; indentation mangled) |
| `package.json` / `package-lock.json` | +1 / +10 (added `lucide-preact`) |

---

## Root Cause of E2E Failure (Analytical)

Playwright `mobile-chromium` project uses Pixel 7 (412×915).  
First action in `pdf-mobile-chrome-space.spec.ts:7` and `pdf-mode-layout.spec.ts:9` is:

```ts
await page.locator('.pdf-mode-switch').click();
```

`PdfModeSwitch` is **not in the DOM** because `ReaderToolbar.tsx` no longer renders `{children}`.  
Playwright waits for visibility → ~120 s timeout (exactly the observed ~2.0 min failure).

---

## Known Breakages (Must Fix Before Verification)

### 1. `ReaderToolbar.tsx` — missing slots
- **Line ~40:** `children` prop received but never rendered → `PdfModeSwitch` vanishes for **all** viewports.
- **Line ~40:** `primaryActions` prop received but never rendered → desktop OCR next button gone.
- **Fix:** Render `{children && <div class="reader-header-position">{children}</div>}` unconditionally; mobile CSS `display:none` (max-width:767px) hides it on phone. Render `primaryActions` in a desktop-only slot (or keep `.reader-primary-tools` and let mobile CSS hide it).

### 2. `ReaderFab.tsx` — three bugs
| Bug | Location | Fix |
|-----|----------|-----|
| `--accent-contrast` does not exist in CSS | `styles.mobile-reader.css:108` (via `var(--accent-contrast)`) | Replace with `var(--bg)` (existing accent convention) |
| Double safe-area in FAB bottom | `styles.mobile-reader.css:94` `calc(var(--reader-footer-height) + var(--reader-fab-gap) + env(safe-area-inset-bottom))` but `--reader-footer-height` already includes `env(safe-area-inset-bottom)` | `calc(var(--reader-footer-height) + var(--reader-fab-gap))` |
| Scroll listeners missing `{capture:true}` | `ReaderFab.tsx:47,51` `document.addEventListener('scroll', …, { passive: true })` | Add `capture: true` (scroll doesn't bubble; inner scrollers are `.pdf-scroll`, `.pdf-reading-scroll`) |

### 3. `ReaderShell.test.tsx` — stale assertions (lines ~74, ~89–96)
- Passes `primaryActions={<button aria-label="OCR next">}>` and `children={<div>Original / Reading</div>}` then asserts `.reader-header-position` text and clicks `.reader-primary-tools [aria-label="Contents"|"Markup"|"OCR next"]` — all removed.
- `PdfModeSwitch` test clicks `[aria-label="OCR next"]` and asserts `null` after `showNext={false}` — button no longer exists at all.

### 4. E2E specs with stale selectors
| Spec | Lines | Old Selector | New Target |
|------|-------|--------------|------------|
| `pdf-mobile-chrome-space.spec.ts` | 7, 65 | `.pdf-mode-switch` | Reading switcher `button[aria-label^="Switch to"]` |
| `pdf-mode-layout.spec.ts` | 9, 23, 33, 36, 41, 45, 84–85, 88 | `.pdf-mode-switch`, `.reader-header-position`, `button:has-text("OCR next")`, `.pdf-reading-options-toggle` | Reading switcher, More menu items, removed on mobile |
| `pdf-mobile-zoom.spec.ts` | 7 | `.pdf-mode-switch` | Reading switcher |

### 5. Missing required new tests
- OCR queue active (`:has(.pdf-queue-status)`): correct height, queue status visible, not covered by header/FAB.
- FAB open/close → 0 px content shift.
- Form fill only in Original mode.
- System Back closes FAB before navigating.

---

## Verification Commands (Run in Order)

```powershell
# 1. CSS lint (already PASS)
npm run check:css

# 2. Unit tests for reader subsystem (catches ReaderShell.test.tsx)
npm run verify:reader

# 3. Unit tests for pdf subsystem
npm run verify:pdf

# 4. Two PDF mobile specs on mobile-chromium (background)
npx playwright test e2e/pdf-mobile-chrome-space.spec.ts --project=mobile-chromium
npx playwright test e2e/pdf-mode-layout.spec.ts --project=mobile-chromium

# 5. Mobile sweep (only pdf-click-mobile.spec.ts may fail — pre-existing)
npx playwright test e2e/pdf-*.spec.ts --project=mobile-chromium --repeat-each=3
```

> **Note:** Playwright `webServer` runs `npm run dev -- --host 127.0.0.1` on `:5173` with `reuseExistingServer: true`. Tests take ~2 min each → run in background.

---

## Accepted Risks (For Report)

1. **Empty header band during `chrome-quiet`** — deliberate price of stable viewport; 56px bar shrinks it vs. 88px.
2. **Unverified on real device:** landscape, real address-bar behaviour, pinch-zoom (`--lookup-vv-scale` only measured at scale 1).

---

## Next Actions (Priority Order)

1. [ ] Patch `ReaderToolbar.tsx` to render `children` in `.reader-header-position` and restore desktop `primaryActions`/`OCR next`.
2. [ ] Fix three `ReaderFab.tsx` bugs (CSS token, double safe-area, capture scroll).
3. [ ] Run `verify:reader` + `verify:pdf` to catch unit-test breakages.
4. [ ] Update four E2E specs' selectors.
5. [ ] Run the two PDF mobile specs on `mobile-chromium`.
6. [ ] Add required new tests.
7. [ ] Full sweep with `--repeat-each=3` on every failure before labelling pre-existing.
8. [ ] Update `docs/reader.md` if subsystem behaviour changed.
9. [ ] Write final report.

---

## Architecture Docs to Reference

- `docs/ARCHITECTURE.md` — subsystem map, invariants, task-routing table
- `docs/reader.md` — reader subsystem (update if behaviour changed)
- `docs/testing.md` — per-subsystem commands, test layout
- `docs/verification-map.md` — change classes, verification policy
- `docs/agent-execution-rules.md` — Terminal Loop Guard, verification proportionality

---

## Quick Commands for Verifier

```powershell
# Check current git status
git -C "c:\Users\Admin\Downloads\Context Lens" status --short

# Run CSS check
npm run check:css --prefix "c:\Users\Admin\Downloads\Context Lens"

# Run reader unit tests
npm run verify:reader --prefix "c:\Users\Admin\Downloads\Context Lens"

# Run pdf unit tests
npm run verify:pdf --prefix "c:\Users\Admin\Downloads\Context Lens"

# Run single mobile spec (background)
npx playwright test e2e/pdf-mobile-chrome-space.spec.ts --project=mobile-chromium --reporter=list
```