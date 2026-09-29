# Runtime manifest and config contract

## TASK

Clarify the two runtime configuration surfaces without changing behavior. Add a compact active `docs/runtime-manifests.md` that directs maintainers to the authoritative files and explains generated artifacts, offline behavior, and deployment switches. Do not create or maintain a separate `manifest.webmanifest`.

## AFFECTED SUBSYSTEM

PWA build/offline shell and optional Cloudflare Worker deployment. This is a documentation task; Task 2 owns any automated architecture-contract additions.

## CURRENT STATE / ROOT CAUSE

The contract is correct but scattered across `vite.config.ts`, `gateway/wrangler.jsonc`, `gateway/README.md`, `docs/ARCHITECTURE.md`, `docs/testing.md`, and environment examples. A maintainer could mistake generated PWA output for an editable source or confuse the public build flag with the Worker kill switch.

| Concern | Source of truth | Generated output / effect |
| --- | --- | --- |
| Browser install manifest, icons, share target, app identity | `VitePWA({ manifest, includeAssets })` in `vite.config.ts`; icon files and `index.html` provide referenced assets/HTML metadata | VitePWA emits the web manifest and injects its link during production build; `dist/` is ignored build output |
| Service worker and update policy | `VitePWA({ registerType: 'prompt', workbox })` in `vite.config.ts`; `src/main.tsx` handles update-ready/apply-update events | Generated `dist/sw.js` and related registration/build assets; update applies only through the app's explicit Reload action |
| Precache | `workbox.globPatterns`, `globIgnores`, size ceiling in `vite.config.ts` | App shell, CSS, icons, bundled EN–VI dictionary and WordNet assets are precached; heavy reader JS and `/ocr/` assets are excluded |
| Runtime static cache | `workbox.runtimeCaching` in `vite.config.ts` | Same-origin `/ocr/` and `/assets/*.{js,mjs}` use bounded 30-day CacheFirst caches (12 entries each); lazy reader chunks can be fetched/cached on demand, so a first offline use of an unfetched reader dependency is not guaranteed |
| Lazy chunks | `build.rollupOptions.output.manualChunks` in `vite.config.ts`, with lazy imports in reader/import code | Named PDF, OCR, EPUB, DOCX, and archive chunks; generated filenames are hashed and must not be hand maintained. Local-language is also a named chunk but is not in the heavy-reader exclusion list |
| Worker/static routing | `gateway/wrangler.jsonc` and `gateway/src/index.ts` | Worker serves `../dist` assets; only `/api/*` runs Worker first. The code serves non-API requests through `ASSETS`, allows only `POST /api/translate`, and returns 404 for other API paths |
| Quota binding and kill switch | `gateway/wrangler.jsonc` plus `gateway/src/index.ts` | `QUOTA` binds SQLite Durable Object class `TranslationGate` (migration `v1`); code uses stable ID `global-pilot-v1`. `ONLINE_ENABLED` defaults to string `"false"`; a missing/short `IP_HASH_SECRET` also disables translation |
| Build flag and secrets | `.env.example`, `.env.pilot`, `.gitignore`, `gateway/README.md` | `VITE_MANAGED_TRANSLATION=false` is the standalone default example; `.env.pilot` sets it true for a pilot build, but does not enable the Worker. `VITE_` values are public build-time config. `IP_HASH_SECRET` belongs in Wrangler secrets or ignored local `.dev.vars`, never in `VITE_` or committed files. `.env*` is ignored except explicit examples and `.env.pilot`; `dist`, `.wrangler`, and local secrets are ignored |

The PWA service worker supports the static/offline reader, while stored documents and local lookup data determine what is actually available offline (`docs/ui-system.md`, `docs/data-storage.md`, `docs/translation-pipeline.md`). Optional network translation remains opt-in and subject to local/cache-first behavior and the Worker gate. `COST & QUOTA GUARDRAILS.md` remains binding. Do not describe precache as a guarantee that every imported document or never-loaded heavy reader path is offline-ready.

## LIKELY FILES

- Add `docs/runtime-manifests.md` with the compact ownership map above, generated-output warning, offline limitation, build flag versus Worker switch/secrets, and links to the authoritative config, gateway README, testing docs, and guardrails.
- Add one discoverability link in `docs/ARCHITECTURE.md` under supporting references or task routing. This is navigation only; no architecture behavior changes.
- No config edit is required. Optional tiny comments in `vite.config.ts` and `gateway/wrangler.jsonc` are acceptable only if they remove a concrete ambiguity found during implementation; avoid renaming keys or moving config.
- Task 2, if independently scoped, may edit `scripts/check_architecture_contracts.mjs` and/or `scripts/check_bundle_budget.mjs` and its verification docs. This task should not duplicate those checks.

## ARCHITECTURAL INVARIANTS

- One PWA manifest source in `vite.config.ts`; generated `dist` output is never edited or committed.
- Keep heavy reader chunks lazy and outside precache; retain explicit prompt-based updates and local/static operation.
- Static assets do not execute Worker API logic; `run_worker_first` stays restricted to `/api/*`; all unsupported API routes fail closed.
- Keep `QUOTA` / `TranslationGate` binding and stable object identity; `ONLINE_ENABLED=false` by default; secrets remain private; no new service, route, quota, cache behavior, or network enablement.

## IMPLEMENTATION PLAN

1. Write the concise active document as an ownership and change-location guide, referring to config/code for exact values instead of copying large config blocks.
2. Link it from the architecture map. Keep `gateway/README.md` as the detailed deployment/protocol authority and `docs/testing.md` as the verification-command authority.
3. Record Task 2 handoff: existing static contracts already assert one VitePWA options object, prompt updates, heavy-chunk ignore patterns, `/api/*` Worker-first routing, `ONLINE_ENABLED=false`, and build-check hooks. The production build check already asserts emitted heavy chunks stay out of precache and required icons/dictionary/WordNet payloads are included. Candidate additional machine checks, if Task 2 needs them: manifest `id/scope/start_url` and share-target shape; Workbox navigation fallback and bounded same-origin runtime cache patterns; Wrangler `assets.directory`, `main`, `QUOTA` binding/class/migration and absence of extra bindings; public env default separation. Favor parsed config or generated-output assertions over matching prose. Do not freeze incidental descriptions, hashed filenames, or provider ordering in this documentation task.

## ACCEPTANCE CRITERIA

- A maintainer can identify where to edit the browser manifest, service-worker policy, Worker routing/binding, public build flag, kill switch, and secret without treating generated files as source.
- The document states which static resources are precached, which heavy dependencies are lazy, and the offline limitation for a never-fetched lazy chunk.
- The document does not imply `.env.pilot` enables the server or that a `VITE_` variable is secret.
- Existing runtime/deployment semantics, cache strategy, quota, and cost guardrails remain unchanged.
- Task 2 contract-check candidates and already-covered invariants are explicit, without implementing checks here.

## TESTS REQUIRED

For the planned documentation-only implementation: inspect the new document and links, check `git diff --check`, and confirm no production/config change; application tests are **NOT RUN** as disproportionate per `docs/testing.md`. If an optional config comment is added, the same checks suffice. If Task 2 adds contract assertions separately, run `npm.cmd run verify:contracts`; for emitted-manifest/precache assertions, use the production build gate (`npm.cmd run build`) and escalate only as required by `docs/testing.md`.

## OUT OF SCOPE

Hand-maintained web manifest, config relocation, deployment, network feature changes, Cloudflare services, quota changes, cache-strategy changes, and correction of the separately documented managed-Worker provider-priority discrepancy.
