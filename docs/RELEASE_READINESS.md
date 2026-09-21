# Production release readiness - 2026-09-19

## Completed

- Production EN-VI pack built from the Skypedia SQLite source: 104,738 entries, 17,476,995 bytes.
- Release bundle contains the pack, full attribution, manifest, and SHA-256 checksum.
- Source SQLite integrity check passed; pack schema, installer size, representative Vietnamese meanings, and checksum were verified.
- Automated suite: 16 files and 30 tests passed.
- Production TypeScript/Vite/PWA build passed.
- PDF direction is recorded in `PDF_RENDERING_DECISION.md`.

## Deployment blocker

Real Android/iOS QA is not complete because this workspace has no connected Android/iOS device or device-farm session. `DEVICE_QA.md` is the executable matrix and smoke script. Do not label the release production-approved until all four device rows contain PASS plus evidence.

## Release artifact

`release/dictionary/context-lens-en-vi-2026.09.1.json`

SHA-256: `4caa2256337c7f94886c22ccd8a9ff962101647034d7b93c232f505f18888ffe`

The dictionary pack is licensed CC BY-SA 4.0 and must be distributed with the adjacent `ATTRIBUTION.md`.
