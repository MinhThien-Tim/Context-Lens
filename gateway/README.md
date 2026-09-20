# Cloudflare Free translation pilot

This Worker serves the existing `dist` app and `/api/translate` on the same origin. Google `client=gtx` is an **unofficial experimental** upstream, with no availability guarantee. No Google key, token extraction, IP rotation, third-party proxy or automatic retry is used. No upstream live-call success is implied by the unit tests.

## Version 1 protocol

Requests use a strict normalized envelope:

```json
{ "version": 1, "provider": "auto", "text": "prerequisite", "sourceLang": "en", "targetLang": "vi", "mode": "word" }
```

`provider` accepts `auto`, `google-web`, or `bing-web`. Auto tries healthy, available providers sequentially in the fixed order `google-web` then `bing-web`; it never starts both upstreams concurrently. Manual selection calls only the selected provider, and cancellation stops fallback. Google web is implemented experimentally. The isolated Bing adapter currently reports `PROVIDER_UNAVAILABLE` without reserving quota or contacting an upstream because no safe, stable unauthenticated request has been justified. Successful responses are normalized, for example:

```json
{ "version": 1, "text": "điều kiện tiên quyết", "provider": "google-web", "detectedLang": "en" }
```

The IDs `google-cloud-v2` and `azure-translator` are reserved for future official server-side adapters. They are not accepted as executable providers and no credentials, billing, OAuth, or BYOK workflow is implemented.

Quota is reserved immediately before each actual upstream attempt. Daily and per-IP budgets remain shared abuse controls, while failures and cooldown are recorded by provider so a blocked provider does not suppress a healthy fallback. Failed attempts are not refunded.

Gateway failures are normalized and never include raw upstream bodies. Cancellation stops fallback and does not count against provider health, although an attempt already admitted by the server remains charged. Global/daily quota, rate-limit and concurrency rejection do not fan out to another provider.

## Limits and privacy

- SQLite-backed Durable Object on Workers Free; one stable object (`global-pilot-v1`) owns admission for the whole deployment. Do not shard this object or rename it to reset quota.
- 500 upstream attempts / 100,000 Unicode code points per UTC day globally; 50 / 10,000 per IP; six per rolling minute; two active attempts. Maximum selection: 1,000 code points, body: 8 KiB, upstream response: 32 KiB.
- Quota is reserved transactionally **before** upstream fetch; failed and cancelled attempts are never refunded. A failed quota store fails closed. A client abort may not stop work already admitted on the server.
- In-flight leases survive reconstruction and expire after 30 seconds. Google has a 2-second deadline including body parsing. Block/429 responses open a persisted cooldown; three consecutive other failures do likewise. Cooldown increases up to one hour.
- This pilot intentionally uses daily HMAC-hashed `CF-Connecting-IP`, not browser identifiers or unsigned session tokens. People behind shared NAT share limits. A new IP can receive a new IP allowance but cannot bypass the global cap. CORS/Origin is only a browser control, not authentication.
- Only counters, hashed IP buckets, lease identifiers and health state are stored. The ledger rolls over daily; Cloudflare storage recovery may retain prior versions according to its platform policy. No translation cache or text logs on the server. Responses use `Cache-Control: no-store`; successful translations use existing device memory/Dexie caches.
- Rejected traffic still consumes Cloudflare requests; Free infrastructure limits can therefore disable the service under abuse. The gateway does not guarantee protection against distributed denial of service. Local reader functionality remains usable.

## Local build and validation

```powershell
npm test
npm run typecheck
npx tsc --project gateway/tsconfig.json
npm run gateway:build
npx wrangler deploy --dry-run --config gateway/wrangler.jsonc
npx wrangler dev --config gateway/wrangler.jsonc
```

Wrangler is a development-only dependency. `VITE_MANAGED_TRANSLATION` is public configuration, not a secret. Standalone builds without it never call the gateway. Offline engine mode and the Online translation checkbox disable the managed provider. Managed translation follows local providers; device cache is checked before any provider.

## Staging deployment

1. Use a separate staging Worker name/account namespace. Confirm ownership of the intended Cloudflare account and production origin before deployment.
2. Sign in with `npx wrangler login`. Generate a random secret with at least 32 characters and enter it at the interactive prompt: `npx wrangler secret put IP_HASH_SECRET --config gateway/wrangler.jsonc`. Do not put it in a `VITE_` variable or commit it. `.dev.vars` is ignored for local secrets.
3. Build with `VITE_MANAGED_TRANSLATION=true` and deploy the assets plus Worker with `npx wrangler deploy --config gateway/wrangler.jsonc`. Default `ONLINE_ENABLED=false` is the safe initial state.
4. Set `ONLINE_ENABLED=true` in staging once the secret is configured. This environment variable is also the immediate kill switch. A later deploy restores the value in the config, so explicitly review it each time.
5. Test a small set of EN→VI / VI→EN requests from the staging app. Record browser, Worker region/placement where available, date, successful count, errors, p50/p95. A localhost success does not verify Google access from Cloudflare.
6. Verify quota concurrency/restart in the real Durable Object runtime, storage failure, block cooldown and client offline/reload. Unit tests simulate transactional storage; they do not prove platform behavior.
7. If Google returns a challenge or blocks the Worker, leave the circuit open and the pilot offline; do not rotate endpoints/IPs. Production release requires staging evidence.

The 2.8-second client managed-provider deadline allows the server's 2-second upstream timeout to finish. This is a timeout budget, not an achieved latency claim. Google unofficial deployment is separate from the legacy configured official Google/Bing adapters.

References: https://developers.cloudflare.com/durable-objects/platform/pricing/ ; https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/ ; https://github.com/ssut/py-googletrans
