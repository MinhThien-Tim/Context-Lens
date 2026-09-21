# PDF stability handoff ? 2026-09-21

Scope: stabilize existing Original/Reading modes. No Phase 4?5 features or redesign.
Baseline: `727ec9c` on `main`; working tree was clean. Existing reading-selection bundle verified successfully (incremental, with its stated prerequisite).

## Reproduced causes and fixes

- `PdfViewer.tsx`: the visibility observer wrote `location.page`, and an effect watching that value called `scrollIntoView`. Its 1200 px root margin, duplicate page selectors and ?2 expansion also created too many canvases. Both PDF modes now use `usePdfScroll.ts`: passive RAF-coalesced tracking, complete slot geometry, boundary hysteresis and explicit navigation tokens. Only the intended scroll container moves.
- `PdfReadingView.tsx`: had the same page-observation/navigation feedback loop. It now shares the scroll controller. Existing structured pages, highlights and unified Contents are preserved.
- `styles.css` / `PdfPage.tsx`: the installed PDF.js 6.3.289 TextLayer requires font-height, scale-X, rotation, minimum-font-size and scale-round variables. The old CSS omitted these. The compatible rules now align selectable spans with the canvas, including PDF rotation and user units.
- `PdfTextIndex.ts` / `selectionAdapter.ts`: DOM length was incorrectly treated as a canonical offset. Explicit text-node boundaries, normalized matching, nearby-position/left-context disambiguation and canonical end offsets replace that approximation. Ligatures, soft hyphens, line hyphens, whitespace, repeated phrases, reverse ranges and extraction fallbacks have regressions. Highlight ranges map back to DOM boundaries.
- `PdfPage.tsx`: capture depended on one pointer-up event. Scoped selection-change/pointer/touch capture now preserves the native selection; scrolling cancels pending capture. Explain, Highlight, Note and Copy share a portal toolbar and the existing lookup/translation system. Each render owns a separate text-layer DOM generation; old completion cannot publish a new index or annotations.
- `renderBudget.ts` / `pageLease.ts`: three canvas pages maximum, 2,000,000 backing pixels per canvas, 4096 px longest edge, capped DPR. Cancellation and proxy leases prevent cleaning a page used by a newer render. Page dimensions are resolved independently before restore; unchanged bounds do not update state. The scroller uses dynamic viewport height, safe areas and contained overscroll.
- `App.tsx` / `locationPersistence.ts`: location writes were immediate, and closing a PDF used the text reader's window position. PDF writes are deduplicated and debounced 350 ms, flushed at close/hidden/unmount. Reopening now reads the latest IndexedDB record instead of the stale library entry; browser testing reproduced missing restored highlights before this fix.
- `navigation.ts`: Shift+arrow selection no longer triggers page navigation. Notes include a canonical offset and within-page fraction.
- `vite.config.ts` / `main.tsx`: the PWA's auto-update client explicitly reloaded on worker activation. Updates now wait for the existing Reload button and apply the waiting worker through the plugin API. A production update/activation across two deployed versions was not simulated.

## Executed browser matrix

Windows Chrome, Playwright separate temporary profiles: laptop 1366?900; Pixel 7 emulation 393?851, DPR 2.75. Pixel emulation is desktop Chromium, not a physical Android device. Fixtures: original 3-page simple text PDF, 8-page wrapped-line/heading/link/outline PDF, 64-page mixed-height PDF, and the locally supplied 353-page *They Say / I Say*. The book is not included in the repository or bundle.

| Case | Laptop Chromium | Mobile emulation |
|---|---|---|
| Forward/reverse selection and correct Explain text | Native mouse drag passed | Real text-layer Range/actions passed; OS handles unverified |
| Multi-line phrase/context | Passed | Range/actions passed |
| Highlight, close/open, restore | Passed | Passed |
| Copy and Note/save/jump | Passed | Passed |
| Zoom/fit and selectable layer | Passed | Passed |
| Previous/Next, five mode switches | Passed | Passed |
| Ten lookup open/close cycles | Passed | Passed |
| Link annotation target | Passed | Passed |
| 50+ pages forward/reverse | Passed | Passed |
| 353-page book, two 50+ page return cycles | Passed | Passed |
| Contents, exactly one jump in both modes | Passed | Passed |
| Trackpad hardware / touch fling / Android handles | Unverified hardware | Unverified hardware |
| Android address-bar motion, rotation, background/resume and OS tab kill | Not applicable | Unverified on device |

No page errors or unexpected reloads were observed in the executed browser tests. That does not establish Android OS memory safety.

## Before/after measurements

The same 64-page fixture and scripted forward/reverse wheel sequence were used in the development server for this before/after comparison. Samples include initial import/restore; location writes count IndexedDB document puts, not just position-only records. Heap samples follow an explicit GC request and are JS heap, not browser/GPU RSS. Long tasks include import and application startup; these runs are not controlled throughput benchmarks.

| Metric | Baseline laptop | Fixed laptop | Baseline mobile emulation | Fixed mobile emulation |
|---|---:|---:|---:|---:|
| Maximum sampled mounted canvases | 9 | 3 | 11 | 3 |
| Document writes, complete run | 927 | 9 | 873 | 5 |
| Programmatic scroll commands, complete run | 824 | 2 | 808 | 3 |
| Additional programmatic commands during wheel scrolling | 823 | 0 | 806 | 0 |
| Long tasks added during scrolling | 3 | 0 | 4 | 0 |
| Maximum allowed backing pixels per canvas | No area cap | 2,000,000 | No area cap | 2,000,000 |

The initial two/three fixed scroll writes include initial restore and layout adjustment, not passive navigation. The baseline snapped back and ended on pages 3/4; the fix reached page 54 and returned to page 1. Raw measurements are in `PDF_STABILITY_BASELINE.json` and `PDF_STABILITY_AFTER.json`.

## Reproduction

```powershell
npm ci
npm run typecheck
npm test -- --run
npm run build
$env:QA_BOOK = 'C:/path/to/your/They_say_i_say.pdf'
$env:QA_PRODUCTION = '1'
npm run test:browser -- --trace=off
```

Browser tests use an installed Chrome channel and manage their own localhost server; QA_PRODUCTION selects the built preview. Without `QA_BOOK`, only the optional real-book cases are skipped. Synthetic fixtures are generated in memory. Runtime screenshots, traces and optional heap snapshots stay in ignored `tmp/` or `test-results/` folders. Run with `--trace=off` when profiling to reduce instrumentation overhead.

## Automated checks

- `npm ci`: passed; audit reported zero vulnerabilities.
- `npm run typecheck`: passed.
- `npm test -- --run`: 47 files, 182 tests passed, including gateway tests.
- `npm run build`: passed. Initial application JS 331.6 KiB (limit 350 KiB), CSS 33.1 KiB (limit 100 KiB). Four heavy reader chunks remain separate.
- `git diff --check`: passed.
- Production browser matrix: 10/10 passed, using the built release through Vite preview, with the local 353-page book enabled.
- Browser-version detail: Playwright Chrome channel on Windows; installed package versions are pinned in package-lock.json. The run used desktop Chromium even for Pixel 7 emulation.

## Release memory verification

Production was measured separately with CDP `Runtime.getHeapUsage`, `Memory.getDOMCounters` and explicit GC, with trace disabled. Two forward/return cycles reached page 52 of the 353-page book:

| Metric | Laptop | Pixel 7 emulation |
|---|---:|---:|
| Warm-cycle JS heap range | 79.41?80.31 MiB | 79.93?80.80 MiB |
| First/second return sample at same page | 79.98 / 80.08 MiB | 80.40 / 80.47 MiB |
| DOM nodes at first/second return | 722 / 722 | 615 / 615 |
| Usual JS listeners | 93 | 86 |

Resources plateaued over these executed cycles. This is not a measurement of GPU/native RSS or an Android OS kill threshold. Raw release samples: `PDF_STABILITY_PRODUCTION.json`.

The earlier development-server diagnostic grew from ~81 to ~104 MiB with increasing detached canvases. A local heap snapshot exposed retained debug-owner vnode links (`__o`) and canvas contexts; the same source's production build remained bounded. `PDF_STABILITY_HEAP.json` preserves that diagnostic, rather than incorrectly presenting it as a production pass. Use the production-preview workflow for release memory QA. The large heap snapshot and book data remain outside version control.

## Remaining acceptance limits

Native keyboard selection was not separately browser-tested (modifier routing is unit-tested). Physical Android long-press/handle adjustment, actual touch scrolling, address-bar collapse, device rotation and background/OS-kill behavior still require device QA. No physical Android/ADB runtime was available. Do not mark the entire physical-device acceptance gate passed from these desktop-emulation results. Existing structure/Contents tests are retained; this stabilization does not assert new printed-TOC or structure-engine capabilities beyond the current repository.
