# Runtime manifests and configuration

Context Lens has two runtime configuration surfaces. Edit the source files below, then rebuild; generated files under `dist/` are ignored output, not configuration. In particular, do not add a hand-maintained `manifest.webmanifest` beside the VitePWA manifest.

| Change | Authoritative source | Result |
| --- | --- | --- |
| Browser app identity, icons, install scope, share target | `VitePWA({ manifest, includeAssets })` in [`vite.config.ts`](../vite.config.ts); referenced icon files and [`index.html`](../index.html) | VitePWA emits the web manifest and injects its link into built HTML. |
| Service worker, update prompt, precache and runtime caching | `VitePWA({ registerType, workbox })` in [`vite.config.ts`](../vite.config.ts); update event wiring in [`src/main.tsx`](../src/main.tsx) | Build emits `dist/sw.js` and registration assets. An update is applied through the app's explicit Reload control. |
| Lazy reader chunks | `build.rollupOptions.output.manualChunks` in [`vite.config.ts`](../vite.config.ts), together with lazy imports in reader/import code | Build emits hashed PDF, OCR, EPUB, DOCX and archive chunks. Local-language is also a named chunk. Do not refer to hashed filenames as stable inputs. |
| Static assets and Worker API routing | [`gateway/wrangler.jsonc`](../gateway/wrangler.jsonc) and [`gateway/src/index.ts`](../gateway/src/index.ts) | Cloudflare Assets serves `../dist`; only `/api/*` runs Worker first. The Worker passes non-API requests to `ASSETS`, accepts only `POST /api/translate`, and returns 404 for other API paths. |
| Quota gate and server kill switch | [`gateway/wrangler.jsonc`](../gateway/wrangler.jsonc) and [`gateway/src/index.ts`](../gateway/src/index.ts) | `QUOTA` binds the SQLite Durable Object class `TranslationGate` (migration `v1`), using stable object ID `global-pilot-v1`. `ONLINE_ENABLED` defaults to string `"false"`. |
| Public build flag and private secret | [`.env.example`](../.env.example), [`.env.pilot`](../.env.pilot), [`.gitignore`](../.gitignore), and [`gateway/README.md`](../gateway/README.md) | `VITE_MANAGED_TRANSLATION=false` is the standalone example; `.env.pilot` sets it true for a pilot build. `VITE_` values are public build-time configuration. `IP_HASH_SECRET` belongs in a Wrangler secret or ignored local `.dev.vars`, never in a `VITE_` variable or committed file. |

## Offline and deployment boundary

Workbox precaches the app shell, JavaScript/CSS, icons and other matched static assets, including the bundled EN–VI dictionary and WordNet payloads. Its navigation fallback is `/index.html`. Heavy PDF, OCR, EPUB, DOCX and archive chunks, plus `/ocr/` assets, are excluded from precache. Same-origin `/ocr/` assets and `/assets/*.js` or `.mjs` use separate bounded CacheFirst runtime caches (12 entries, 30 days). A lazy reader dependency can be cached after it is fetched, but its first use while offline is not guaranteed. Stored document data determines whether an imported document is available offline; the service worker does not store every imported document. See [`ui-system.md`](ui-system.md), [`data-storage.md`](data-storage.md), and [`translation-pipeline.md`](translation-pipeline.md) for those runtime paths.

Enabling the public pilot build flag does not enable the Worker. Translation also requires server-side `ONLINE_ENABLED=true`, an `IP_HASH_SECRET` of at least 32 characters, and the app's existing user opt-in and local/cache-first path. The default Worker state remains disabled. For deployment steps and protocol details, use [`gateway/README.md`](../gateway/README.md); [`COST & QUOTA GUARDRAILS.md`](../COST%20%26%20QUOTA%20GUARDRAILS.md) remains binding.

## Verification ownership

[`docs/testing.md`](testing.md) owns verification commands. Existing `verify:contracts` checks the single VitePWA options object, prompt updates, heavy-chunk exclusions, `/api/*` Worker-first routing, disabled Worker default, and build-check hooks. The production build budget check confirms emitted heavy chunks stay outside precache and required icons, dictionary and WordNet assets enter it.

Task 2 owns any new automated contract assertions. Candidates are manifest `id`, `scope`, `start_url` and share-target shape; Workbox navigation fallback and bounded same-origin runtime cache rules; Wrangler asset directory, entry point, `QUOTA` binding/class/migration and absence of extra bindings; and separation of the public env default from the Worker kill switch. Assert parsed config or generated output where practical. Keep operational explanations here, and avoid tests that freeze prose, hashed filenames or provider ordering.
