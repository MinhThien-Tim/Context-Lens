# Context Lens dictionary packs

Dictionary packs are optional JSON files installed from **Data & storage**. They are stored in IndexedDB and never added to the initial application bundle.

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

Potential data source: the Skypedia English–Vietnamese dictionary is published under CC BY-SA 4.0 and documents its upstream attribution. It is intentionally not bundled because the SQLite database is approximately 42 MB and needs a separate build/distribution process that preserves attribution and share-alike requirements.
