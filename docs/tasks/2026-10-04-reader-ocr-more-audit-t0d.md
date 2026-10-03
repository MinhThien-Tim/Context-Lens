# T0d — OCR / More / document-tools audit on HEAD

- **Date:** 2026-10-04
- **Role:** Investigator (read-only audit)
- **Baseline:** `0230896` (`pre-redesign-baseline`), branch `main`, HEAD `6d189f0`
- **T0c commit present:** `fca09b8` ✔
- **T0b decision record present:** [2026-10-03-reader-experience-redesign-decision-record.md](./2026-10-03-reader-experience-redesign-decision-record.md) ✔
- **Working tree:** clean at audit start and at audit end. `git diff HEAD -- src/` empty.
- **Scope respected:** zero files created or modified under `src/`, `e2e/`, or any other production/test path. This document is the only file written.

Labels: **FACT** (read directly from source), **MEASUREMENT** (produced by running something),
**INTERPRETATION** (inference), **RECOMMENDATION** (proposal needing approval).

---

## 1. Preconditions (acceptance item 1)

| Check | Result |
| --- | --- |
| Branch | `main` ✔ |
| HEAD | `6d189f0` — *docs: record post-verdict state for T0c blocker (a)* ✔ |
| Ahead of `origin/main` | 3 commits (`fca09b8`, `d7fcbbe`, `6d189f0`) ✔ |
| Working tree | clean ✔ |
| `pre-redesign-baseline` | annotated tag resolving to `0230896` ✔ (INTERPRETATION: `git rev-parse --short` on an annotated tag prints the *tag object* id `f6c81ba`, not the commit; `git log -1 f6c81ba` resolves to `0230896`, and `0230896` is an ancestor of the tag object. Not a discrepancy.) |
| T0c evidence record | present ✔ |
| Repository materially differs from T0c handoff? | **No** — investigation proceeded |

---

## 2. Two findings that change the picture

### 2.1 FINDING A — `.pdf-queue-status` is dead CSS; the DOM node it styles was deleted in `0a6c1ea`

**FACT.** `git grep -n "pdf-queue" -- "src/**/*.tsx" "src/**/*.ts"` returns **zero matches**. The class
appears only in stylesheets and e2e specs:

| File | Occurrences |
| --- | --- |
| [src/styles.reader-base.css](../src/styles.reader-base.css) | 9 (`:192-196`, `:201`, `:216`, `:245`, `:250`) |
| [src/styles.mobile-reader.css](../src/styles.mobile-reader.css) | 3 (`:48-50`) |
| [src/styles.desktop-reader.css](../src/styles.desktop-reader.css) | 2 (`:42-43`) |
| [e2e/pdf-ocr-queue.spec.ts](../e2e/pdf-ocr-queue.spec.ts) | 8 (`:19,21,23,30,54,58,73,82`) |
| [e2e/pdf-ocr.spec.ts](../e2e/pdf-ocr.spec.ts) | 5 (`:35,63,121,160,231`) |
| [e2e/pdf-real-samples.spec.ts](../e2e/pdf-real-samples.spec.ts) | 3 (`:47,75,78`) |
| [e2e/pdf-ocr-raster.spec.ts](../e2e/pdf-ocr-raster.spec.ts) | 1 (`:17`) |

**FACT.** `git show 0a6c1ea -- src/app/App.tsx` shows the exact deletion:

```
-      {documentRecord.kind === 'pdf' && ocrQueue.status && <div class="pdf-queue-status" role="status">
-        <span>{ocrQueue.status.state === 'error' ? 'OCR lỗi' : ...}</span>
-        {ocrQueue.status.state === 'running' && <button onClick={ocrQueue.pause}>Tạm dừng</button>}
-        ...
```

That commit ("ocr ui", 2026-09-25) replaced the always-present status **bar** with a
`<p role="status">` **inside the Document tools dialog** and removed the `'OCR 3 trang tiếp'` /
`'OCR 6 trang tiếp'` menu items. The CSS was never removed.

**Consequences (all FACT-derived):**

1. **17 e2e assertions target a selector that cannot match.** Six are `toContainText(...)`, which on a
   zero-match locator **fails**; eleven are `toHaveCount(0)`, which **passes vacuously**. None of the
   eleven proves anything. So the entire current E2E "OCR status is gone / pause works / quota error
   surfaces" coverage is **absent in practice**, not merely stale.
2. **The layout rules attached to that selector are unreachable.** In particular
   [styles.reader-base.css:248-251](../src/styles.reader-base.css):
   ```css
   @media (min-width:768px) and (max-width:850px) {
     .pdf-viewer-wrap,.pdf-reading-view { height:calc(100dvh - 110px); }
     .reader-viewport:has(.pdf-queue-status) { height:calc(100dvh - 110px); }
   }
   ```
   The `:has()` half can never apply. The `--110px` half *can* apply at 768–850 but is overridden by
   later `styles.mobile-reader.css` / `reader-layout.css` rules that use CSS custom properties.
   **This is also the only `768px` semantic breakpoint left in the Reader CSS** and therefore a named
   deletion target for the MobileChrome phase.
3. **T0c blocker (b) "OCR-queue geometry" is answered — but not in the direction expected.**
   T0c recorded it as BLOCKED because the fixture could not express a 12-page window. It is in fact
   **NOT APPLICABLE ON HEAD**: there is no status bar to induce a viewport-height change, because the
   bar's DOM was removed two weeks before the baseline. The WIP numbers (+90 px at 768, +34 px at
   1024) **must not** be carried forward — they were measured on a build where the bar existed.

**INTERPRETATION.** Any contract clause of the form "the OCR status strip must not change viewport
height" is, on current HEAD, **already satisfied by construction** — there is no strip. The clause
becomes meaningful only if a future phase re-introduces an always-present OCR strip, which the
approved decision ("OCR status only while OCR is running") does not want.

**RECOMMENDATION.** In T0e, write the OCR-status clause against the **actual** status hosts
(§2.3), and delete the `min-width:768px` block rather than re-targeting it. Do not carry any OCR-queue
geometry number into the contract.

### 2.2 FINDING B — the auto-preload recognizes at most **6** pages while everything around it promises **12**

**FACT.** [usePdfOcrQueue.ts:71-79](../src/reader/pdf/usePdfOcrQueue.ts):

```ts
if (mode === 'preload') {
  for (let pageNumber = 1; pageNumber <= Math.min(12, pageCount); pageNumber++) {
    ...
    pending.push(pageNumber);
    if (pending.length >= 6) break;      // ← :78
  }
}
```

`OCR_AUTO_BATCH_SIZE = 12` (`:11`) is the sole source of truth for the *explicit* run. The preload
branch hard-codes `6` and never references the constant.

**FACT.** The function is named `preloadFirstTwelve` and its gate at [App.tsx:138-141](../src/app/App.tsx)
uses `pdfPages.slice(0, 12)`:

```ts
const firstPages = documentRecord.pdfPages.slice(0, 12);
if (firstPages.some(page => !page.plainText.trim() && ocrCandidate(...))) void ocrQueue.preloadFirstTwelve();
```

**MEASUREMENT.** [usePdfOcrQueue.test.tsx:52-57](../src/reader/pdf/usePdfOcrQueue.test.tsx) currently
*pins the 6-page behaviour and passes*:

```ts
it('preload examines only the first twelve pages and recognizes at most six', async () => {
  ...
  expect(mocks.recognize.mock.calls.map(call => call[1])).toEqual([1, 2, 3, 4, 5, 6]);
```

**MEASUREMENT.** `npx vitest run src/reader/pdf/usePdfOcrQueue.test.tsx` → **14/14 PASS**, so the
defect is green in CI and invisible.

**INTERPRETATION.** A user opening a scan-only PDF gets pages 1–6 OCR'd automatically on open, not
1–12. A PDF whose first 12 pages are scans with page 7+ also needing OCR will silently leave pages
7–12 unrecognised. This is a real product defect and a direct violation of the 12-page contract.

**RECOMMENDATION (NOT APPLIED — T0d forbids changing OCR queue semantics).** One-line fix at `:78`:
`if (pending.length >= OCR_AUTO_BATCH_SIZE) break;`, plus updating the test name and expectation at
`usePdfOcrQueue.test.tsx:52`. Belongs to the **PDF/OCR controls** phase, gated on T0e approval.

### 2.3 Where OCR status actually lives on HEAD

**FACT.** Exactly two live hosts, both transient:

| Host | File | Gate |
| --- | --- | --- |
| Footer `.reader-ocr-status` — `role="progressbar"`, `aria-label="OCR progress"`, text `OCR {completed}/{total}` | [ReaderProgress.tsx:9](../src/reader/ReaderProgress.tsx) | `ocr` prop non-null |
| `<p role="status">` inside Document tools | [PdfModeSwitch.tsx:49-58](../src/reader/pdf/PdfModeSwitch.tsx) | `queueStatus` non-null |

**FACT.** The Footer prop is computed at [App.tsx:589](../src/app/App.tsx):

```ts
const activeOcrProgress = ocrQueue.status && ['preparing','running','paused'].includes(ocrQueue.status.state) ? ocrQueue.status : null;
```

**FACT.** On success the queue clears status entirely: `if (run === generation.current) setStatus(null);`
([usePdfOcrQueue.ts:116](../src/reader/pdf/usePdfOcrQueue.ts)). `cancel()` also calls `setStatus(null)`.

**INTERPRETATION.** The approved decision "OCR status only while OCR is running" is **already
satisfied** by the Footer host: it appears for `preparing|running|paused` and disappears on `done`,
`error`, and cancel. Two refinements remain for T0e, not for code:
- `paused` is an **active** state, not a terminal one — the contract should say "while an OCR run is
  active (including paused)", not "while running".
- The Document-tools `<p role="status">` currently shows *any* state including `error` and `done`,
  so "status only while active" does **not** hold for the second host.

---

## 3. OCR lifecycle on HEAD (acceptance items 2, 3)

### 3.1 Confirmed 12-page window + automatic continuation — YES

**FACT.** [usePdfOcrQueue.ts:85-88](../src/reader/pdf/usePdfOcrQueue.ts), mode `next`/`current`:

```ts
for (let windowStart = mode === 'current' ? firstPage + 1 : 1; windowStart <= pageCount; windowStart += OCR_AUTO_BATCH_SIZE) {
  const windowEnd = Math.min(pageCount, windowStart + OCR_AUTO_BATCH_SIZE - 1);
  setStatus({ state: 'preparing', ..., message: `Trang ${windowStart}/${pageCount}` });
  pending = pending.concat(await findNextOcrCandidates(..., OCR_AUTO_BATCH_SIZE, hasInkOnPage, windowStart, windowEnd));
}
```

The comment on `:84` states the intent explicitly: *"An explicit run walks the whole document once in
consecutive 12-page windows, so no window needs another click."*

**MEASUREMENT.** `usePdfOcrQueue.test.tsx:136` asserts a 30-page document has all 30 pages recognized
in one `startNextUnprocessed()` call. That test is green.

**INTERPRETATION.** Automatic continuation through successive 12-page windows until exhaustion is
**real and verified at unit level**. One click = whole document.

### 3.2 Start, guard, quota preflight

**FACT.** `start(firstPage, mode)` at `:41`. Guards `if (!doc?.data || doc.kind !== 'pdf' || controller.current) return;`
→ **one concurrent run per document**; a second click is a silent no-op, which is why the UI buttons
are `disabled` while `busy`.

**FACT.** Quota preflight before any OCR: if `storage.quota - storage.usage < 1_000_000` it throws a
Vietnamese storage message and aborts before processing. This is exercised by
`e2e/pdf-ocr-queue.spec.ts:52-54` — whose assertion at `:54` is one of the **broken** ones from §2.1.

### 3.3 Status/queue state model

**FACT.** Five states: `preparing | running | paused | done | error`
([usePdfOcrQueue.ts:9](../src/reader/pdf/usePdfOcrQueue.ts)). Transitions:

| From | Trigger | To |
| --- | --- | --- |
| — | `start()` | `preparing` (`completed:0, total:0, progress:0`) |
| `preparing` | window candidates found | `running` (`total = pending.length`, message `` `${pending.length} trang cần OCR` ``) |
| `preparing` | no candidates anywhere | `done` (`progress:100`, message `'Không còn trang cần OCR.'`) |
| `running` | per page complete | `running` with `completed++` |
| `running` | `pause()` | `paused` (resolved on next boundary via `resume.current`) |
| `paused` | `continueQueue()` | back into the page loop |
| any | `cancel()` / abort / stale generation | **`null`** (`setStatus(null)`) |
| any | success | **`null`** (`:116`) |
| any | thrown error | `error` + mapped message (`:117`) |

**FACT.** Blank / ink-free pages `continue` the loop without incrementing `completed` and without
failing the run — `total` counts only real OCR candidates.

**FACT.** `done` is set **only** for the "nothing left" case. A run that recognised pages ends in
`null`, not `done`.

### 3.4 String-coupled predicates (fragility)

**FACT.** Two places derive state by comparing a **localized user-facing string**:

- [App.tsx:594](../src/app/App.tsx) — Header OCR-next `disabled` when
  `ocrQueue.status?.state === 'done' && ocrQueue.status.message === 'Không còn trang cần OCR.'`
- [PdfModeSwitch.tsx:32](../src/reader/pdf/PdfModeSwitch.tsx) — `const done = queueStatus?.state === 'done' && queueStatus.message === 'Không còn trang cần OCR.';`

**INTERPRETATION.** Any copy change silently turns "disabled because nothing left" into "enabled
forever". This is the mechanism behind several stale-string test failures. A boolean field on
`OcrQueueStatus` would be the structural fix, but that touches the queue's public type and is out of
T0d scope.

### 3.5 Is "OCR Next" still necessary?

**FACT.** Two entry points exist for the same call:

| Entry point | File | Renders |
| --- | --- | --- |
| Header `primaryActions` button, `aria-label="OCR next"`, visible text `OCR next` | [App.tsx:594](../src/app/App.tsx) | always (PDF only) |
| Document tools button, `'Tìm và OCR tối đa 12 trang scan tiếp theo, tiếp tục đến hết tài liệu'` | [PdfModeSwitch.tsx:48](../src/reader/pdf/PdfModeSwitch.tsx) | gated by `showNext` |

**FACT.** `App.tsx:595` passes `showNext={false}`, so **the Document-tools copy never renders in the
real app**. The only live OCR-next control is the Header button, whose `title` is
*"Find and OCR the remaining scanned pages, starting at this one, 12 at a time"*.

**FACT.** `PdfModeSwitch.ocr.test.tsx` asserts the disabled-while-busy behaviour and currently
**PASSES** (measured, 1/1).

**INTERPRETATION.** Under full automatic continuation, "OCR next" is **not a per-window advance**. Its
only distinct jobs are: (a) start a run after auto-preload finished, (b) restart from the current
page after a cancel, (c) recover after an error. Under the approved *no L1 / all secondary actions in
More* decision it is a **duplicate secondary entry point** and must move into More or be retired.
Which of those two is correct is a **product decision for T0e** — recorded in §9.

---

## 4. Stale 3/6-page assumptions (acceptance item 4)

**FACT.** Full inventory (user confirmed on 2026-10-04: *"OCR 6 trang tiếp đã bị xóa"*):

| # | Location | Stale text | Actual on HEAD | Class |
| --- | --- | --- | --- | --- |
| 1 | [e2e/pdf-ocr-queue.spec.ts:29](../e2e/pdf-ocr-queue.spec.ts) | `'OCR 6 trang tiếp'` | removed in `0a6c1ea` | **REWRITE** |
| 2 | [e2e/pdf-ocr-queue.spec.ts:81](../e2e/pdf-ocr-queue.spec.ts) | `'OCR 3 trang tiếp'` | removed in `0a6c1ea` | **REWRITE** |
| 3 | [e2e/pdf-real-samples.spec.ts:77](../e2e/pdf-real-samples.spec.ts) | `'OCR 3 trang tiếp'` | removed in `0a6c1ea` | **REWRITE** |
| 4 | [e2e/pdf-ocr-queue.spec.ts:30](../e2e/pdf-ocr-queue.spec.ts) | `'Không có trang scan cần OCR'` | `'Không còn trang cần OCR.'` | **REWRITE** |
| 5 | [e2e/pdf-real-samples.spec.ts:78](../e2e/pdf-real-samples.spec.ts) | `'Không có trang scan cần OCR'` | `'Không còn trang cần OCR.'` | **REWRITE** |
| 6 | [src/reader/ReaderShell.test.tsx:96](../src/reader/ReaderShell.test.tsx) | `.includes('next 6')` | 12-page label | **REWRITE** — currently **FAILING** |
| 7 | [e2e/pdf-mode-layout.spec.ts:51](../e2e/pdf-mode-layout.spec.ts) | `/OCR.*6/` | 12-page label | **REWRITE** — already `test.fixme` by T0c |
| 8 | [usePdfOcrQueue.test.tsx:52-57](../src/reader/pdf/usePdfOcrQueue.test.tsx) | *"recognizes at most six"* | defect itself (Finding B) | **REWRITE** after the queue fix |
| 9 | 17 × `.pdf-queue-status` (4 specs) | selector | dead (Finding A) | **REWRITE** → `getByRole('status')` / `.reader-ocr-status`, or **DELETE** where the assertion was vacuous |

**FACT — vacuous vs failing split.** Of the 17 `.pdf-queue-status` assertions:
- **6 would FAIL** (`toContainText`): `pdf-ocr-queue.spec.ts:19,21,30,54,58,78-in-real-samples`.
- **11 PASS vacuously** (`toHaveCount(0)`): `pdf-ocr-queue.spec.ts:23,73,82`, `pdf-ocr.spec.ts`
  `:35,63,121,160,231`, `pdf-ocr-raster.spec.ts:17`, `pdf-real-samples.spec.ts:47,75`.

**FACT — already-quarantined by T0c** (`test.fixme`, all four listed in `git grep -n "test.fixme"`):
`pdf-click-mobile.spec.ts:11`, `pdf-mobile-chrome-space.spec.ts:10,72`, `pdf-mode-layout.spec.ts:9`.

**FACT.** No obsolete 3/6-page assumption exists anywhere else — the sweep covered `e2e/` and `src/`.

---

## 5. Fixture / test-infrastructure defect analysis (acceptance item 5)

**FACT.** [e2e/pdfQueueFixture.ts:2](../e2e/pdfQueueFixture.ts):

```ts
export function pdfQueueFixture(jpeg, imageWidth, imageHeight, blankJpeg?,
  pageKinds: Array<'text'|'scan'|'white'|'blank'> = ['text','scan',blankJpeg?'white':'blank','scan','scan']): Buffer
```

The 5th parameter is an **`Array`**, not a `Set`. It is fully substitutable, so a caller *can* express a
13-page document (`pdf-ocr-queue.spec.ts:71` does exactly this).

**INTERPRETATION of the T0c note.** T0c recorded "the 5th parameter is an Array, not a Set" as the
reason the 12-page geometry probe was blocked. Read literally that note is **defective**: the
parameter shape was never the obstacle — `Array` accepts a 13-element literal. The real obstacles are
(a) it defaults to 5 pages, so a naive call cannot exercise a 12-page window, and (b) a 12-page
all-scan fixture means 12 real OCR runs of a 1224×1584 JPEG, which is a HEAVY-tier cost the T0c probe
would have refused.

**FACT.** [e2e/pdfFixture.ts:2](../e2e/pdfFixture.ts) `pdfFixture(count = 64, blankPage = 0, rotatePage = 0)`
is the **text** fixture — it can produce ≥12 pages cheaply, and is the right vehicle for the
"12-page window" test; `pdfQueueFixture` is the mixed text/scan/blank vehicle.

**RECOMMENDATION — minimum safe migration (do not apply in T0d):**

1. Add an exported `pageKinds` builder or simply document the array form; **no signature change** is
   needed. Keep the change additive.
2. New OCR-queue tests should drive `pdfQueueFixture` with an explicit `Array.from({length:N}, …)` and
   classify them **HEAVY** (timeout 240 s), never FAST.
3. For *window arithmetic* (which pages form a window, does a run continue past page 12), prefer a
   **unit** test over `usePdfOcrQueue` — it is already fast and already green, and it is where the
   30-page continuation proof lives. Do not spend HEAVY-tier wall-clock re-proving arithmetic that a
   unit test proves exactly.
4. All `.pdf-queue-status` assertions migrate to `getByRole('status')` scoped to the Document-tools
   dialog, and to `getByRole('progressbar', { name: 'OCR progress' })` for the Footer. Never to a class.

---

## 6. Complete Reader action inventory → ownership (acceptance item 6)

**FACT.** Every reachable Reader control on HEAD:

| Action | Current host | Label | Approved decision | Classification |
| --- | --- | --- | --- | --- |
| Back to library | Header | `aria-label="Back to library"` | Back: overlay → document | **Header** (KEEP) |
| Contents | Header button **and** More item `Document / Contents` | `aria-label="Contents"` | no L1 | **More** (duplicate to remove from Header) |
| Context panel | Header button (desktop + `interfaceMode==='advanced'` only) **and** More item `Context panel` | `aria-label="Context panel"` | no L1 | **More** (duplicate) |
| Markup | Header button (conditional) **and** More item `Markup` / `Markup (active)` | `aria-label="Markup"` | no L1 | **More** (duplicate) |
| Reading appearance (Aa) | Header | `aria-label="Reading appearance"` | no L1 | **More** → merges with `Text and theme` |
| Text and theme | More menuitem | — | no L1 | **More** (KEEP; absorbs Aa) |
| Notes | More menuitem | — | no L1 | **More** (KEEP) |
| Language engines | More menuitem | — | no L1 | **More** (KEEP) |
| Reader menu (More) trigger | Header | `aria-label="Reader menu"` | one More | **Header** (KEEP — the single trigger) |
| **Original / Reading** mode control | Header `children` row, inside `PdfModeSwitch` | `role="group" aria-label="PDF view mode"`; buttons `Trang gốc` / `Đọc chữ` | **one** control, in Header, PDF only | **Header** (KEEP) |
| **Document tools** toggle | Header `children` row, inside `PdfModeSwitch` | `aria-label="Công cụ tài liệu"` / `Document tools` | no L1 | **More** (move) |
| OCR next | Header `primaryActions` | `aria-label="OCR next"` | no L1 | **unresolved** — see §9 U2 |
| Zoom menu (`PDF options`) | **third popup layer**, portaled into `.pdf-mobile-zoom-host` in the Footer | `aria-label="PDF options"`, visible text `Zoom` | Footer keeps **zoom** | **Footer** (KEEP, but re-parent) |
| Click word lookup toggle | Footer `trailingAction` | `aria-label="Click word lookup"`, visible text `Click` | **moves into More** | **More** |
| Footer: reading progress | Footer | `role="progressbar" aria-label="Reading progress"` | KEEP | **Footer** |
| Footer: location (page `N / M`) | Footer `children` | — | KEEP | **Footer** |
| Footer: percentage | Footer | `.reading-percentage` | KEEP | **Footer** |
| Footer: OCR status | Footer `.reader-ocr-status` | `role="progressbar" aria-label="OCR progress"` | only while active | **Footer** (KEEP — already correct) |
| Chrome restore (`Aa ···`) | Floating `.reader-reveal` button, only while quiet | `aria-label="Show reading controls"` | **"Tap never toggles chrome"** | **obsolete** — see §9 U4 |
| FAB | — | — | no FAB | **absent** ✔ (lived only on `wip/fab-snapshot`) |
| Reader Search | — | — | removed | **absent** ✔ |
| Form fill | — | — | dropped | **absent** ✔ |

**FACT — duplicate entry points that survive incorrectly today:**
1. **Contents** — Header button *and* More item.
2. **Markup** — Header button *and* More item.
3. **Context panel** — Header button *and* More item (desktop-only today).
4. **Reading appearance (Aa)** and **Text and theme** — two names for one settings surface.
5. **OCR next** — Header `primaryActions` and a Document-tools copy that is suppressed by
   `showNext={false}` but still exists in code and is covered by a unit test.
6. **A third popup layer** — [PdfViewer.tsx:139-140](../src/reader/pdf/PdfViewer.tsx) renders
   `.pdf-more` (a Zoom popup) and portals it into the Footer's `.pdf-mobile-zoom-host` on mobile. This
   is a **separate popup system from the More menu**, is listed in `ReaderShell`'s `OVERLAY_OPEN`
   selector (`:11`) as a chrome blocker, and has no approved home in the new contract.
   **INTERPRETATION:** under "no L1", the Reader ends up with *two* popup surfaces — More (sheet ≤1023,
   popover ≥1024) and the Zoom popup. Whether Zoom collapses into More or stays a Footer-attached
   control is **unresolved** (§9 U3).

**FACT — Document tools is not a "Reader duplicate" yet, but it is a second dialog.** It is a
`role="dialog" aria-modal` sheet (≤1023) / popover (≥1024) containing 8 controls plus a status
paragraph: `Chữ PDF`, `Chữ OCR · chưa có`, `OCR language` select, `Nhận dạng chữ trang này`,
`Tìm và OCR tối đa 12 trang…`, `Tạm dừng OCR`, `Tiếp tục OCR`, `Hủy OCR`, `role="status"`,
`Xóa kết quả OCR của tài liệu`. Under the approved model these **all** belong inside More.

**FACT — diagnostic/technical text to review, not preserve:** the trailing paragraph
*"OCR chạy trên thiết bị. Lần đầu tải khoảng 5–10 MB. Chữ nhận dạng có thể sai."* and the
`clear()` `confirm()` (*"Xóa kết quả OCR của tài liệu khỏi thiết bị?"*). These are the only
"technical/diagnostic controls" found in Reader.

---

## 7. More behavior requirements — 320 px and 768–1023 (acceptance item 7)

**FACT — the CSS already matches the approved decision.**

| Concern | ≤1023 | ≥1024 |
| --- | --- | --- |
| More surface | [reader-layout.css:102](../src/reader-layout.css) — `position:fixed; bottom:max(8px,env(safe-area-inset-bottom)); left:8px; right:8px; width:auto; max-height:70dvh; overflow:auto` — **bottom sheet** | [reader-layout.css:33](../src/reader-layout.css) — `width:230px` absolute popover; [styles.reader-base.css:13](../src/styles.reader-base.css) — `min-width:190px` |
| Document tools | [reader-layout.css:106](../src/reader-layout.css) — fixed bottom sheet, `max-height:75dvh`, `z-index:40` | popover via `.pdf-reading-options` defaults |
| Menu-item hit target | `min-height:44px` ([styles.reader-base.css:216](../src/styles.reader-base.css)) | `min-height:36px` ([styles.desktop-reader.css:36](../src/styles.desktop-reader.css)) — deliberate desktop density |
| Header height | `--reader-header-height:56px`, `108px` for PDF surfaces ([reader-layout.css:93-94](../src/reader-layout.css)) | `56px` ([styles.desktop-reader.css](../src/styles.desktop-reader.css)) |

**FACT — 320 px.** No `max-width:360px` / `max-width:390px` rule touches Reader **chrome** controls.
The only `max-width:360px` block is inside the Lookup `.inspector-lookup-tools` AI-label swap
([styles.mobile-reader.css:191](../src/styles.mobile-reader.css)). So at 320 px the More bottom sheet
inherits the generic `left:8px; right:8px` full-bleed rule and the Footer keeps its
`max(8px, env(safe-area-inset-left/right))` padding.

**INTERPRETATION.** Moving **Click word lookup** out of the Footer into More *improves* 320 px: the
Footer currently carries `OCR status + percentage + Zoom + Click`, four items in one row, and Click is
the only removable one. After the move the Footer is `progress · location · OCR status · More · Zoom`.

**FACT — 768–1023.** `useDesktop.ts` returns true **only** at `(min-width: 1024px)`. At 768–1023 the
Reader therefore already renders the phone presentation: header collapses to
`grid-template-columns:44px minmax(0,1fr) 88px` with `grid-template-rows:56px 52px`, the back label is
hidden (`:102` region), the mode control moves to a second full-width row (`.reader-header-position`
`grid-row:2; grid-column:1/-1`), and both More and Document tools are bottom sheets.

**FACT.** The **only** `768px` semantic breakpoint remaining in Reader CSS is the dead block at
[styles.reader-base.css:248](../src/styles.reader-base.css) (Finding A) plus two Lookup-inspector
blocks at [styles.desktop-reader.css:169](../src/styles.desktop-reader.css) and
[styles.mobile-reader.css:143](../src/styles.mobile-reader.css) (`min-width:340px`, a *floor*, not a
breakpoint). Both are Lookup-scoped, not chrome.

**INTERPRETATION.** "768–1023 inherits phone presentation plus width caps on content column and sheets
(~560–640 px centred)" is **not yet implemented** — today the sheet is full-bleed `left:8px; right:8px`
at every width ≤1023, with no cap. Content-column caps exist for `.reader-text` and `.pdf-reading-page`
(`width:min(calc(100% - gutter), var(--reading-width), var(--reading-chars))`) but **not** for
`.reader-more-menu` or `.pdf-reading-options`. This is implementation work for the MobileChrome phase,
not an open question.

---

## 8. Test migration map (acceptance item 9)

### 8.1 Classification of directly affected tests

| Test | Class | Reason |
| --- | --- | --- |
| `usePdfOcrQueue.test.tsx` (14) | **KEEP**, with 1 REWRITE (`:52`) | Core lifecycle is the real contract; `:52` pins Finding B |
| `PdfModeSwitch.ocr.test.tsx` | **KEEP** | Green, asserts busy-disable semantics |
| `ReaderShell.test.tsx` (14) | **KEEP**, 1 REWRITE (`:96`) | Programmatic-scroll and Escape-priority tests remain valid; `:96` is stale |
| `pdf-reader-chrome-a12.spec.ts` | **KEEP** | The T0c selector-independent A12 owner |
| `pdf-mobile-chrome-space.spec.ts` (2) | **REWRITE** | Already `test.fixme` — reserved-strip model |
| `pdf-mode-layout.spec.ts` | **REWRITE** | Already `test.fixme` — reserved-strip + `/OCR.*6/` |
| `pdf-click-mobile.spec.ts` | **REWRITE** | Already `test.fixme` — fakes quiet via synthetic events; its Click-toggle + Lookup-while-quiet assertions stay valid |
| `pdf-ocr-queue.spec.ts` | **REWRITE** | 3 stale labels + 8 dead-selector assertions |
| `pdf-real-samples.spec.ts` | **REWRITE** | 2 stale labels + 3 dead-selector assertions |
| `pdf-ocr.spec.ts` | **REWRITE** | 5 vacuous `toHaveCount(0)` |
| `pdf-ocr-raster.spec.ts` | **REWRITE** | 1 vacuous `toHaveCount(0)` |
| `pdf-original-first-render-footer.spec.ts:49` | **REWRITE** | Asserts Click toggle in Footer; moves to More |
| `pdf-click-mobile.spec.ts` `.pdf-click-toggle` rect read | **REWRITE** | Same move |
| `ReaderShell` tap-to-reveal expectations | **DELETE-OBSOLETE** | "Tap never toggles chrome" |

### 8.2 Minimum new semantic coverage required next

1. **12-page window boundary** — a 25-page all-scan fixture; after one `OCR next`, pages 1…25 are all
   recognized **without a second click**. HEAVY (240 s). This is the headline contract and it has
   **no E2E coverage today**.
2. **Auto-preload window** — open a 13-page scan fixture; assert the first **12** pages are recognized
   on open. This test **fails on HEAD** (Finding B) and is the regression guard for the fix.
3. **OCR status lifecycle** — `getByRole('progressbar', { name: 'OCR progress' })` in the Footer is
   visible while active and **gone** after completion; the Document-tools `role="status"` shows the
   outcome. No class selectors.
4. **Active-OCR Footer composition** — while active, the Footer contains progress, location, OCR
   status, More and Zoom, and **not** the Click toggle (which is in More).
5. **More ownership** — open More on a PDF at 390×844: Contents, Notes, Text and theme, Language
   engines, Markup, Context, Document tools and Click word lookup are reachable from More and **not**
   duplicated in the Header. ≥1024: the same items open as a popover.
6. **Click toggle placement** — not present in the Footer at 390; present and operable from More;
   `aria-pressed` toggles Lookup behaviour.
7. **320 px regression** — Footer does not overflow; More sheet reaches every item.
8. **768–1023** — phone presentation, bottom-sheet More, mode control on the second header row.

**All new tests must use roles/labels and real input. No class-name assertions, no `test.fixme` as a
migration strategy, no fake scroll.**

---

## 9. Unresolved decisions — must NOT be decided by T0d

| # | Question | Status |
| --- | --- | --- |
| **U1** | **T0c A12 #10** — first-line coverage in the load state (shell settles at `scrollTop = 96`); four options were presented and not chosen | **OPEN — carried forward unchanged** |
| **U2** | **New.** Under automatic continuation, is `OCR next` (a) a More item meaning "run OCR on the rest", or (b) retired entirely because auto-preload already covers the common case? It is currently a **Header L1 button**, which violates the approved no-L1 rule, so *some* change is certain; *which* change is a product call. | **OPEN** |
| **U3** | **New.** The Zoom popup ([PdfViewer.tsx:139-140](../src/reader/pdf/PdfViewer.tsx)) is a third popup layer outside More. Does it stay a Footer-attached control, fold into More, or become a direct Footer stepper? Approved decision says Footer keeps "zoom" but does not say in what form. | **OPEN** |
| **U4** | **New.** `.reader-reveal` (`aria-label="Show reading controls"`) is a **tap** that restores chrome. Approved decision: *"Tap never toggles chrome"* → it is obsolete, but nothing replaces it, because reveal is upward-scroll-only and a user who scrolled up 200 px and stopped cannot get the header back without scrolling further up. **What is the sanctioned escape hatch?** Options: keep a non-tap affordance (e.g. edge-swipe), keep the button and amend the decision, or accept that scroll-up is the only path. | **OPEN — this is the highest-risk unresolved item** |
| **U5** | **New.** Does "OCR status only while active" include `paused` (an active, resumable state)? Footer already says yes; the Document-tools paragraph says no. | **OPEN** |
| **U6** | **New.** Finding B (preload 6 vs 12) is a **defect**, not a decision — but fixing it changes how much work happens on document open, which has real device cost. Fix now (PDF/OCR controls phase) or defer? | **RECOMMENDATION: fix**, T0d applies nothing |
| **U7** | **T0c false-reveal sensitivity** — reveal triggers at `delta < -8`; raise toward −24 or require sustained travel | **OPEN — carried forward unchanged, threshold not touched** |
| **U8** | **New.** Should the two live OCR status hosts be **merged into one**? The approved rule ("only while active") is currently satisfied by the Footer and violated by the Document-tools paragraph. Either constrain the paragraph or delete it. | **OPEN** |

**Explicitly NOT unresolved** (derivable from the approved decision list, so recorded rather than asked):
`1024px` remains the sole authority; no tablet band; dead `min-width:768px` block is deleted, not
re-targeted; More = one component, sheet ≤1023 / popover ≥1024 with ~560–640 px caps on 768–1023;
Contents/Markup/Context/Aa/Document-tools move into More; Click toggle moves into More; Footer keeps
progress, location, zoom, More and active-only OCR status; one Original/Reading control in Header, PDF
only, `aria-disabled` with reason when no readable text.

---

## 10. Verification results

**MEASUREMENT — runs performed in this audit:**

| Command | Result | Note |
| --- | --- | --- |
| `npx vitest run src/reader/pdf/PdfModeSwitch.ocr.test.tsx` | **PASS** — 1/1 | busy-disable + status text |
| `npx vitest run src/reader/pdf/usePdfOcrQueue.test.tsx` (T0c segment) | **PASS** — 14/14 | proves Finding B is *green* |
| `npx vitest run src/reader/ReaderShell.test.tsx` (T0c segment) | **1 failed / 13 passed** | **pre-existing**, caused by `ReaderShell.test.tsx:96` `'next 6'` |
| `git grep` sweeps for `pdf-queue`, `pdf-queue-status`, `'Không có trang scan'`, `'OCR 3 trang'`, `'OCR 6 trang'`, `'next 6'` | FACT set above | read-only |
| `git show 0a6c1ea` | FACT: `.pdf-queue-status` div removed | read-only |

**Pre-existing failures, NOT introduced by this audit:**

1. [src/reader/ReaderShell.test.tsx:97](../src/reader/ReaderShell.test.tsx) — fails because `:96`
   searches for a button whose text contains `'next 6'`; the label is now the 12-page string.
   Present before T0d; noted in the T0c handoff.
2. Six `.pdf-queue-status` `toContainText` assertions in `e2e` **would** fail — but they are inside
   tests that are already `test.fixme`-quarantined or that are themselves unreachable. Not run in this
   audit (no full-suite run permitted).
3. Eleven `toHaveCount(0)` `.pdf-queue-status` assertions **pass vacuously today** — a silent hole,
   not a failure.

**NOT RUN (deliberately, per scope):** the Playwright E2E suite, `verify:full`, any OCR-queue geometry
probe. Finding A removed the reason a geometry probe was needed, so no HEAVY-tier run was spent.

---

## 11. Mapping findings → approved decisions

| Approved decision | Status on HEAD | Gap |
| --- | --- | --- |
| Overlay (O) chrome | ✔ (T0c: `OVERLAY FEASIBLE`) | U1, U7 open |
| No L1 — all secondary actions in More | ✘ | 5 duplicates still in the Header (§6) |
| One shared More component | ✔ | — |
| Bottom sheet ≤1023 / popover ≥1024 | ✔ (CSS) | width caps on 768–1023 not yet applied (§7) |
| Search removed from Reader | ✔ absent | — |
| Form fill dropped | ✔ absent | — |
| Footer always visible, reserved height | ✔ | — |
| OCR status only while active | **partially** ✔ | Footer correct; Document-tools paragraph violates → U5, U8 |
| Original/Reading remains a Header control | ✔ one control in Header | `showNext={false}` suppresses the Document-tools copy — the duplicate is latent, not visible |
| No FAB | ✔ absent | — |
| No duplicate mode controls | ✔ single `role="group" aria-label="PDF view mode"` | — |
| No tablet band; `1024px` sole authority | ✔ `useDesktop.ts` | dead `min-width:768px` block → delete |
| 44 px hit targets for primary controls | ✔ 44 px ≤1023, 36 px ≥1024 | — |

---

## 12. Verdict

**INTERPRETATION.** Both audit questions are answered with source-level FACT, not inference:

- **OCR lifecycle** — 12-page windows, automatic continuation to exhaustion, single concurrent run,
  quota preflight, pause/resume/cancel/error, and a five-state status model are all confirmed in
  [usePdfOcrQueue.ts](../src/reader/pdf/usePdfOcrQueue.ts) and exercised by 14 green unit tests. Two
  defects found (A: dead CSS + 11 vacuous E2E assertions; B: 6-vs-12 preload).
- **More ownership** — the full action inventory is enumerated from three source files, every
  duplicate is identified, and the ≤1023 / ≥1024 rendering contract is confirmed already correct in
  CSS.

Neither is an "unverified question", so the **BLOCKED** condition is not met.

The eight open items in §9 are genuine product decisions — U4 in particular (the escape hatch once tap
may not toggle chrome) has no safe default and must be answered before the chrome phase.

---

`T0d AUDIT COMPLETE — READY FOR T0e`
