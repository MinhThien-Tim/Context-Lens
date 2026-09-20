# Local-first language engine: Phases 1–15

The engine is now connected to normal reader selections through `LookupService`.
EN/VI mode switches only change presentation. They do not repeat analysis or API calls.

| Phase | Delivered |
| --- | --- |
| 1 | Repository audit; reader, import, existing cache and provider infrastructure reused |
| 2–5 | Common types, shared EN/VI lexical layer, morphology, tokenizer, phrase normalization and detection |
| 6–8 | Sentence boundaries, Dexie sentence cache, deterministic sense ranking, LocalLanguageEngine |
| 9 | Local-first LookupService orchestration, progressive callback, compatibility adapter |
| 10 | Existing ready-model browser translator integrated for fallback and explicit sentence translation |
| 11 | Existing deadlines, shared requests, cancellation and pair/provider backoff retained; Auto priority now local before browser/network |
| 12 | ContextRouter uses local senses; normal selections never invoke AI; local context setting excludes network AI |
| 13 | EN/VI/EN+VI, local Context/Grammar, separate AI Explain and sentence translation, source/confidence/evidence, responsive action grid |
| 14 | Full compact WordNet 3.0 EN/EN distribution, EN/VI pack reuse, PWA precache, license, checksums and build script |
| 15 | Regression, pack integrity, offline, cache, migration, performance and desktop/mobile-width browser checks |

The public entry point is `src/core/language/index.ts`. Create one
`LocalLanguageEngine` per reading session and call:

```ts
const result = await engine.analyzeSelection({
  selectedText: 'accounts for',
  sentence: 'The sector accounts for 45% of total employment.',
  sourceLang: 'en',
  targetLang: 'vi'
});
```

`LensResult` carries both English and Vietnamese layers, the chosen sense,
alternatives, confidence, evidence, phrase metadata, and local/cache provenance.
It does not call translation providers or AI. Non-English input returns an empty,
zero-confidence result. Unknown words are likewise explicit misses.

## Architecture

- `types.ts`: lexical senses, phrases, tokens, sentence analysis, selection input,
  and LensResult. Re-exports the existing TranslationResult contract.
- `lexicon.ts`: original small bilingual sense pack and an adapter to the existing
  dictionary registry, including installed packs. Deterministic morphology and
  offset-preserving tokenization. Legacy entries retain their combined definition
  as one sense; unavailable English definitions are not fabricated.
- `wordnet.ts`: four compact POS packs preserving 117,659 synsets with definitions,
  synonyms, examples and sense order. Pack loading is deduplicated and failures
  preserve curated/installed results. `scripts/build_wordnet_pack.py` reads the
  official archive without extracting or executing its contents. `release/wordnet`
  contains the generated assets, license and SHA-256 manifest.
- `phrases.ts`: possessive and verb normalization, optional “own,” and longest
  matching known expressions. Matches cannot cross punctuation. Phrase data is
  injectable; maximum matching length derives from that data.
- `sentence-engine.ts`: lazy token/lemma/phrase analysis, minimal discourse context,
  in-flight deduplication, and SentenceAnalysisCache. Reuses the reader's existing
  sentence segmentation through the new `buildSentenceIndex` export.
- `sense-resolver.ts`: percentage/cause phrase rules, collocation signals, lexical
  overlap, optional POS evidence, frequency tie-breaking, and confidence margins.
- `local-language-engine.ts`: sentence analysis first, containing phrase before
  word lookup, then sense ranking and normalized result construction. Supply
  `selectionStart` for repeated occurrences; ambiguous offsets do not expand a
  word into a phrase elsewhere in the sentence.
- `adapter.ts`: adapts normalized LensResult to the established LookupResponse
  contract for UI, vocabulary and export compatibility. The UI has no raw provider
  responses. LensResult remains attached for confidence, evidence and sense metadata.

## Persistence and compatibility

Dexie version 9 adds `sentenceAnalyses` to the existing database. No prior tables
or records are rewritten. The existing EngineCache provides a 128-entry memory
limit, a default 1,000-record disk limit, access tracking, cloning, and graceful
storage failure handling. Keys preserve case and punctuation and include source
language, analysis version, lexical configuration, dictionary versions, and phrase
data. Target language and selected word are deliberately absent from sentence
identity. Normalized sentence text is the coordinate system for cached tokens.

Cache clearing, storage counts, and storage pressure cleanup include the new table.
Sentence cache can be disabled independently in engine settings. Explicit EN/VI
sentence translations are saved into the analysis as well as TranslationCache.
No sentence translation is fabricated from dictionary fragments. Local English
simplification currently covers the conservative “notwithstanding” → “despite” rule.

## Routing and offline behavior

Normal selection: immediate legacy preview → LocalLanguageEngine (sentence cache
first) → local result callback → stop if sufficient → TranslationRouter only if
needed. TranslationRouter checks memory/Dexie, then dictionary/saved vocabulary,
ready browser models, then enabled external providers in Auto mode. Explicit
provider preferences still work. Sentence-aware local results never enter the
context-free translation cache, preventing cross-sentence sense contamination.

Context and Grammar only reveal local information. AI Explain and the AI task
menu are explicit requests; context cache and local fallback remain available.
Browser model downloads require the settings preparation button. Selecting text
does not download models or send full documents. Translate sentence sends only
the containing sentence to the enabled translation route.

The app shell and both dictionary families are precached in production. WordNet
adds 17,659,669 bytes before transport compression. First installation/loading must
complete online before the PWA can provide these assets offline. A pack-status and
retry control appears in engine settings. No server, API key or ML runtime is
required for lexical reading. Real browser-model availability depends on the
browser and downloaded language pair; browser-provider tests use a mocked API.

Source: [Princeton WordNet 3.0](https://wordnetcode.princeton.edu/3.0/).
The included WordNet license must accompany redistributed packs.

To rebuild from downloaded source and license:

```powershell
python scripts/build_wordnet_pack.py --source tmp/wordnet-3.0.tar.gz --license tmp/WORDNET-LICENSE.txt
```

## Verification and limitations

118 tests across 34 files passed, along with TypeScript, production build and
bundle-budget checks. No standalone lint tool is configured. Chrome UI verification
covered percentage senses, WordNet “happened,” EN switching and local context;
390×844 viewport inspection found and fixed action-row horizontal overflow.
Tests cover sentence translation reuse, cache opt-out, unavailable persistence,
offline packs, migration, cancellation, quota and fallback. No live paid API calls
were needed. Physical Android/iOS and actual on-device model downloads were not
tested in this workspace.

Measured with all packs loaded in jsdom, 100 warm service calls: p50 6.51 ms,
p95 30.18 ms. Curated local engine: p50 2.83 ms, p95 14.52 ms. These are test-host
measurements, not cold-load or physical-device guarantees.

The curated bilingual sense pack is deliberately small. WordNet broadens English
coverage substantially, but the Vietnamese pack is not mapped to WordNet synsets.
Unaligned Vietnamese meanings are labeled “Vietnamese dictionary meanings” and
are not presented as the selected English sense's translation. Phrase recognition
covers curated and dictionary expressions and simple contiguous
variants, not arbitrary separable verbs. POS is dictionary-derived, confidence is
heuristic, and neighboring discourse is identified but not semantically resolved.
Contextual definitions use the selected dictionary sense. Full offline sentence
translation requires a ready browser model; no neural translation model is bundled.
Embeddings, broad paraphrasing, advanced dependency parsing, neural disambiguation,
and large local models remain intentionally excluded as specified in the brief.
Next improvements are sense-aligned bilingual data, broader phrase variants,
optional POS-aware ranking, and physical-device cold-load profiling.

No new runtime dependencies. Existing reader imports, documents, vocabulary,
notes, extension handoff and API key storage remain intact.
