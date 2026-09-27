# Data & Storage

Scope: what is persisted, by whom, and how it flows.
Related: [ARCHITECTURE.md](ARCHITECTURE.md), [translation-pipeline.md](translation-pipeline.md), [reader.md](reader.md).

## Storage technologies

| Technology | Used for |
| --- | --- |
| Dexie / IndexedDB (`context-lens`, schema v15) | Documents, caches, notes, vocabulary, OCR text, settings, dictionary packs, AI usage |
| `sessionStorage` | API key / AI settings when key storage is `session` (`src/settings/store.ts`, key `context-lens-ai-session`) |
| Cache Storage (service worker) | App shell, static assets, `/ocr/**` worker files, lazily used reader chunks (`vite.config.ts`) |
| `navigator.storage` | `estimate()` / `persisted()` reporting and the `persist()` request (`src/storage/storageService.ts`) |
| `localStorage` | **Not used** by the app. The only `localStorage` mention in the repo is inside the `tmp/english101` fixture. |

## Dexie tables

`src/db/database.ts` — `ContextLensDatabase`, exported as the `db` singleton.

| Table | Key / indexes | Owner |
| --- | --- | --- |
| `documents` | `id, kind, title, updatedAt, [kind+updatedAt]` | Importer + reader; holds `content`, `safeHtml`, `data` (original file Blob), `pageOffsets`, `pdfPages`, `toc`, `highlights`, `pdfTextSources`, `pdfOcrLanguage`, `pdfHash`, `location` |
| `lookups` | `key, contextKey, accessedAt` | Legacy/secondary lookup cache (`src/lookup/cacheRepository.ts`), capped at 500 with access-order eviction; also used by the context router's legacy path |
| `settings` | `key` | `reader-preferences`, `language-engines`, `ai-settings`, `homepage.theme`, and the Wiktionary TTL cache written by `lookupWebDictionary` |
| `vocabulary` | `id, lemma, createdAt, collectionId` | `src/vocabulary/store.ts` |
| `vocabularyCollections` | `id, sourceDocumentId, updatedAt` | Added in v11 with a `saved-vocabulary` default collection |
| `dictionaryPacks` | `id, installedAt` | User-installed licensed packs with license/attribution metadata |
| `translations` | `key, lastUsedAt, provider, languagePair, hits` | `EngineCache` for `TranslationRouter` |
| `contexts` | `key, lastUsedAt, provider, languagePair, hits` | `EngineCache` for `ContextRouter` |
| `notes` | `id, documentId, updatedAt, [documentId+updatedAt]` | `src/notes/store.ts` |
| `sentenceAnalyses` | `key, lastUsedAt, provider, languagePair, hits` | `SentenceAnalysisCache` |
| `learnedLexicon` | `key, normalizedKey, lemma, updatedAt` | `src/lookup/learnedLexicon.ts` — words the local engine already resolved, reused for faster and more consistent later lookups |
| `aiUsage` | `++id, createdAt, provider, task` | `src/ai/usage.ts` — per-request token, latency, and cache-hit accounting |
| `pdfOcr` | `key, documentId, [documentId+page]` | `src/documents/pdf/ocrStore.ts` — recognized text per page, language, config version, render parameters, and document hash |

Migration history lives in the same file, v1→v15: v2 introduced structured `location` and removed
`lastPosition`; v6 added translation/context caches; v9 added `sentenceAnalyses`; v11 added
collections and migrated older words; v13 indexed documents for the library; v15 added `pdfOcr`.
A change must append a new `this.version(n)` and never rewrite an existing one.

## Document and library data flow

```text
import (paste/file/URL) → ImportedDocument → toDocumentRecord() → db.documents.put
open    → db.documents.get(id) → App.tsx state → reader surface
scroll  → location(page/offset/scrollY/progress) → debounced db.documents.update
markup  → db.documents.update({ highlights })
delete  → one rw transaction over documents + notes + pdfOcr
library → queryDocumentLibrary({ query, kind, offset, limit }) — paged, sorted by updatedAt
```

Deleting a document does not remove caches or vocabulary; the storage dashboard handles those
separately.

## Cache data flow

- `EngineCache` writes only through `put()`, which stores
  `{ key, result, provider, languagePair, version, createdAt, lastUsedAt, hits }` and schedules a
  deferred hit-weighted LRU cleanup bounded by the configured record limits. A failed read returns
  `null` instead of throwing.
- Cache rows are keyed with a version constant (`TRANSLATION_VERSION`, `CONTEXT_VERSION`). Bumping
  the constant makes old rows unreachable without deleting them.
- `maintainStorageBudget()` runs on app start: when `usage / quota >= 0.85` it clears engine memory
  and trims cache tables before touching anything else.
- `clearLookupCache()` clears the memory layer plus `lookups`, `translations`, `contexts`, and
  `sentenceAnalyses`; the storage dashboard exposes it.

## OCR persistence

`db.pdfOcr` rows hold `documentId`, `page`, `language` (`eng` | `eng+vie`), `configVersion`, `text`,
optional `documentHash`, `renderParameters`, derived `blocks`, and `createdAt`. `ocrKey` composes
the identity, so a changed file hash, language, config version, or render raster invalidates prior
results without deleting them. `loadOcrPages` also back-fills the document hash for older rows and
re-saves legacy config rows when the raster settings still match. Per-page source selection lives
on the document record (`pdfTextSources`), not on the OCR row.

## Settings

| Key | Written by |
| --- | --- |
| `reader-preferences` | `loadPreferences` / `savePreferences` in `src/db/database.ts` |
| `language-engines` | `src/settings/engines.ts` (`loadEngineSettings` / `saveEngineSettings`) |
| `ai-settings` | `src/settings/store.ts`, only when `keyStorage === 'persistent'`; session mode uses `sessionStorage` and deletes the DB row |
| `homepage.theme` | `src/app/App.tsx` (`changeHomeTheme`) |
| `dictionary:web:<lemma>:en-vi` | `src/lookup/webDictionary.ts` TTL cache (30 d hit / 6 h miss / 5 min failure) |

Onboarding state (`src/onboarding/store.ts`) also lives in `settings`. API keys are never logged,
and the browser secret vault is not available in this PWA.

`reader-preferences` includes `lookupViewMode` (`quick` / `full`, default `quick`) alongside
`languageMode`. App saves the reader's Quick/Show more choice and restores it for subsequent
lookups, including after reload. Missing or invalid view values normalize to Quick. This is an
additive field in the existing settings value; table indexes and the database version are unchanged.

## Backup and restore

`src/storage/backup.ts` — schema `context-lens.backup`, discriminated union on `version`:
v1 documents + vocabulary; v2 adds notes; v3 same shape with a new version; v4 adds `collections`.
Each document, collection, and note is validated with Zod, and `location` is a discriminated union
over `text` / `pdf` / `epub`. Export excludes API keys, AI cache rows, and original binary book
files; it includes documents, vocabulary, source metadata, collections (including empty ones), and
notes. Restore accepts v1–v4 and is surfaced by `DataManagement` (`src/storage/DataManagement.tsx`),
which also reports usage/quota/persisted status and triggers cache cleanup.

## Vocabulary and English101

- `src/vocabulary/store.ts` — `saveVocabulary` (reuses the record id for identical lemma/sentence
  saves), `removeVocabulary`, `isVocabularySaved`, `collectionTitle` (derived from the document
  name, so saving does not open a modal).
- `src/vocabulary/contract.ts` — the `english101.context-vocabulary` contract, v1 and v2.
- `src/vocabulary/export.ts` — `buildEnglish101Export` (V2, with collections and context),
  `buildEnglish101ExportV1` for older consumers, and `vocabularyCsv`.
- **English101 sync is not implemented.** The integration is a manual file handoff: export the V2
  JSON, then import it in the separate English101 app. Future sync must adapt this export payload
  rather than read Context Lens IndexedDB directly.

## Invariants

1. Schema changes append a new Dexie version; existing versions are immutable.
2. Cache correctness is version-driven: bump the version constant when a payload shape changes.
3. API keys live in `sessionStorage` by default and in IndexedDB only on explicit opt-in; they are
   never included in a backup and never logged.
4. The backup format is append-only by version and validated with Zod before writing.
5. Document deletion removes documents, notes, and OCR rows in one transaction.
6. Under storage pressure, caches are evicted before user data.
7. English101 interaction stays behind the versioned export contract.

## Important files

`src/db/database.ts`, `src/core/cache.ts`, `src/lookup/cache.ts`, `src/lookup/cacheRepository.ts`,
`src/storage/backup.ts`, `src/storage/storageService.ts`, `src/storage/DataManagement.tsx`,
`src/settings/store.ts`, `src/settings/engines.ts`, `src/onboarding/store.ts`,
`src/documents/pdf/ocrStore.ts`, `src/lookup/webDictionary.ts`, `src/lookup/learnedLexicon.ts`,
`src/ai/usage.ts`, `src/vocabulary/store.ts`, `src/vocabulary/export.ts`,
`src/vocabulary/contract.ts`, `src/notes/store.ts`.
