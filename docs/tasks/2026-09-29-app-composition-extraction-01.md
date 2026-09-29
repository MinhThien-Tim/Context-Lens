# App composition extraction 01

## TASK

Extract the **Library list session** from `src/app/App.tsx` into a small feature-owned hook, tentatively `src/app/useLibrary.ts`. This first extraction owns only search/filter state, the visible page of documents, loading/has-more state, the 120 ms initial/filter query, explicit first-page refresh, and Load more. Preserve behavior exactly.

## AFFECTED SUBSYSTEM

App composition and homepage Library state. `App.tsx` remains the composition root and renders both Simple and Advanced Library markup.

## CURRENT STATE / ROOT CAUSE

- `App.tsx` owns `libraryDocs`, `libraryQuery`, `libraryKind`, `libraryHasMore`, and `libraryLoading`. A query/filter effect fetches 18 rows after 120 ms and cancels stale effect results. Both Library variants duplicate Load more and refresh-after-delete handlers. Closing a document and restoring storage also refresh the first page.
- `queryDocumentLibrary` in `src/db/database.ts` is the existing data contract: title search, optional kind, offset, limit, `updatedAt` ordering, and `hasMore`. The hook should call it unchanged.
- The Library is coupled to document opening only through `onOpen`; deletion also removes notes and PDF OCR in one Dexie transaction and removes the deleted item from Continue reading. These cross-feature actions are higher risk and stay in `App.tsx` for this extraction.
- Continue reading has its own query and dismissal state; it is separate from the Library list and stays in `App.tsx`.

## TARGET OWNERSHIP / PROPOSED API

`useLibrary()` owns `{ documents, query, setQuery, kind, setKind, hasMore, loading, refresh, loadMore }` (names may be adjusted locally). `refresh()` immediately requeries the first 18 rows using the current query/kind and replaces documents/hasMore. `loadMore()` queries with `offset: documents.length`, appends results, and updates hasMore/loading. The query/kind effect keeps the current 120 ms debounce and stale-result cleanup. Preserve current loading transitions and query timing; avoid new caching or data subscriptions.

`App.tsx` consumes the hook in both homepage variants. It invokes `refresh()` at the same existing points: after closing a document, after successful transactional deletion, and after backup restoration. The deletion transaction, confirmation text, `setContinueDocs` update, document opening, and import flow remain in `App.tsx`.

State remaining in `App.tsx`: open `DocumentRecord`, import/share state, Continue reading list, preferences and onboarding, lookup/AI/engine state, PDF/OCR state, markup, notes/vocabulary, navigation and panels, online/update indicators, and all modal visibility. No existing state is mirrored in the hook.

## LIKELY FILES

- `src/app/App.tsx` — replace Library list state/effect/query handlers with the hook; keep rendered markup and cross-feature actions.
- `src/app/useLibrary.ts` — new hook for the scoped list session.
- `src/app/useLibrary.test.tsx` — focused hook behavior tests using jsdom and fake IndexedDB.
- `docs/ui-system.md` and `docs/data-storage.md` — update only their Library state ownership/data-flow descriptions to reflect the new hook. No architecture-map rewrite is needed unless its ownership wording becomes inaccurate.

## ARCHITECTURAL INVARIANTS / CONSTRAINTS

- Keep the existing Dexie schema, `queryDocumentLibrary` signature/order/page size, and document/notes/pdfOcr delete transaction unchanged.
- Keep Continue reading behavior and its dismissal flag independent of Library membership.
- Keep both Simple and Advanced Library UI, search/filter controls, loading and empty states, confirmation, offline badges, and navigation behavior unchanged.
- No state library, global context, new network path, lookup/PDF contract change, or unrelated refactor.

## IMPLEMENTATION PLAN

1. Move the five Library state values and their query/filter effect into the hook without changing the 120 ms timer, cancellation, initial values, or 18-row limit.
2. Move the repeated first-page query and Load more behavior into `refresh()` and `loadMore()`. Replace the corresponding App call sites in both home variants, close-document, deletion success, and restore success.
3. Keep cross-feature operations and presentation in App. Update the two active domain docs where they currently say App owns the Library list.

## ACCEPTANCE CRITERIA

- Search, kind filter, initial 18 rows, Load more, and loading/empty/has-more presentation behave as before in both interface modes.
- Closing a document, deleting one, or restoring a backup refreshes the visible Library using the current query and kind, replacing the list with the first page as before.
- Document deletion still removes its document, notes, and PDF OCR records atomically, and removes it from Continue reading without changing Library membership rules.
- No UI text, markup, CSS, storage schema, persisted data shape, import, reader, lookup, or PDF behavior changes.

## TESTS REQUIRED

- Add a focused hook test covering initial query, query/kind changes after 120 ms, Load more append/hasMore, and explicit refresh after a stored document changes. Use existing fake IndexedDB setup and Preact `act` conventions; include stale-effect cleanup if the hook implementation changes its timing/cancellation.
- Run `npm.cmd run verify:ui` as the authoritative subsystem check (includes typecheck and `src/app` tests). Existing `src/app/continueReading.test.ts` covers dismissal independence. No browser E2E or full suite unless implementation evidence shows a wider effect.
- Planning/document-only verification: inspect the task file and diff; application tests are **NOT RUN** in this Planner task.

## ROLLBACK BOUNDARY

Revert the hook and its App wiring/test and restore the five local Library state values plus original query call sites. No persistence or contract migration is involved; user data needs no rollback.

## FOLLOW-UP CANDIDATES (OUT OF SCOPE)

Reader preferences, document session/navigation, lookup session, PDF/OCR session, and markup ownership can be assessed separately after this extraction. Do not include them in this task.
