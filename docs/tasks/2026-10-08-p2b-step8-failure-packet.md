# P2b Step 8 — failure packet (C1 closing gate)

Planner input, 2026-10-08. Branch `rebuild/reader-v2` @ `14fef02`. Written per task §Stop conditions:
reds outside the C1 label scope remain after the gate, classified, and awaiting a disposition decision.

## 1. Gate commands (Windows rules: `PW_REUSE_SERVER=0`, `--strictPort`, 1 worker, both projects)

```text
npx playwright test --config playwright.tiers.config.ts --grep @pdf   --workers=1   (pdf-normal)
npx playwright test --config playwright.tiers.config.ts --grep @heavy --workers=1   (heavy tier)
npx playwright test e2e/mobile-chrome.spec.ts --config playwright.tiers.config.ts --workers=1
  (both --project=laptop --project=mobile-chromium)
npx vitest run src/reader/pdf/PdfModeSwitch.test.tsx   (EN/VI parity)  -> 7/7 PASS
```

Logs (`docs/tasks/runs/`): `2026-10-08-p2b-step8-c1-gate-{pdf,pdf-rerun,baseline,heavy,heavy-rerun,heavy-baseline,mobile}.log`, `c1-parity.log`.

## 2. Classification — @pdf / @mobile tier, 1 worker, both projects

**Revision 2026-10-08 @ `8d32a1b`.** The first draft of this section attributed 44 of 48 reds to "infra
(load flake)" on the strength of a 1-worker rerun. That attribution is **falsified**: the rerun was green
because the 2-worker run was starving, but the survivors were never re-checked at the pre-C1 baseline. Every
residual below is now classified from an **isolated `git worktree` at `4995c1d`** (`npm ci`, same specs, same
tier config), not by inference. `git merge-base --is-ancestor 4995c1d HEAD` = exit 0, so the baseline is valid.

Final runs: `laptop` `--grep "@pdf|@mobile"` → **8 failed / 3 skipped / 36 passed (6.6m)**;
`mobile-chromium` same grep → **10 failed / 2 skipped / 35 passed (7.5m)** (laptop's 8 plus
`pdf-original-native-dpr:5` and `pdf-stability:90`).

| Identity | Projects | Class | Evidence |
| --- | --- | --- | --- |
| `pdf-reader-chrome-a12:104` GEO-1 | both | pre-existing | red at `4995c1d` (`base2.txt`) |
| `pdf-reader-chrome-a12:154` GEO-4 | both | pre-existing | red at `4995c1d` (`base2.txt`) |
| `pdf-original-natural-scale:7` | both | pre-existing | red at `4995c1d`; now fails **later** than baseline, on the text-layer offset assertion (`abs(textLeft)` got `0.4367`, expects `<1`) — a sub-pixel rounding/transform tolerance, not a mode-key fault |
| `pdf-original-resolution:7` | both | pre-existing | baseline died *earlier*, at `locator.click` on `getByRole('button', { name: 'Original', exact: true })` |
| `pdf-original-native-dpr:5` | mobile | pre-existing | red at `4995c1d` on `mobile-chromium` (`base3.txt`) — dies at `locator.click` on the stale `'Original'` literal |
| `pdf-stability:30` | both | pre-existing | baseline red on the `'Original'` label |
| `pdf-stability:90` | mobile | pre-existing | baseline red |
| `reader-header:7` HDR-1 | both | **real** | `e2e/reader-header.spec.ts` **does not exist at `4995c1d`** — Batch B addition. `locator('.reader-header .reader-title')` never resolves. |
| `reader-header:29` HDR-2 | both | **real** | absent at baseline; `menuitem 'Document'` not found |
| `reader-footer:17` MOB-1 | both | **real** | absent at baseline; `toHaveCSS` got `"visible"` where `"hidden"` expected |

`reader-header.spec.ts` never calls `modeControl` (only `documentItem`), so its reds are structurally
independent of C1. MOB-2 (`reader-footer:40`, 2 bands) passes.

### 2a-bis. Root cause of the baseline reds

At `4995c1d` `src/reader/pdf/PdfModeSwitch.tsx` had the labels **inverted** — `original → 'Text'`,
`reading → 'PDF'`. C1 corrected it to `original → 'PDF'`, `reading → 'Text'` (correct per §C1) and thereby
retired the `'Original'` literal that four specs hard-coded. So those specs were **already red before C1**:
they could not resolve a label the component had not rendered since the earlier Batch B change.

`modeControl(page, mode)` resolves `^(?:${modeLabels[mode]}|${modeLabelsVi[mode]})$` — the key→label map *is*
the lookup — which is why the component fix silently re-pointed every argument rather than breaking them
openly. 16 call sites across 5 specs needed re-keying; that is commit `8d32a1b`. **Real, C1-caused defects:
none** — every C1-attributable failure was a stale *argument*, now corrected.

### 2a. Stale clamp (disposition needed)

`e2e/pdf-original-natural-scale.spec.ts:52` expects page width 736 at 800px viewport.
Formula unchanged (`navigation.ts:39` `min(932, containerWidth − 64)`; unit `navigation.test.ts:47` green).
Rendered = 568 ⇒ `containerWidth` = 632 = 800 − 2×84, where 84 = `space-4 + reader-footer-height`
(`src/reader-layout.css:41` `.pdf-scroll` horizontal padding = the CHR-1 static-chrome clearance).
The 736 claim assumes an unpadded container. Red at baseline (masked by the old label click).
**Not in any C-list. Options: migrate to the designed padded geometry (needs G-/CHR- rule cite) or record as C5
removed-contract deletion. Do not silently change the number.**

## 3. Classification — @heavy tier (12 failed / 6 skipped / 10 passed; identical at 1-worker rerun)

| Identity (HEAD line) | Baseline line | Baseline? | Class |
| --- | --- | --- | --- |
| pdf-ocr-queue:17, :101, :152 (count 3/1/1 vs 0) | :17, :101, :152 | queue:17, :152 red @4995c1d | :17/:152 pre-existing; :101 exposed-new (same missing-preload root cause) |
| pdf-ocr:74 (`.pdf-page-slot` invisible) | :42 | red @4995c1d | pre-existing |
| pdf-ocr:124 (`.pdf-ocr-text` "scanned second page" missing) | :90 | red @4995c1d | pre-existing |
| pdf-ocr:213 (`.pdf-ocr-text` "careful reader" missing) | :182 | red @4995c1d | pre-existing |
| (same × mobile-chromium) | | :42/:90/:182/:17/:152 red | pre-existing |

Root pattern: OCR output (`.pdf-ocr-text`, OCR progressbar, queue preload counts) never materialises in this
environment; identical failure shapes at baseline. OCR is phase-deferred to **P4** (task §deferred list).
Baseline run also red on `pdf-ocr:144` (VI bilingual) which is **green at HEAD** — no HEAD regression.

**Decision needed:** do `@heavy` OCR reds count against the C1 closing gate, or is heavy/OCR deferred to P4
with this packet as the record? If they count: gate is BLOCKED on OCR environment (WASM/model), not on C1.

## 4. Classification — @mobile tier

Covered by the §2 table (the `--grep "@pdf|@mobile"` runs hit both tags). `mobile-chrome:412` is the
user-excused mode-switch test; `:437`/`:555` have no tests (deleted in C1 step 4, comment lines only).
`mobile-chromium` adds exactly two reds over `laptop`: `pdf-original-native-dpr:5` and `pdf-stability:90`,
both proven pre-existing at `4995c1d`.

## 5. Parity gate condition

`src/reader/pdf/PdfModeSwitch.test.tsx` + `PdfModeSwitch.ocr.test.tsx` EN/VI table tests exist and pass
**12/12**. ✓

## 6. Tree state

`e2e/` and `src/` clean @ `8d32a1b` (the C1 fixup commit contains exactly the 16 re-keyed arguments, no
assertion edits). No push/pull/rebase/merge — branch is 3 behind / 23 ahead of `origin/rebuild/reader-v2`.

## 7. Open dispositions (need an owner decision)

1. **HDR-1 / HDR-2** — `reader-header.spec.ts` is a Batch B test that has never passed: `.reader-title` does
   not render and `Document` is not a menuitem at the asserted location. Real Header gaps, outside C1 scope.
2. **MOB-1** — `reader-footer.spec.ts:17` expects a `toHaveCSS` value of `hidden` where the element computes
   `visible`. Real Footer gap.
3. **`pdf-original-natural-scale:7`** — now fails on `abs(textLeft) = 0.4367` vs `< 1`. Sub-pixel; needs a
   tolerance decision, not a behaviour change.
4. **`:52` clamp** — see §2a.
5. **@heavy OCR** — see §3.

None of these block C1: no C1-caused real defect exists. They are queued for C2–C6 / P4.
