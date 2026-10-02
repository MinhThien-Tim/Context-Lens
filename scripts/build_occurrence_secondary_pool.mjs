#!/usr/bin/env node
// FREEZE STEP 1b — pre-declared secondary tier (Gutenberg "1900-1930" era).
//
// Declared BEFORE any occurrence is sampled and used ONLY to rescue a diagnostic
// lemma whose primary-tier yield is < 5 occurrences. The primary tier stays frozen;
// this tier never replaces it.
//
// PROVENANCE NOTE (recorded, not silent): the Project Gutenberg catalog carries no
// publication-year column. Its `Issued` field is the *ebook release* date, which
// cannot predate 1971, so an "Issued in 1900-1930" filter matches zero rows. The only
// period signal the catalog actually carries is the life-date suffix on the `Authors`
// field ("Hardy, Thomas, 1840-1912"). This tier therefore selects works whose
// principal author's DEATH year falls in 1900-1930, which places the work in the
// 1900-1930 literary era for editorial purposes. This is a documented proxy, not an
// exact publication-year filter; SOURCE.md §7 records the same substitution.
//
// Usage: node scripts/build_occurrence_secondary_pool.mjs
// Output: data/occurrences/pool-secondary.json

import { readFileSync, writeFileSync } from 'node:fs';

const CATALOG = 'tmp/pg_catalog.csv';
const OUT = 'data/occurrences/pool-secondary.json';

// Same genre strata as the primary tier (SOURCE.md §4), narrowed to the rescue
// window. Keeping the rule identical to the primary tier is what makes the tier
// comparable: only the period predicate differs.
const DEATH_MIN = 1900;
const DEATH_MAX = 1930;

const BUCKET_ORDER = ['fiction', 'science', 'philosophy', 'medicine', 'essays', 'reference', 'history'];
const SHELVES = {
  fiction: ['Fiction'],
  science: ['Science'],
  philosophy: ['Philosophy'],
  medicine: ['Medicine'],
  essays: ['Essays'],
  reference: ['Reference'],
  history: ['History'],
};
const QUOTAS = { fiction: 24, science: 20, philosophy: 20, medicine: 12, essays: 8, reference: 12, history: 4 };

const EXCLUDE_TITLE = /^(Images|Music|Sound|Sheet Music|Cartons)\b/;

// Parse the PG catalog CSV. Fields are RFC-4180 quoted; Text# and Type and Language
// are unquoted in practice, but Title/Author are quoted and may contain commas.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const rows = parseCsv(readFileSync(CATALOG, 'utf8'));
const header = rows[0].map((h) => h.trim().toLowerCase());
const col = (name) => header.indexOf(name);

const I_TEXT = col('text#');
const I_TYPE = col('type');
const I_LANG = col('language');
const I_TITLE = col('title');
const I_AUTHORS = col('authors');
const I_SHELVES = col('bookshelves');
const I_SUBJECTS = col('subjects');

if ([I_TEXT, I_TYPE, I_LANG, I_AUTHORS].some((i) => i < 0)) {
  throw new Error(`catalog header mismatch: ${header.join(' | ')}`);
}

// Principal author death year, from the life-date suffix on the Authors field.
// Takes the LATEST death year when several authors are listed, so a work with a
// modern editor and an older author is judged by the original author.
function deathYearOf(row) {
  let latest = null;
  for (const part of (row[I_AUTHORS] ?? '').split(';')) {
    const m = part.trim().match(/,\s*\d{4}\s*-\s*(\d{4})\s*$/);
    if (m) latest = Math.max(latest ?? 0, Number(m[1]));
  }
  return latest;
}

const candidates = rows.slice(1).filter((r) => {
  if (r[I_TYPE]?.trim() !== 'Text') return false;
  if (r[I_LANG]?.trim() !== 'en') return false;
  if (EXCLUDE_TITLE.test((r[I_TITLE] ?? '').trim())) return false;
  const death = deathYearOf(r);
  return death !== null && death >= DEATH_MIN && death <= DEATH_MAX;
});

const idOf = (r) => parseInt(r[I_TEXT], 10);
const titleOf = (r) => (r[I_TITLE] ?? '').trim();
const authorOf = (r) => (r[I_AUTHORS] ?? '').replace(/\s*\(\d{4}-\d{4}\)\s*$/, '').replace(/\s+/g, ' ').trim();

function shelvesOf(r) {
  const shelves = (r[I_SHELVES] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const subjects = (r[I_SUBJECTS] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return [...shelves, ...subjects];
}

const picked = [];
const droppedNoBucket = [];

for (const bucket of BUCKET_ORDER) {
  const wanted = new Set(SHELVES[bucket]);
  const inBucket = candidates
    .filter((r) => shelvesOf(r).some((s) => wanted.has(s)))
      .sort((a, b) => deathYearOf(a) - deathYearOf(b) || idOf(a) - idOf(b));

  const quota = QUOTAS[bucket];
  const chosen = [];
  if (inBucket.length > 0) {
    if (quota === 1) {
      chosen.push(inBucket[0]);
    } else {
      const n = inBucket.length;
      const seen = new Set();
      for (let k = 0; k < quota; k++) {
        const rank = Math.round((k * (n - 1)) / (quota - 1));
        const row = inBucket[rank];
        if (!row || seen.has(idOf(row))) continue;
        seen.add(idOf(row));
        chosen.push(row);
      }
    }
  }
  for (const row of chosen) {
    picked.push({
      id: idOf(row),
      bucket,
        authorDeathYear: deathYearOf(row),
      title: titleOf(row),
      author: authorOf(row),
    });
  }
  if (inBucket.length === 0) droppedNoBucket.push(bucket);
}

picked.sort((a, b) => a.id - b.id);

const doc = {
  tier: 'secondary',
  eraWindow: [1900, 1930],
  declaredBefore: 'sampling',
  purpose:
    'Rescue tier only. Used when a diagnostic lemma yields fewer than 5 occurrences from the primary tier. The primary tier (data/occurrences/pool.json) remains frozen and is never replaced.',
  eraPredicate:
    'principal author DEATH year in 1900-1930, parsed from the catalog Authors life-date suffix. The catalog has no publication-year column; Issued is the ebook release date and cannot predate 1971.',
  rule: 'data/occurrences/SOURCE.md §7',
  catalog: 'https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv',
  license: 'Project Gutenberg License (works in the US public domain)',
  selectionRule: {
    filter: 'Type == "Text" && Language == "en" && title not matching ^(Images|Music|Sound|Sheet Music|Cartons) && 1900 <= author death year <= 1930',
    bucket: 'first match in [fiction, science, philosophy, medicine, essays, reference, history]',
    sample: 'evenly spaced ranks round(k*(n-1)/(quota-1)) after sorting by author death year then Text#',
    quotas: QUOTAS,
  },
  documentCount: picked.length,
  emptyBuckets: droppedNoBucket,
  documents: picked,
};

writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n', 'utf8');

const byBucket = {};
for (const d of picked) byBucket[d.bucket] = (byBucket[d.bucket] ?? 0) + 1;
console.log(`=== SECONDARY TIER FROZEN (era ${DEATH_MIN}-${DEATH_MAX}) ===`);
console.log(`candidate rows in window: ${candidates.length}`);
console.log(`documents: ${picked.length}`);
console.log(`by bucket: ${Object.entries(byBucket).map(([k, v]) => `${k}=${v}`).join(', ')}`);
if (droppedNoBucket.length) console.log(`empty buckets: ${droppedNoBucket.join(', ')}`);
console.log(`output: ${OUT}`);