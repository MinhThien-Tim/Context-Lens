# Reader + Home — Product/UX Decision Record (repository-grounded)

**Date:** 2026-10-03
**Role:** Planner (decision-only)
**Scope:** Resolve the open product/UX decisions that block the T0e Reader + Home behavior contract.
**Grounding:** current repository code and live architecture docs at HEAD `0230896` + uncommitted WIP.
**Explicitly NOT a source:** `docs/tasks/2026-10-03-reader-experience-redesign.md` (pre-existing design material). Where it disagrees with code, code wins.

**No production code, test, or implementation-phase ordering is included in this document.**

## Evidence legend

| Tag | Meaning |
| --- | --- |
| **FACT** | Directly supported by a file:line in the current repository. |
| **INTERPRETATION** | A necessary consequence of current behavior or an existing architecture invariant. |
| **RECOMMENDATION** | A proposed decision that still requires product acceptance. |
| **OPEN** | Evidence is insufficient; deliberately not guessed. |

## Locked authority (carried forward, not reopened)

- `≤1023px` = Mobile Chrome, `≥1024px` = Desktop Chrome, no tablet variant.
- Original/Reading is one control in the Reader Header.
- Reveal is caused by real user upward scrolling, not tapping.
- Programmatic/page-jump changes must not reveal chrome.
- OCR status is not a permanent P2 Header control.
- ReaderFab is not the replacement architecture.
- Duplicate toolbar/mode controls must not survive.
- Simple and Advanced are disclosure modes of one Reader architecture.
- PDF/Reading mode is presentation; OCR processing and document tools stay separate.

---

## Decision 1 — Reader chrome ownership

**Decision**

- **Reader Header (permanent, always mounted):** Back to library, document title, one Original/Reading presentation control (PDF only), and the More trigger.
- **Reader Footer (permanent, always mounted):** progress track, location/page navigation, PDF Original zoom menu + Click toggle, and OCR status **when an OCR run is active**.
- **Contextual disclosure (L1):** surface-specific actions surfaced on demand from the active reading surface. Ownership sits with a single chrome layer keyed by `data-reader-surface` (`text` | `original` | `reading`).
- **More (L2):** the single entry point for secondary/advanced reader actions — Document/Contents, Context panel, Notes, Markup, Text and theme, Language engines, OCR next.
- **Overlay-only (L3):** Lookup sheet, Notes panel, ReaderSettings, ApiSettings, GoToLocation, MarkupPalette, PDF Document-tools dialog. No overlay action may also be reachable from Header or Footer.
- **Duplicate-control rule:** each reader action has exactly one permanent home. A control that is only meaningful in one surface must not also appear in More.

**Evidence / Basis**

- **FACT** — The shell already exposes exactly the surface keying the decision needs: `data-reader-surface={surface}` over `'text' | 'original' | 'reading'` in [ReaderShell.tsx](src/reader/ReaderShell.tsx:13) and [ReaderShell.tsx](src/reader/ReaderShell.tsx:90).
- **FACT** — The Footer already owns the documented slot set: progress bar, location, OCR status, and a `trailingAction` seam — [ReaderProgress.tsx](src/reader/ReaderProgress.tsx:3), [ReaderProgress.tsx](src/reader/ReaderProgress.tsx:6), [ReaderProgress.tsx](src/reader/ReaderProgress.tsx:9), [ReaderProgress.tsx](src/reader/ReaderProgress.tsx:11).
- **FACT** — PDF Original mobile zoom + Click are already wired to the Footer `trailingAction` seam, not the header: [App.tsx](src/app/App.tsx:613), with the portal target `.pdf-mobile-zoom-host` resolved in [PdfViewer.tsx](src/reader/pdf/PdfViewer.tsx:84) and rendered at [PdfViewer.tsx](src/reader/pdf/PdfViewer.tsx:140).
- **FACT** — More currently lives in the **Header** and already holds the full secondary set: Document/Contents, Context panel, Notes, Markup, Text and theme, Language engines, OCR next — [ReaderToolbar.tsx](src/reader/ReaderToolbar.tsx:45) through [ReaderToolbar.tsx](src/reader/ReaderToolbar.tsx:60).
- **FACT** — `ReaderFab` is untracked WIP and constitutes a **second, competing** disclosure layer carrying Markup / Notes / Text-and-theme — [ReaderFab.tsx](src/reader/ReaderFab.tsx:5), mounted at [App.tsx](src/app/App.tsx:599).
- **FACT** — A third disclosure surface exists: `PdfModeSwitch` Document-tools popover — [PdfModeSwitch.tsx](src/reader/pdf/PdfModeSwitch.tsx:38).
- **FACT** — Doc anchors the Footer role: "`ReaderProgress` always reports reading progress separately from optional OCR status" — [ui-system.md](docs/ui-system.md:94).

**Trade-off**

Centralizing ownership removes three competing disclosure surfaces and the CSS-class coupling they rely on, but requires the L1 contextual set to be defined per surface — a surface-to-action registry that does not exist in code today.

**Implementation consequence**

- One chrome owner for disclosure level and quiet state; More relocated from Header to Footer per Decision 3.
- Retire the second disclosure layer and the `.pdf-mode-switch` presentation duplicate per Decision 5.
- Overlay-open detection must stop matching CSS class strings (Decision 4).

**Status:** RESOLVED for layer ownership; **OPEN** for the concrete L1 control set (see "Open decisions" #1).

---

## Decision 2 — Quiet/reveal ownership and exclusions

**Decision**

- **Owner:** the reader chrome layer (`ReaderShell` today) owns a single `quiet` boolean. There is no second quieting mechanism, no per-surface quieting, and no timer-driven quiet.
- **Reveal trigger:** real upward user scroll only (and top-of-document proximity, which is the same upward state). Tapping is **not** a reveal trigger in the new contract.
- **Must NOT reveal chrome:** programmatic scroll restoration, page jumps (`jumpPdfPage`, `jump`), mode switching, zoom changes, and any `scrollTop` write not produced by a user gesture.
- **Must NOT quiet chrome:** any state in which a disclosure, overlay, or active selection exists.
- **Explicit product rule for the residual edge case:** quiet is a *visual* state only. Quieting must never change content geometry — no `scrollTop` rewrite, no height-token change, no reflow. This is the invariant the A12 baseline protects.

**Evidence / Basis**

- **FACT** — `quiet` already has a single owner and a single DOM expression: `chrome-quiet` on the shell root — [ReaderShell.tsx](src/reader/ReaderShell.tsx:18), [ReaderShell.tsx](src/reader/ReaderShell.tsx:90).
- **FACT** — The gesture classifier is centralized with named thresholds: `TAP_MS = 450`, `TAP_SLOP = 10`, `QUIET_TRAVEL = 32` — [ReaderShell.tsx](src/reader/ReaderShell.tsx:7).
- **FACT** — Reveal currently also fires on a **confirmed tap** (`setQuiet(false)` in the `up` handler) and on focus capture (`onFocusCapture`) — [ReaderShell.tsx](src/reader/ReaderShell.tsx:54), [ReaderShell.tsx](src/reader/ReaderShell.tsx:90). The tap path contradicts the locked "reveal = upward scroll, not tapping" authority.
- **FACT** — Overlay blocking is done by matching CSS class **strings**, not by state — [ReaderShell.tsx](src/reader/ReaderShell.tsx:11), applied at [ReaderShell.tsx](src/reader/ReaderShell.tsx:70). A disclosure surface that omits its class from that string silently stops blocking quiet.
- **FACT** — Programmatic jumps are already covered by an existing test: "does not hide controls for a programmatic restore or page jump" — [ReaderShell.test.tsx](src/reader/ReaderShell.test.tsx:65).
- **FACT** — Layout contract is documented as opacity/transform only, never geometry — [ui-system.md](docs/ui-system.md:96).
- **INTERPRETATION** — Because quiet is expressed purely as a class on the shell root, the reveal exclusions are enforceable only if every overlay registers itself. The current string matcher makes that registration implicit and lossy.

**Trade-off**

Dropping tap-to-reveal removes a forgiving affordance (one extra way back to controls) in exchange for a single, auditable reveal cause and no tap/scroll classifier ambiguity. Keeping tap reveal is what forced the 450 ms / 10 px / scrollTop-unchanged classifier to exist in the first place.

**Implementation consequence**

- Remove the tap-reveal branch; keep the upward-scroll and top-of-document branches.
- Replace `OVERLAY_OPEN` string matching with explicit overlay registration, so a new overlay cannot silently bypass the lock.
- Keep `controlsLocked` as the single explicit lock input — [App.tsx](src/app/App.tsx:593).

**Status:** RESOLVED. Note: removing tap-reveal invalidates the currently-green tap tests at [ReaderShell.test.tsx](src/reader/ReaderShell.test.tsx:134) and [ReaderShell.test.tsx](src/reader/ReaderShell.test.tsx:143); those tests encode the superseded rule and are marked for replacement, not for making production code comply.

---

## Decision 3 — Footer behaviour and More ownership

**Decision**

- **Progress and location remain visible while chrome is quiet.** The Footer does not participate in the quiet transition.
- **More is the single entry point for secondary/advanced reader actions and lives in the Footer.**
- More contents: Document/Contents, Context panel, Notes, Markup, Text and theme, Language engines, OCR next.
- Header carries no More; Footer carries no Contents/Context direct buttons.

**Evidence / Basis**

- **FACT** — The Footer already stays visible in one documented case only: `data-reader-surface="original"` is exempted from quiet translation — [styles.mobile-reader.css](src/styles.mobile-reader.css:80). The general rule translates **both** chrome regions out — [reader-layout.css](src/reader-layout.css:110), [reader-layout.css](src/reader-layout.css:111). So today's steady state is "footer quiets too", with a per-surface exception.
- **FACT** — More is implemented in the Header today — [ReaderToolbar.tsx](src/reader/ReaderToolbar.tsx:45).
- **FACT** — The Footer has no More slot; it has only `trailingAction`, currently occupied by the PDF Original zoom host + Click toggle — [ReaderProgress.tsx](src/reader/ReaderProgress.tsx:11), [App.tsx](src/app/App.tsx:613).
- **INTERPRETATION** — Keeping location visible while quiet is already the behavior for Original PDFs, and the `PageNavigation` / `DocumentPosition` slot lives inside the Footer — [App.tsx](src/app/App.tsx:614). Generalising that exemption is consistent, not novel.
- **INTERPRETATION** — "Progress/location always visible" and "quiet hides chrome" are reconcilable only if quiet is scoped to the Header. That is a genuine narrowing of today's CSS, and it is what Decision 1 already implies by naming Header as the quieting surface.

**Trade-off**

A permanently visible Footer costs ~40–44 px of reading height at the bottom and slightly weakens the "immersive" quiet state; in exchange, page position and the primary disclosure entry point are never hidden, and PDF Original already ships this behavior.

**Implementation consequence**

- Footer stays mounted and visible in `chrome-quiet` on every surface; remove the translate-out rule for the Footer.
- Move the More trigger and its menu to the Footer; remove `reader-more` / `reader-more-menu` ownership from the Header.
- The `trailingAction` seam needs a defined order (Location → Zoom/Click → More) so PDF Original keeps both.

**Status:** RESOLVED.

---

## Decision 4 — Back dismissal priority

**Decision**

Exactly one owner, five tiers, first match wins:

1. Open **overlay** (Lookup, Notes, ReaderSettings, ApiSettings, GoToLocation, MarkupPalette, PDF Document tools)
2. Expanded **contextual disclosure** (L1 / More sheet)
3. **Reader chrome** in quiet state → un-quiet
4. **Document** → leave the reader
5. **App navigation** (nothing left to dismiss)

A single Back implementation resolves the highest open tier only; it never collapses two tiers at once.

**Evidence / Basis**

- **FACT** — Today no single owner exists. Dismissal is spread across: `useDialog`'s Escape handler — [useDialog.ts](src/components/useDialog.ts:28); per-panel `onClose` callbacks wired in [App.tsx](src/app/App.tsx:616) through [App.tsx](src/app/App.tsx:619); ad-hoc mutual-exclusion logic in `closeContext`, `toggleDocumentPanel`, `toggleContextPanel` — [App.tsx](src/app/App.tsx:259), [App.tsx](src/app/App.tsx:263), [App.tsx](src/app/App.tsx:267); a `contentsOpen` auto-close effect — [App.tsx](src/app/App.tsx:144); and the Header Back button's direct `closeDocument()` — [App.tsx](src/app/App.tsx:595) combined with [ReaderToolbar.tsx](src/reader/ReaderToolbar.tsx:32).
- **FACT** — `ReaderFab` additionally owns a private history entry: it pushes state on expand and closes on `popstate` — [ReaderFab.tsx](src/reader/ReaderFab.tsx:63), [ReaderFab.tsx](src/reader/ReaderFab.tsx:60). This is a second, competing Back implementation at tier 2.
- **FACT** — Header Back skips tiers 1–3 entirely: it calls `closeDocument()` directly, so an open overlay does not intercept it — [App.tsx](src/app/App.tsx:595).
- **FACT** — A repository invariant already forbids new competing ownership: "New UI goes through `App.tsx` state and props" and "`useDesktop()` (1024 px) is the single responsive authority" — [ui-system.md](docs/ui-system.md:259), [ui-system.md](docs/ui-system.md:261).
- **INTERPRETATION** — The ad-hoc logic at [App.tsx](src/app/App.tsx:259)–[App.tsx](src/app/App.tsx:268) already behaves as a partial tier-1/tier-2 resolver (closing context before opening contents, closing contents when lookup opens). It is the prototype of the single resolver, but it has no ordering guarantee against the header Back button or the FAB.

**Trade-off**

A single resolver centralizes behavior and makes Back predictable, at the cost of touching the open/close path of every overlay. Two conflicts must be retired rather than reconciled: the FAB's private history entry (tier-2 duplication) and the Header Back button bypassing tiers 1–3.

**Implementation consequence**

- One `resolveBack()` in `App.tsx`; the header Back button and any hardware/browser Back route through it.
- Remove `ReaderFab`'s `history.pushState` / `popstate` pair with the component.
- `useDialog` keeps ownership of Escape **within** its own dialog; it must not become the global resolver.

**Status:** RESOLVED.

---

## Decision 5 — Original / Reading control semantics

**Decision**

- One control in the Reader Header, rendered only for PDF surfaces.
- Allowed transitions: `original ⇄ reading` — a single toggle. No third state.
- Allowed gate: the transition to `reading` is refused when the document has neither readable PDF text nor selected OCR. This is the existing `canRead` rule and it is retained.
- The control is presentation-only. It may not host OCR queue actions, document tools, text-source selection, or zoom.
- The `.pdf-mode-switch` segmented control does not survive in the Reader chrome.

**Evidence / Basis**

- **FACT** — The gate already exists and is enforced in state, not just visually: `changePdfViewMode` returns early when `mode === 'reading' && !pdfHasReadableText(documentRecord) && !hasSelectedOcr` — [App.tsx](src/app/App.tsx:451).
- **FACT** — `PdfModeSwitch` applies the same gate to its own buttons via `canRead` — [PdfModeSwitch.tsx](src/reader/pdf/PdfModeSwitch.tsx:33), supplied at [App.tsx](src/app/App.tsx:596).
- **FACT** — `PdfModeSwitch` currently mixes five concerns in one component: mode segment, Document-tools trigger, text-source selection, OCR language, and queue controls — [PdfModeSwitch.tsx](src/reader/pdf/PdfModeSwitch.tsx:32) through [PdfModeSwitch.tsx](src/reader/pdf/PdfModeSwitch.tsx:48).
- **FACT** — A header-level toggle was added in WIP and is mutually exclusive with the segmented control — [ReaderToolbar.tsx](src/reader/ReaderToolbar.tsx:38).
- **FACT** — The WIP resolves the duplicate by CSS, not by structure: `.pdf-mode-controls` is `display: none` on phones — [styles.mobile-reader.css](src/styles.mobile-reader.css:46).
- **INTERPRETATION** — Because the segmented control is hidden rather than unmounted on phones and remains mounted at every width, the two controls coexist in the DOM. Duplicate controls are prohibited by locked authority, and the E2E suite already has to branch around the ambiguity — [pdf-mode-layout.spec.ts](e2e/pdf-mode-layout.spec.ts:9), [pdf-mode-layout.spec.ts](e2e/pdf-mode-layout.spec.ts:59).
- **INTERPRETATION** — OCR queue actions are already reachable outside the mode control (`OCR next` in More) — [ReaderToolbar.tsx](src/reader/ReaderToolbar.tsx:60) — so moving them out of the mode control loses no capability.

**Trade-off**

A two-state toggle is less explicit than a labelled segment on desktop, and it costs one press to learn the current mode. In exchange it removes a five-concern component, one permanent CSS-hidden subtree, and the source of the `.pdf-mode-switch` test branch.

**Implementation consequence**

- Keep the header toggle and the `changePdfViewMode` gate.
- Reduce the mode segment to PDF text/source/OCR tooling; stop rendering a second view-mode control from it.
- Assertions that target `.pdf-mode-switch` as the view-mode control are marked for replacement.

**Status:** RESOLVED.

---

## Decision 6 — Search disposition

**Decision**

Search is **removed** from the Reader chrome. It is retained only on Home, where it is a working feature.

- Remove the Reader header Search button and its behavioral assertions.
- Keep `Search library` on Home unchanged.

**Evidence / Basis**

- **FACT** — The Reader Search control is a hard no-op: `onClick={() => {}}` and `disabled` — [ReaderToolbar.tsx](src/reader/ReaderToolbar.tsx:37). There is no state, no handler, and no test that exercises a working path for it.
- **FACT** — The repo's only functioning search is Home's library title search — [App.tsx](src/app/App.tsx:537), [App.tsx](src/app/App.tsx:575), backed by `queryDocumentLibrary` — [useLibrary.ts](src/app/useLibrary.ts:15), [database.ts](src/db/database.ts:234).
- **FACT** — Existing E2E search assertions are all Home-scoped — [homepage.spec.ts](e2e/homepage.spec.ts:22), [homepage.spec.ts](e2e/homepage.spec.ts:33), [homepage.spec.ts](e2e/homepage.spec.ts:114). No E2E test asserts a Reader Search behavior, so removal has a zero test blast radius today.
- **FACT** — A disabled control still consumes a permanent Header slot at both densities — [ReaderToolbar.tsx](src/reader/ReaderToolbar.tsx:36) is the Header actions row.
- **INTERPRETATION** — Search was not in the locked "must retain" list and has no product role in the new disclosure model; More is the designated home for secondary actions, and adding document search there would be a new feature rather than a retention.

**Trade-off**

Removing it frees a permanent slot but drops a visible affordance for a capability that was never functional. Retaining it would require building document search — explicitly out of scope for this redesign phase.

**Implementation consequence**

- Delete the button and its import from the Header actions row.
- Mark any future Reader-search assertion as obsolete rather than implementing to it.

**Status:** RESOLVED.

---

## Decision 7 — Simple / Advanced disclosure difference

**Decision**

- Simple and Advanced differ only in **what is disclosed**, never in architecture, state model, component tree, or breakpoint behavior.
- Simple: minimal permanent chrome; secondary actions reached through More; document tools reached through disclosure.
- Advanced: the same surfaces stay reachable, with more of them additionally disclosed directly (panels, tools, diagnostics) — not a different reader.
- One Reader architecture, one state model, one chrome owner, for both densities.

**Evidence / Basis**

- **FACT** — Density is a single persisted preference that changes presentation only — `interfaceMode: 'simple' | 'advanced'` — [database.ts](src/db/database.ts:253).
- **FACT** — The shell exposes it as an attribute for styling, with no behavioral branch in the shell — [ReaderShell.tsx](src/reader/ReaderShell.tsx:90).
- **FACT** — `ReaderToolbar` still accepts `interfaceMode` but no longer reads it: the WIP removed the `desktop && interfaceMode === 'advanced'` Context-panel button from the Header — [ReaderToolbar.tsx](src/reader/ReaderToolbar.tsx:8), [ReaderToolbar.tsx](src/reader/ReaderToolbar.tsx:15).
- **FACT** — Simple/Advanced is enforced entirely in CSS through `data-interface-mode`, and only for Home today — [App.tsx](src/app/App.tsx:504), [home-advanced.css](src/home-advanced.css:2). No reader stylesheet keys off it.
- **FACT** — Documentation states the same principle for Home: "one density preference, no second preference state" — [ui-system.md](docs/ui-system.md:44).
- **INTERPRETATION** — Because reader chrome carries no density branch today, Simple and Advanced already share one architecture; the WIP makes this more true by removing the last reader-side branch. That is consistent with locked authority, not a new rule.
- **INTERPRETATION** — `PdfViewer` retains an unused `interfaceMode?` prop with no read site — [PdfViewer.tsx](src/reader/pdf/PdfViewer.tsx:16); it is a leftover seam, not a second architecture.

**Trade-off**

Collapsing the last reader-side density branch means Advanced users lose one direct Header shortcut and reach the same panel through More. In exchange no density-specific state machine, breakpoint, or code path exists to drift.

**Implementation consequence**

- Reader behavior must remain density-independent in code; any density difference is CSS-only, keyed on the existing `data-interface-mode` attribute.
- Remove the now-dead `interfaceMode` prop from `ReaderToolbar` and `PdfViewer` only as incidental cleanup within this subsystem.

**Status:** RESOLVED.

---

## Decision 8 — Mobile/desktop boundary implications

**Decision**

- `useDesktop()` at `min-width: 1024px` is the single responsive authority and stays that way.
- Every reader behavior in this record applies to **both** bands. Nothing in the contract may branch on a boundary other than 1024 px.
- The mobile band is `≤1023px`, inclusive. There is no third band.

**Evidence / Basis**

- **FACT** — `useDesktop()` uses `window.matchMedia('(min-width: 1024px)')` and nothing else — [useDesktop.ts](src/components/useDesktop.ts:2), [useDesktop.ts](src/components/useDesktop.ts:6).
- **FACT** — This is a written repository invariant: "`useDesktop()` (1024 px) is the single responsive authority; do not add a second breakpoint source inside a component" — [ui-system.md](docs/ui-system.md:259).
- **FACT** — Shared reader layout already uses the correct pair: `min-width:1024px` and `max-width:1023px` — [reader-layout.css](src/reader-layout.css:87), [reader-layout.css](src/reader-layout.css:94).
- **FACT** — Desktop reader presentation uses the correct pair — [styles.desktop-reader.css](src/styles.desktop-reader.css:2).
- **FACT (defect)** — The WIP phone stylesheet uses `@media (max-width: 767px)` — [styles.mobile-reader.css](src/styles.mobile-reader.css:2), [styles.mobile-reader.css](src/styles.mobile-reader.css:274) — which is **not** the mobile band. The `768–1023px` band is classified Mobile Chrome by the contract but receives neither the phone stylesheet nor the desktop one for the rules those two define.
- **FACT (defect)** — Every `.reader-fab*` rule lives inside the `767px` block — [styles.mobile-reader.css](src/styles.mobile-reader.css:87) onward — while the FAB is mounted for PDF at **all** widths with no `desktop` guard — [App.tsx](src/app/App.tsx:599), [ReaderFab.tsx](src/reader/ReaderFab.tsx:17). Result: an unstyled FAB in the 768–1023px band.
- **FACT (defect)** — The E2E layout test branches on `width >= 768` at six sites — [pdf-mode-layout.spec.ts](e2e/pdf-mode-layout.spec.ts:20), [pdf-mode-layout.spec.ts](e2e/pdf-mode-layout.spec.ts:53), [pdf-mode-layout.spec.ts](e2e/pdf-mode-layout.spec.ts:60), [pdf-mode-layout.spec.ts](e2e/pdf-mode-layout.spec.ts:67), [pdf-mode-layout.spec.ts](e2e/pdf-mode-layout.spec.ts:97) — encoding a boundary the contract does not have.
- **INTERPRETATION** — Geometry matrix design is explicitly out of scope here; what the contract must carry is the single-boundary rule plus the A12 geometry invariant that header/footer height tokens fully reserve viewport height and quieting never moves scroll geometry.

**Trade-off**

Correcting `767px` → `1023px` touches every phone rule that assumed a narrow phone (touch targets, fixed-header offsets, safe-area padding) and will change rendering across the 768–1023px band. That is required by locked authority, but it enlarges the diff and the visual-regression surface.

**Implementation consequence**

- The contract asserts exactly two bands and forbids `768`/`767` branching anywhere.
- The `768–1023px` band must be specified explicitly in T0e, since today it is styled by neither stylesheet.

**Status:** RESOLVED.

---

## Consolidated outcome

### Final Reader Header responsibilities

| Slot | Owner | Condition |
| --- | --- | --- |
| Back to library | Header | always; routed through the single Back resolver (Decision 4) |
| Document title | Header | always |
| Original / Reading toggle | Header | PDF surfaces only; two-state; gated by readable-text-or-OCR (Decision 5) |
| More trigger | — | **not** in the Header; moved to Footer (Decision 3) |
| Search | — | **removed** (Decision 6) |
| Markup / Notes / Aa / Language engines | — | not permanent; reached through More (Decision 1) |

### Final Reader Footer responsibilities

| Slot | Owner | Condition |
| --- | --- | --- |
| Progress track | Footer | always; **visible while quiet** (Decision 3) |
| Location / page navigation | Footer | always; visible while quiet (Decision 3) |
| PDF Original zoom menu + Click | Footer trailing action | PDF + Original only — [App.tsx](src/app/App.tsx:613) |
| OCR status | Footer | only while an OCR run is active — [ReaderProgress.tsx](src/reader/ReaderProgress.tsx:9) |
| More trigger | Footer | always; sole entry to secondary actions (Decision 3) |

### Quiet/reveal ownership and exclusions

- Owner: the reader chrome layer, single `quiet` boolean → `chrome-quiet` class.
- Reveal: real upward user scroll, plus top-of-document proximity.
- Excluded from reveal: programmatic restore, page jump, mode switch, zoom change, any non-gesture `scrollTop` write.
- Excluded from quieting: any open disclosure, overlay, or active selection.
- Tap reveal: **removed**.
- Geometry: quiet changes transform/opacity only, never `scrollTop`, height tokens, or layout (A12 invariant).

### More/disclosure responsibility

More is the single entry point for secondary/advanced reader actions and lives in the Footer. L1 contextual disclosure is owned by the chrome layer keyed on `data-reader-surface`. L3 overlays are triggered from More and never duplicated in Header/Footer.

### Back dismissal priority

`overlay → expanded contextual UI → reader chrome quiet → document → app navigation`, first match only, one implementation. Two conflicts retired: the FAB's private history entry, and the Header Back button bypassing tiers 1–3.

### Original/Reading control semantics

One Header control, two states, `original ⇄ reading`, gated on readable PDF text or selected OCR. Presentation only. The `.pdf-mode-switch` view-mode segment does not survive; OCR queue and document tools remain separate concerns.

### Search disposition

Removed from the Reader chrome (it was a disabled no-op). Retained on Home, where it is implemented. No Reader search assertions are in force.

### Simple/Advanced disclosure difference

Disclosure breadth only. One architecture, one state model, one chrome owner, one breakpoint authority. Density differences are CSS-only via `data-interface-mode`.

---

## Open decisions (must be resolved before T0e)

| # | Open item | Why it is open | Smallest unblocking input |
| --- | --- | --- | --- |
| 1 | **The concrete L1 contextual control set per surface** (`text` / `original` / `reading`). | No per-surface action registry exists in code. `ReaderShell` only exposes `surface`; no component maps a surface to controls. Guessing would invent a feature set. | Product names the actions each surface discloses, or approves "no L1 layer; surface-specific actions stay in More" as the default. |
| 2 | **Presentation of More per band** — one shared bottom sheet on mobile and popover on desktop, or one shared component. | Today More is a Header popover on every width — [ReaderToolbar.tsx](src/reader/ReaderToolbar.tsx:46) — while Footer menus elsewhere are already bottom sheets on phones — [reader-layout.css](src/reader-layout.css:107). No shared component exists; choosing would be a design act, not a derivation. | Product accepts one shared disclosure component with per-band presentation, or two. |
| 3 | **`Form fill`** — currently wired but empty. | The handler is a literal no-op — [App.tsx](src/app/App.tsx:599) — so the code shows neither a retained feature nor a removed one. Dropping vs. deferring is a product call with no evidence either way. | Product marks it dropped or deferred; no UI work until then. |
| 4 | **Whether the `768–1023px` band gets its own visual spec**, or inherits phone presentation wholesale. | The band is Mobile Chrome by locked authority, but the phone stylesheet stops at `767px` and the desktop one starts at `1024px` — [styles.mobile-reader.css](src/styles.mobile-reader.css:2), [styles.desktop-reader.css](src/styles.desktop-reader.css:2). Whether phone presentation is *correct* at 1023px is not derivable from code. | Product accepts "phone presentation is the mobile band, including 768–1023px" as the contract statement. |

**Not open** (recorded here so T0e does not re-litigate): quiet is visual-only and never changes geometry; Footer stays visible while quiet; tap reveal is gone; Back has one owner with five tiers; Search is removed; density is architecture-independent; the single boundary is 1024 px.

## Baseline defects found while grounding these decisions

Reported, not fixed — this is a decision record, and production code must not be changed to satisfy superseded assertions.

| # | Location | Finding |
| --- | --- | --- |
| D1 | [styles.mobile-reader.css](src/styles.mobile-reader.css:2) | Phone stylesheet uses `max-width: 767px`; the Mobile Chrome band is `≤1023px`. The 768–1023px band is styled by neither phone nor desktop rules for the concerns those two define. |
| D2 | [ReaderFab.tsx](src/reader/ReaderFab.tsx:17), [App.tsx](src/app/App.tsx:599) | `ReaderFab` has no `desktop` guard and all its CSS lives inside the `767px` block, so it renders unstyled in 768–1023px. |
| D3 | [pdf-mode-layout.spec.ts](e2e/pdf-mode-layout.spec.ts:20) | Six `width >= 768` branches encode a boundary that contradicts the locked contract. |
| D4 | [pdf-mode-layout.spec.ts](e2e/pdf-mode-layout.spec.ts:112) | The mobile `OCR next` visibility assertion was commented out rather than relocated to the More menu. |
| D5 | [ReaderShell.tsx](src/reader/ReaderShell.tsx:54) | Tap-to-reveal contradicts the locked "reveal = upward scroll" authority; the matching tests currently pass and encode the superseded rule. |
| D6 | [ReaderToolbar.tsx](src/reader/ReaderToolbar.tsx:8), [PdfViewer.tsx](src/reader/pdf/PdfViewer.tsx:16) | `interfaceMode` is accepted but unread in both components — dead seams left by the WIP. |

## Verification performed for this record

Read-only inspection only. No builds, no test suites, no production edits — per the task's decision-only constraint.

| Check | Result |
| --- | --- |
| Source inspection of the reader shell, toolbar, progress, FAB, PDF mode switch, desktop hook, reader stylesheets, `App.tsx`, `ui-system.md`, `reader.md` | PASS |
| `git status` / `git diff` read to confirm WIP state without modifying it | PASS |