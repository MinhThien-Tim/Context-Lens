# T6 — Prototype-key safety audit (targeted dynamic keys)

- **Date:** 2026-10-02
- **Role:** Investigator (read-only)
- **Status:** Complete — report only, no code changed
- **Scope:** user-derived dynamic keys written into maps/objects under `src/`
- **Out of scope:** refactoring any structure classified safe; unrelated subsystems

## Method

Bounded structural searches only, anchored on declaration form and assignment shape:

| Search | Purpose |
| --- | --- |
| `Record<string` declarations | find every string-keyed object type in the codebase |
| `= {}` initialisations | find plain-object sinks that can receive dynamic keys |
| computed-key object literals `{...x, [k]: v}` | check whether keys become **own** properties |
| identifier-anchored index writes | find `obj[key] = value` where `key` is a variable |
| `Map<` declarations | confirm the safe-sink baseline |
| `Object.keys` / `for..in` | confirm key sets are enumerated statically, not inherited |

Deliberately **not** used: a generic `\[.*\]\s*=` grep. That pattern matches every indexed read in the
repository, produced a ~280 KB result set, and drove the Terminal Loop Guard breach documented in
[Terminal Loop Guard note](#terminal-loop-guard-note--prevention-added).

### Why the three named keys behave differently

| Key | Inherited from `Object.prototype` as | `obj[key] = v` result |
| --- | --- | --- |
| `__proto__` | accessor (getter/setter) | **invokes the setter** → replaces `obj`'s prototype; the own property is silently lost |
| `constructor` | data property (`Object`) | creates a normal own property (write is safe) |
| `toString`, `valueOf`, `hasOwnProperty` | data property (function) | creates a normal own property (write is safe) |

So `__proto__` is the write-side hazard; `constructor` / `toString` / `valueOf` are **read-side**
hazards — they need no write at all. An unguarded read returns a truthy built-in, which defeats any
`?? fallback` / `|| 0` guard. The dictionary subsystem guards reads; the EPUB path does not.

Safe-by-construction forms confirmed present in the codebase:

- `Object.fromEntries(...)` → `CreateDataPropertyOrThrow`, defines an own property even for `__proto__`.
- Computed-key literal `{ ...value, [key]: next }` → own property via `CreateDataPropertyOrThrow`.
- `new Map()` / `.get` / `.set` → no prototype chain, no key coercion.
- `Object.hasOwn(t, k) ? t[k] : undefined` → the reference guard in this repository.

## Safety inventory

### Map / safe

| Structure | Location |
| --- | --- |
| `packs` — `Map<string, WordNetPack>` | `src/core/language/wordnet.ts:9` |
| `EngineCache.memory` | `src/core/cache.ts` |
| `InstalledDictionaryPack.entries`, `InstalledDictionaryPack.reverseHits` | `src/lookup/dictionary/packs.ts` |
| `alignmentCache`, `anchorEntries`, `anchorGlosses` | `src/lookup/dictionary/alignment.ts` |
| `learned` | `src/core/language/lexicon.ts` |
| `visited` (`Set`) in `resolveVietnamese` | `src/lookup/dictionary/packs.ts:112` |

### Safe own-property helper

| Structure | Location | Guard |
| --- | --- | --- |
| `irregularLemmas`, `irregularWordOverlaps`, `entries` | `src/lookup/dictionary/seedDictionary.ts:103,129,132` | `own<T>()` via `Object.hasOwn` (`seedDictionary.ts:8`), with a comment at line 4 naming the `table[key] ?? fallback` / `constructor` hazard |
| `pack.entries[lemma]` | `src/core/language/wordnet.ts:40` | `Object.hasOwn(pack.entries, lemma) ? pack.entries[lemma] : []` |

This pair is the in-repo reference pattern and is what the finding below should be brought up to.

### Static / non-user-controlled key

| Structure | Location | Key provenance |
| --- | --- | --- |
| `posNames` | `wordnet.ts:37`, `src/lookup/localLexeme.ts:10` | object-literal literal keys |
| `counters` | `src/core/diagnostics.ts:5,14,45` | members of a literal `DiagnosticEvent[]`; initialised via `Object.fromEntries(names.map(...))` |
| `fields.map(key => [key, fieldSchemas[key]])` | `src/core/context/schema.ts:50` | static task-field list |
| `tokenClauses[i]` | `src/core/language/grammar.ts:44` | array index |
| `next[n]` — `Record<number, PdfPageSize>` | `src/reader/pdf/PdfViewer.tsx:105` | numeric page index |
| `sizes` in `PdfViewer.tsx:24` | `Object.keys(sizes).length` | numeric index space |
| `occurrences` | `src/lookup/audit-raw.diagnostic.test.ts:109` | array |
| `{...value, [key]: next}` | `src/components/ReaderSettings.tsx:12,20`, `EngineSettingsForm.tsx:10` | `keyof T` keys on a fresh spread object |
| `{...documentRecord.pdfTextSources, [page]: source}` | `src/app/App.tsx:608` | numeric page index; Dexie type is `Record<number, 'pdf' \| 'ocr'>` (`src/db/database.ts:29`) |
| `Object.keys(...)` enumerations | `LookupBottomSheet.tsx:67,104`, `ReaderSettings.tsx:11,25`, `service.ts:54`, `database.ts:305`, `schema.ts:19,51`, `reviewedSenseMetadata.test.ts:71` | all keys originate from a statically-known object |

No `for (… in …)` loop exists anywhere in `src/` — every enumeration is `Object.keys` over a
statically-shaped object, so no inherited key can enter a write path that way.

### Plain object with an unsafe dynamic key — **1 finding**

`src/documents/import/fileImport.ts:124-128`:

```ts
const anchors: Record<string, number> = {};
…
for (const element of body?.querySelectorAll('[id]') ?? []) {
  const range = chapterDocument.createRange(); range.selectNodeContents(body!); range.setEndBefore(element);
  anchors[element.id] = range.toString().length;   // line 128
}
```

`element.id` comes from `[id]` attributes in an **untrusted, user-supplied EPUB** and is therefore
fully attacker-controlled. This is the only place in `src/` where a raw document-supplied string is
used as a computed **assignment** key on a plain object.

**Unsafe writes**

- `id="__proto__"` → `anchors['__proto__'] = <number>`. Because `__proto__` is an inherited
  accessor on `Object.prototype`, the assignment invokes its setter and mutates `anchors`' own
  prototype. The write value is a `number`, so the common case is a primitive that the setter
  ignores — but the offset is still **silently lost**, and `anchors.__proto__` then reads
  `Object.prototype` instead of the intended character offset.

**Unsafe read — the higher-severity path**

`src/documents/sections.ts:76` consumes the same map with **no** own-property guard:

```ts
offset: chapter ? chapter.offset + (chapter.anchors[hash] ?? 0) : undefined
```

`hash` is the fragment of an EPUB `nav`/`NCX` `href` — also attacker-controlled, but it needs **no
write at all** here: `constructor`, `toString`, `valueOf`, `isPrototypeOf` etc. resolve to inherited
`Object.prototype` members. Each is truthy, so `?? 0` does not fire, and `chapter.offset + <Object
constructor>` coerces to a garbage string offset (`"…NaN"` or string concatenation) that is stored
on the `DocumentSection` and used for reader scroll positioning. `epubHeadingSections` (lines 85, 91)
reads the same shape but only via heading offsets, so it inherits the write-side loss, not the read-side
hazard.

Note the asymmetry: the dictionary subsystem — which also handles arbitrary lookup strings —
guards every such read with `Object.hasOwn`. The document-import path does not.

**Persistence:** none. `anchors` is derived per import and lives only on the in-memory
`chapterMap`; it is not written to Dexie and does not reach `pdfTextSources` or any other persisted
record. Impact is confined to a single import session.

**Recommended remediation — REPORTED ONLY, NOT APPLIED** (task constraint: report actual remaining
risk, do not refactor):

1. `Object.create(null)` instead of `{}` at `fileImport.ts:124`, or
2. an `Object.hasOwn(anchors, hash)` guard at `sections.ts:76` mirroring
   `seedDictionary.ts`'s `own<T>()` helper.

Either closes both the write-side (`__proto__`) and read-side (`constructor`) variants. Option 1
requires touching the `Record<string, number>` type contract at the three `chapterMap` sites
(`fileImport.ts:113,142`, `sections.ts:75,86`); option 2 is the smaller diff.

## Result

| Class | Count |
| --- | --- |
| `Map` / safe | 6 structures |
| Safe own-property helper | 2 structures |
| Static / non-user-controlled key | 10 structures |
| **Plain object with unsafe dynamic key** | **1 structure** ([fileImport.ts:124](C:/Users/Admin/Downloads/Context%20Lens/src/documents/import/fileImport.ts:124)) |

`constructor`, `prototype` and `__proto__` were all checked. No structure anywhere in `src/` is keyed
by a raw user string via plain-object assignment other than `anchors`. The dictionary and WordNet
subsystems — the highest-exposure key-input surfaces — are fully guarded.

## Verification

| Check | Result |
| --- | --- |
| Structural greps over `src/` (`Record<string`, `= {}`, computed-key literals, identifier-anchored index writes, `Map<`, `for..in`) | PASS |
| Targeted read of every site in the inventory | PASS |
| `prototype` as a key | PASS — no occurrence; only `Object.getPrototypeOf`-free plain prototypes are used |
| Code change / data change | NOT RUN — by design, read-only investigation |

## Terminal Loop Guard note — prevention added

An earlier pass in this task re-ran the same over-broad `\[.*\].*=` search eight times with reordered
parameters. That is a retry, not new information, and is a guard breach: the pattern was too broad
(it matches every indexed read), the result set was ~280 KB, and the tool auto-offloaded it to a temp
file so no useful signal was returned. Classified once; resolved by one safe fallback (the bounded
structural greps tabulated in §Method) and no further retries.

The gap that allowed it — the guard covered command *execution* but not *search-result overflow* — has
since been closed at the canonical level:

- [`agent-execution-rules.md` §7 → Search and output overflow](../agent-execution-rules.md#search-and-output-overflow)
  — new normative rule: never re-run a truncated/offloaded search, change the query *shape* instead,
  and treat a zero-match result as an answer rather than a failure.
- [`testing-troubleshooting.md` → Search result overflow or truncated tool output](../testing-troubleshooting.md#search-result-overflow-or-truncated-tool-output)
  — symptom-to-fix table mapping over-broad patterns to their bounded structural equivalents.
- [`agent-roles/investigator.md`](../agent-roles/investigator.md#terminal-loop-guard) — role-level
  pointer so the rule applies to read-only diagnostic work, which is where this occurred.

---

Related: [`2026-10-02-dictionary-audit-history-ci.md`](./2026-10-02-dictionary-audit-history-ci.md) ·
[`2026-10-02-dictionary-audit-failure-classification.md`](./2026-10-02-dictionary-audit-failure-classification.md)