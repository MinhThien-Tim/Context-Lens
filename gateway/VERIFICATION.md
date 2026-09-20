# Gateway verification — 2026-09-20

## Evidence

- Final unit/integration suite: 32 files, 95 tests passed. Covers 100 concurrent simulated requests against transactional storage (two admitted upstream), global request/character caps, daily IP limits, rolling minute limits, UTC rollover, reconstruction, expired leases, storage failure, persisted upstream blocking, schema/body controls, HTML/redirect rejection, 2-second cancellation, Origin and kill switch, client device cache, pilot enablement and Offline opt-out.
- Both frontend and gateway TypeScript validation passed.
- Final `npm run gateway:build` passed including PWA generation and bundle budgets. Main entry: 261.3 KiB (84.08 kB gzip in Vite output); CSS: 17.5 KiB. Worker dry-run bundle: 8.96 KiB / 3.08 KiB gzip.
- Wrangler 4.135.0 dry-run successfully packaged the Worker with `QUOTA` / SQLite Durable Object and `ASSETS` bindings. No resources were deployed by dry-run.
- Actual workerd local runtime initially exposed unsupported `redirect: error`; corrected to `manual`, rejecting all non-2xx responses without following redirects. Added regression coverage.
- Local runtime rejected a mismatched Origin with HTTP 403 before contacting upstream.
- Actual Google calls through the local Worker returned HTTP 200 in both directions. EN→VI `Training is a prerequisite.` returned `Đào tạo là điều kiện tiên quyết.` in 1,044 ms; VI→EN `Xin chào.` returned `Hello.` in 175 ms. A separate `Good morning.` smoke call also succeeded.

## Measurement limits

Host: Windows, Node 24.21.0, Wrangler 4.135.0 with local workerd. Requests sent by Node fetch over localhost, then the host's actual internet connection; no controlled throttling. Two timed sequential samples, one per direction, are smoke evidence only. No meaningful p50/p95 or mobile/network speed claim is made from this sample size. Client cache was bypassed in these HTTP smoke calls.

Quota concurrency unit tests use a serial transactional storage double, not a deployed Cloudflare database. Local workerd verified the real class/binding/storage path for sequential calls. Cloudflare-hosted concurrency, region latency, recovery and upstream IP acceptance still require staging. An IP-hash secret used for local testing was a public test value, never suitable for deployment.

## Not deployed

Cloudflare staging/production has not been provisioned or modified. Required next inputs: target Cloudflare account/Worker URL and a production `IP_HASH_SECRET` entered through Wrangler or the dashboard. Keep `ONLINE_ENABLED=false` until these are configured. Google may block Cloudflare egress even though the local runtime succeeds.
