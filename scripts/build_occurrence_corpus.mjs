#!/usr/bin/env node
// FREEZE STEP 1 — corpus acquisition.
//
// Fetches the frozen Project Gutenberg pool, strips the PG header/footer boilerplate,
// and records a per-document SHA-256 so the sampled text can be re-derived byte for
// byte. This script performs NO sampling: it only materialises the source text.
//
// Usage: node scripts/build_occurrence_corpus.mjs
// Output: data/occurrences/corpus-manifest.json

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';

const OUT_DIR = 'data/occurrences';
const CACHE_DIR = 'tmp/corpus-cache';

// The frozen pool, stored in-repo so the corpus is reproducible from a clean
// checkout. Produced by the selection rule documented in data/occurrences/SOURCE.md;
// the same rule run against the same catalog must reproduce exactly this list.
const POOL = JSON.parse(readFileSync('data/occurrences/pool.json', 'utf8'));

const SECONDARY_FILE = 'data/occurrences/pool-secondary.json';

const FETCH_CONCURRENCY = 6;

// Project Gutenberg wraps each text in a licence banner. Everything outside the
// markers is metadata, transcriber notes and the licence itself - none of it is
// authored prose, so it must never reach a sampled sentence.
const START_RE = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i;
const END_RE = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i;

function stripBoilerplate(text) {
  const start = START_RE.exec(text);
  const end = END_RE.exec(text);
  if (!start) return null;
  return text.slice(start.index + start[0].length, end ? end.index : text.length)
    .replace(/^[\r\n]+/, '')
    .replace(/[\s﻿]+$/, '');
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function fetchDoc(id) {
  const cached = `${CACHE_DIR}/${id}.txt`;
  if (existsSync(cached)) {
      return { raw: readFileSync(cached, 'utf8'), cached: true, retrievedAt: statSync(cached).mtime.toISOString().slice(0, 10) };
  }
  const url = `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const raw = await res.text();
  writeFileSync(cached, raw, 'utf8');
    return { raw, cached: false, retrievedAt: new Date().toISOString().slice(0, 10) };
}

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(CACHE_DIR, { recursive: true });

// Materialise one tier's pool: fetch (or reuse cache), strip boilerplate, hash.
async function materialiseTier(pool, tier) {
  const documents = [];
  const failures = [];
  let cursor = 0;

  async function worker() {
    while (cursor < pool.length) {
      const entry = pool[cursor++];
      const id = entry.id;
      try {
              const { raw, cached, retrievedAt } = await fetchDoc(id);
              const body = stripBoilerplate(raw);
              if (body === null) {
                failures.push({ id, reason: 'no START OF marker' });
                console.log(`${tier} ${id} SKIP no START marker`);
                continue;
              }
              const words = body.split(/\s+/).filter(Boolean).length;
              documents.push({
                id,
                bucket: entry.bucket ?? 'unknown',
                title: (raw.match(/^Title:\s*(.+)$/m)?.[1] ?? '').trim(),
                author: (raw.match(/^Author:\s*(.+)$/m)?.[1] ?? '').trim(),
                authorDeathYear: entry.authorDeathYear ?? null,
                words,
                chars: body.length,
                // Hash of the BOILERPLATE-STRIPPED body, i.e. exactly the text we sample from.
                sha256: sha256(Buffer.from(body, 'utf8')),
                rawSha256: sha256(Buffer.from(raw, 'utf8')),
                retrievedAt,
                fromCache: cached,
              });
              if (documents.length % 50 === 0) console.log(`${tier}: ${documents.length}/${pool.length}`);
      } catch (err) {
              failures.push({ id, reason: String(err) });
              console.log(`${tier} ${id} ERR ${String(err).slice(0, 100)}`);
      }
    }
  }

  await Promise.all(Array.from({ length: FETCH_CONCURRENCY }, worker));
  documents.sort((a, b) => a.id - b.id);

  const byBucket = {};
  for (const d of documents) byBucket[d.bucket] = (byBucket[d.bucket] ?? 0) + 1;
  const totalWords = documents.reduce((sum, d) => sum + d.words, 0);

  const manifest = {
    source: 'Project Gutenberg',
    tier,
    catalog: 'https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv',
    textUrlPattern: 'https://www.gutenberg.org/cache/epub/{id}/pg{id}.txt',
    license: 'Project Gutenberg License (works in the US public domain)',
    selectionRule: 'data/occurrences/SOURCE.md',
    documentCount: documents.length,
    poolSize: pool.length,
    totalWords,
    byBucket,
    // Per-document retrieval dates (from the fetch, or the cache file mtime).
    retrievalDates: [...new Set(documents.map((d) => d.retrievedAt))].sort(),
    ...(tier === 'secondary'
      ? { eraWindow: SECONDARY.eraWindow, eraPredicate: SECONDARY.eraPredicate, purpose: SECONDARY.purpose }
      : { eraPredicate: 'none - the primary tier spans the whole catalog period' }),
    failures,
    documents,
  };

  writeFileSync(`${OUT_DIR}/corpus-manifest${tier === 'primary' ? '' : '-secondary'}.json`, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log(`\n=== ${tier.toUpperCase()} CORPUS FROZEN ===`);
  console.log(`documents: ${documents.length}/${pool.length}`);
  console.log(`words: ${totalWords.toLocaleString()} (${(totalWords / 1e6).toFixed(2)}M)`);
  console.log(`by bucket: ${Object.entries(byBucket).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  if (failures.length) console.log(`failures (${failures.length}): ${failures.map((f) => f.id).join(', ')}`);

  return manifest;
}

const SECONDARY = existsSync(SECONDARY_FILE)
  ? JSON.parse(readFileSync(SECONDARY_FILE, 'utf8'))
  : null;

await materialiseTier(POOL, 'primary');
if (SECONDARY) {
  await materialiseTier(SECONDARY.documents, 'secondary');
} else {
  console.log('\nno secondary pool declared - skipping rescue tier');
}