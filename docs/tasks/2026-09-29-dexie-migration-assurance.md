# Dexie migration assurance

## TASK

Add representative, explicit upgrade tests for the existing Dexie v1–v15 contract. Preserve user data and prove the current indexes work after upgrading. Do not alter production migrations or the schema version unless a test exposes a real defect requiring a separate decision.

## AFFECTED SUBSYSTEM

Storage: `src/db/database.test.ts`, and `src/storage/backup.test.ts` only if the backup scenario below needs an assertion. Current schema authority: `src/db/database.ts`; backup authority: `src/storage/backup.ts`.

## CURRENT STATE / ROOT CAUSE

`ContextLensDatabase` declares v1–v15. Data-transforming upgrades are v2 (legacy `lastPosition` to text `location`, then delete the old field), v8 (legacy context result to explanation, version `context-v4`), and v11 (create `saved-vocabulary` collection and assign existing words). The other versions add tables or indexes: v3 lookup `contextKey`, v4 document `kind`, v5 dictionary packs, v6 translation/context caches, v7 notes, v9 sentence analyses, v12 learned lexicon, v13 document `title` and `[kind+updatedAt]`, v14 AI usage, v15 PDF OCR. v10 adds no store/index and documents optional compatibility fields.

`database.test.ts` currently creates fresh v15 databases and checks document/OCR writes and preference normalization. It has no old-version reopen test. `backup.test.ts` checks v1/v2 restore and v4 round-trip, including collections and locations, but does not explicitly establish restore into an upgraded database. Backup versions 1–4 are independent of Dexie versions.

## LIKELY FILES

- `src/db/database.test.ts`: historical database setup, upgrade assertions, cleanup.
- `src/storage/backup.test.ts`: one focused restore assertion only if needed; existing tests already cover most backup contract behavior.
- `src/db/database.ts`, `src/storage/backup.ts`: read-only contract references.

## ARCHITECTURAL INVARIANTS

- Append-only Dexie versions; existing version definitions remain immutable.
- User documents, positions, vocabulary, collections, and notes survive upgrades. OCR remains separate from original PDF content.
- A backup is the validated, versioned portable subset. It excludes binaries, API keys, AI/cache rows, learned lexicon, and OCR rows; do not assert those are restored or change the backup format in this task.
- Legacy preference normalization happens in `loadPreferences`, not a Dexie upgrade.

## IMPLEMENTATION PLAN

Use uniquely named databases per test. Create each historical database with a separate Dexie instance whose `version(n).stores(...)` exactly matches the selected declaration in `database.ts`; close that connection, open `new ContextLensDatabase(sameName)`, assert at v15, then close and delete the database. Do not construct historical rows through the current class, and do not copy modern tables into old schemas.

1. **v1 → v15, oldest user-data path.** Historical v1 stores: `documents: 'id, updatedAt'`, `lookups: 'key, accessedAt'`, `settings: 'key'`, `vocabulary: 'id, lemma, createdAt'`. Insert a text document with `lastPosition` and no `location`, a complete legacy vocabulary row, a setting, and a lookup. Assert the document gets text `location.scrollY === lastPosition`, `lastPosition` is removed, unrelated document fields and all other rows remain, and the vocabulary gains `collectionId`/`collectionTitle` for the `saved-vocabulary` collection. Assert the new collection exists and current document title/kind index queries and vocabulary collection index query can find the rows. Use a frozen/mock clock or assert only shape for the generated `updatedAt`.
2. **v10 → v15, collection boundary.** Historical v10 effective stores are v1–v7 plus v9: `documents: 'id, kind, updatedAt'`; `lookups: 'key, contextKey, accessedAt'`; `settings: 'key'`; `vocabulary: 'id, lemma, createdAt'`; `dictionaryPacks: 'id, installedAt'`; `translations` and `contexts`: `'key, lastUsedAt, provider, languagePair, hits'`; `notes: 'id, documentId, updatedAt, [documentId+updatedAt]'`; `sentenceAnalyses: 'key, lastUsedAt, provider, languagePair, hits'`. v10 itself uses `.stores({})`. Seed a document with a valid existing `location`, vocabulary with source metadata, and a note; optionally seed one representative cache row if the setup remains compact. Assert v11 assigns the existing word to `saved-vocabulary` without changing meaning/source or note/document data. Verify current `title` and `[kind+updatedAt]` document indexes, and that v12–v15 tables/indexes can accept and retrieve representative learned-lexicon, AI-usage, and OCR records. These new-table rows are **post-upgrade writes**, not fabricated historical data.
3. **v14 → v15, immediately previous version.** Historical effective v14 stores equal the current declaration through v14: include v11 vocabulary/collections, v12 learned lexicon, v13 document indexes, and v14 `aiUsage: '++id, createdAt, provider, task'`; omit only `pdfOcr`. Seed a document with current PDF metadata/location, a collection-linked vocabulary row, learned-lexicon row, and AI-usage row with valid shapes. Assert exact preservation after upgrade; verify `pdfOcr` is created and its `documentId` and `[documentId+page]` queries work after inserting an OCR row, while original document content/location stays unchanged.
4. **Backup interaction.** Reuse the v1 or v10 upgraded database only if `restoreBackup` can be given that instance without production API changes; it currently uses the exported singleton, so avoid coupling or refactoring solely for this test. A focused `backup.test.ts` test restoring a valid legacy v1 or v2 payload into the current singleton, with document/vocabulary/note assertions and v11 collection fallback, is sufficient. Keep v4 empty-collection/source-metadata coverage already present. Do not imply a backup can recreate excluded OCR, AI usage, learned-lexicon, binary, or cache data.

Prefer three representative upgrade tests over a matrix of all version pairs. Use exact store strings from `database.ts` when implementing the historical declarations; the examples above describe effective schemas and must be checked against the code before use.

## TESTS REQUIRED / ACCEPTANCE CRITERIA

- Tests demonstrably open historical IndexedDB data under the current v15 class and assert `db.verno === 15`.
- v1 migration proves position conversion, old-field removal, vocabulary collection migration, and preservation of unrelated rows.
- v10 path proves v11 data migration and usable modern document indexes; new structures are checked by post-upgrade read/write, with no invented old-table data.
- v14 path proves existing current-era records survive creation of the v15 OCR table and its compound index works.
- Backup test, if added, validates a real supported backup version in the current schema without changing the backup contract.
- Historical connections and databases are closed/deleted in cleanup so cases are independent. Assertions check persisted rows and indexed queries, not merely table names.
- Authoritative implementation verification: `npm.cmd run verify:storage` (typecheck plus storage Vitest scope). Escalate only if implementation actually changes a shared schema or backup contract. Planner check: `NOT RUN` application tests; this task changes documentation only.

## OUT OF SCOPE

DB version bump, migration rewrites, backup-format changes, generic migration framework, every version pair, legacy-code deletion, unrelated storage fixes.
