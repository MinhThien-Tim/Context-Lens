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
