# Stage 4–5 quality report — 2026-09-20

## Scope completed

- Theme cascade uses the active color tokens for the root, body, form controls, reader, popovers and sheets. Explicit light, dark and system color schemes are declared.
- A tap still performs a word lookup. A drag or long-press selection remains editable and displays a 48 px `Look up selection` action; opening the lookup sheet is deferred until that action is pressed.
- English definitions and Vietnamese translations remain separate. EN view never substitutes Vietnamese text when an English definition is missing. The local dictionary can answer EN→EN when an English gloss exists.
- Local expression rules have one shared implementation for quick and context results. Rules only resolve senses with sentence evidence; uncertain cases continue to a configured context provider and otherwise return an explicit unresolved result with zero confidence.
- Sentence extraction covers titles, initials, `e.g.`/`i.e.`, quotations, Vietnamese, multi-sentence selections and paragraph boundaries.

## Automated verification

Environment: Windows workspace, Node 24.21.0, npm 11.19.0, jsdom/fake-indexeddb. These figures are process timings, not physical-phone timings.

| Check | Samples | p50 | p95 | Budget | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| Local dictionary lookup | 250 | 0.008 ms | 0.041 ms | <100 ms p95 | PASS |
| Warm memory-cache read | 100 | 0.194 ms | 2.060 ms | <50 ms p95 | PASS |

`npm test`: 30 files, 83 tests passed. Coverage includes select → quick lookup → explicit context → vocabulary/note save, IndexedDB reload while offline, cancellation isolation, quota reservation across concurrent provider instances, storage-limit-tolerant caches, provider fallback and EN↔VI regression cases.

`npm run build`: production build and PWA generation passed. Initial JavaScript assets were 259.4 KiB and 278.7 KiB; initial CSS was 17.5 KiB. Four document-reader chunks remain lazy. The offline EN–VI pack is 17.48 MB uncompressed and 3.38 MB gzip in the build output.

## Browser smoke verification

Chrome against the local Vite build:

- Light mode rendered readable root, textarea, controls and panels.
- Dark mode rendered readable reader text, header, icons and reader-settings popover.
- Dragging text kept the native selection visible and displayed `Look up selection` without opening the sheet.
- Pressing the action opened the lookup sheet and cleared the pending selection.

This is desktop Chrome verification. It is evidence for the web flow, not Android device approval.

## Measurements still requiring external infrastructure

| Measurement | Status | Required evidence |
| --- | --- | --- |
| Android Chrome and installed PWA selection handles | BLOCKED | Physical Android device or device-farm recording with OS/browser/model |
| Android cold start, runtime memory and large-document peak | BLOCKED | Chrome trace and memory samples on each supported device class |
| iOS Safari/Home Screen PWA | BLOCKED | Physical iOS device or device farm |
| Network translation p50/p95/error rate | NOT MEASURED | Deployed gateway, named provider/region and controlled network profile |
| Hosted Lite quota/fallback staging | NOT MEASURED | Deployed quota-enforcing server and staging credentials |

No mobile or network speed target is declared achieved until those rows have measured evidence. Use `DEVICE_QA.md` for the release-gate procedure.
