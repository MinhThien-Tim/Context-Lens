# Local dictionary pipeline

Context Lens resolves reading selections without an API or network translation:

`Selection → normalization → evidence-based reconstruction → lemma/phrase candidates → WordNet + EN–VI + phrase merge → local caches → UI`

Normalization preserves the displayed surface form while applying NFC, apostrophe and dash normalization, whitespace collapse, and lower-casing to the lookup key. Candidate generation is bounded. It checks the exact form first, then morphology, hyphen/space variants, dictionary-backed glued-token splits, longest phrase suffixes, and the lexical head.

PDF fragments are expanded only when adjacent sentence text proves the selection belongs to a larger token. An unproved selection remains `fragment-or-unknown`; no definition is invented.

English and Vietnamese fields are merged independently. Curated exact phrase senses take priority for English, followed by WordNet and seed data. Vietnamese prefers the bundled/installed EN–VI pack, then phrase and seed data. A missing field produces a partial result rather than discarding the other field.

Sentence analysis and existing lookup caches remain local in IndexedDB. Online translation is an optional extension point and is not required by this pipeline.

Quick and Explain consume the same merged local result. Context explanations only replace fields they actually provide, preserving local English, Vietnamese, grammar, and sentence translation fields.

Merged lexemes are stored in the versioned `learnedLexicon` IndexedDB table. Its version includes the curated lexicon, installed dictionary packs, and WordNet, preventing reuse after a source changes.

Run `npm run audit:dictionary` to pass an 800-entry corpus through `LookupService` and verify expected lemmas and meaning content. An additional reviewed JSON-lines corpus can be supplied after `--`.

When browser, public, gateway, and managed translation are all disabled, local misses return directly without invoking the translation router.

## EN–VI source trust

Runtime merge order is `reviewed → curated → imported`. A pack marked `reviewed` is rejected unless every entry records its source URL and revision, license, retrieval time, reviewer, review time, and `human-reviewed` status. Legacy packs remain loadable as `imported`; the bundled Skypedia-derived pack is explicitly `curated` and retains its release attribution.

Unreviewed translation candidates are quarantined in `data/dictionary/en-vi-candidates.jsonl`; that file is not a runtime asset or installable pack. Decisions are recorded separately in `data/dictionary/en-vi-review-decisions.jsonl`. An AI-assisted editorial review is identified as such in `reviewerKind`; it must never be represented as human review.

Reviewed additions are sense-aligned: each Vietnamese meaning carries its Wiktionary/Kaikki sense ID, source revision, URL, license, reviewer identity/type, and review timestamp. Run `npm run pack:en-vi-reviewed` to reproduce the bundled reviewed pack. AI-assisted entries are usable offline now and explicitly retain `reviewerKind: ai-assisted` for later human replacement. `counterargument` provisionally uses `lập luận phản biện`; the attested `phản chứng` was rejected as the general default because the source marks it literary/rare.

Run `npm run audit:en-vi-gaps` to compare WordNet lemmas with the bundled EN–VI pack and produce a prioritized review queue. This coverage audit does not claim semantic correctness; accepted additions must enter a reviewed pack and are then checked by the production-pipeline audit.
