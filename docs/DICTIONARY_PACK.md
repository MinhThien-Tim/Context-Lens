# Context Lens dictionary packs

The released 104,738-entry English–Vietnamese pack is included as a separate JSON asset and precached by the production service worker. It is loaded automatically, without manual installation. Additional dictionary packs can be installed from **Data & storage** and are stored in IndexedDB. Installed packs override the bundled fallback.

```json
{
  "schema": "context-lens.dictionary-pack",
  "version": 1,
  "id": "publisher.en-vi",
  "name": "English–Vietnamese learner pack",
  "packVersion": "2026.1",
  "license": {
    "name": "CC BY-SA 4.0",
    "url": "https://creativecommons.org/licenses/by-sa/4.0/",
    "attribution": "Required attribution for the dataset and its upstream sources."
  },
  "entries": [
    {
      "lemma": "maintain",
      "partOfSpeech": "verb",
      "ipa": "/meɪnˈteɪn/",
      "definitionEn": "to keep something at the same level or condition",
      "meaningsVi": ["duy trì", "giữ vững"]
    }
  ]
}
```

Limits and validation:

- JSON files must be 25 MB or smaller.
- Packs must contain 1–200,000 entries.
- License name, URL, and attribution are required.
- HTML is not accepted in lexical fields.
- Installed packs override the built-in seed dictionary and can be removed independently.

## Production release

Build the production English-Vietnamese pack from the Skypedia SQLite source with `npm run pack:dictionary` after placing `dictionary_en_vi.db` and its `ATTRIBUTION.md` in `tmp/dictionary-source/`. The command writes the installable compact JSON, complete attribution, release manifest, and SHA-256 checksum to `release/dictionary/`.

Publish all four release files together, preserve `ATTRIBUTION.md`, verify the checksum before and after upload, and keep the derived data under CC BY-SA 4.0. `definitionEn` is intentionally empty because the licensed source supplies Vietnamese definitions rather than English glosses.

The bundled JSON is derived from the Skypedia English–Vietnamese dictionary under CC BY-SA 4.0. The original SQLite database is not shipped. The build includes the full attribution file, linked from **Data & storage**, alongside the derived JSON. Both assets are available offline after service-worker installation.

## Source-preserving format v2

The bundled Skypedia release `2026.09.3` uses format version 2. Version 1 imports remain supported.
`meaningsVi` retains all source glosses, without a fixed gloss-count cap. `viSenses` stores compact
`[definitionId, sourcePos, glossIndex, optionalExample]` tuples; the lemma belongs to the containing
entry and source attribution/revision belongs to the pack. No English definition is invented.
Gloss indices are validated and remapped when local Vietnamese redirects expand. Examples are
bounded to 160 characters and at most one example per polysemous entry; they are supporting metadata.
The generated artifact is 23,573,348 bytes (22.48 MiB), below the 25 MiB installer budget.
The manifest and SHA256SUMS identify the new artifact. Rebuild with the existing `pack:dictionary`
command; its default release version is now `2026.09.3`.

WordNet format 2 retains verb frames as `[frameNumber, wordNumber]` tuples on stable synsets.
Word number 0 applies to all lemmas; loading filters lemma-specific frames. Pointers remain omitted.
Lexical cache version `local-lexicon-10`, WordNet format identity, and sentence analysis version 3
invalidate stale derived records without a Dexie schema migration.

Stable bilingual alignment version `bilingual-alignment-4` can consume these source examples
and WordNet frames as weak supporting evidence, alongside independent bilingual
lexical anchors and matching POS. Reader sentences never update permanent EN–VI pairs.
Unresolved source glosses remain available; provider definition translations retain their
dependent display-only provenance. Pack format and source tuples are unchanged.

The service-worker per-asset precache limit is 25 MiB, matching the installer budget, so the
22.48 MiB source-preserving release is included in offline precache.

The separate `context-lens-sense-metadata-reviewed.json` pilot is a small, bundled delta asset.
It contains stable WordNet IDs, selected Skypedia source sense IDs, reviewed collocations,
stable grammar patterns, and sparse domains. It is imported into the local language chunk,
so lookup adds no request. Source definitions, existing WordNet examples and dictionary tuples
stay in their original packs. A reviewed source-ID link is applied only when the exact bundled
Skypedia sense exists with matching POS; explicit pairs have priority, and unused Vietnamese
source meanings remain available. The overlay records AI-assisted review provenance, not
source-explicit provenance.

Disjoint WordNet frames and mismatching extracted examples are neutral because usage metadata is incomplete. Only clearly contradictory explicit controlled grammar patterns reject an alignment candidate.
