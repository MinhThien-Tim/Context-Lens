import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
const listed = spawnSync(process.execPath, [vitest, 'list', '--filesOnly'], {
  cwd: root,
  encoding: 'utf8',
});

if (listed.error || listed.status !== 0) {
  console.error(listed.stderr || listed.error?.message || `vitest list exited ${listed.status}`);
  process.exit(1);
}

const files = [...new Set(listed.stdout.split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && /\.test\.[jt]sx?$/.test(line))
  .map((line) => line.replaceAll('\\', '/').replace(/^.*?(?=(?:src|gateway)\/)/, '')))]
  .sort();

if (files.length === 0) {
  console.error('Vitest listed no test files; refusing to treat an empty list as a valid partition.');
  process.exit(1);
}

const under = (file, prefix) => file.startsWith(`${prefix}/`);
const anyUnder = (file, prefixes) => prefixes.some((prefix) => under(file, prefix));
const buckets = {
  reader: (f) => under(f, 'src/reader') && !anyUnder(f, ['src/reader/pdf', 'src/reader/pdf-reading']),
  pdf: (f) => anyUnder(f, ['src/reader/pdf', 'src/reader/pdf-reading', 'src/documents/pdf']),
  import: (f) => under(f, 'src/documents') && !anyUnder(f, ['src/documents/pdf']) && !f.startsWith('src/documents/offline'),
  lookup: (f) => (under(f, 'src/lookup') && !under(f, 'src/lookup/normalization') && !f.endsWith('.offline.test.tsx'))
    || ['src/components/LookupBottomSheet', 'src/components/dictionaryDisplay', 'src/components/lookupPopupPlacement'].some((prefix) => under(f, prefix) && !f.endsWith('.offline.test.tsx')),
  language: (f) => anyUnder(f, ['src/core/language', 'src/lookup/normalization']),
  translation: (f) => anyUnder(f, ['src/core/translation', 'src/core/context', 'src/core/cache', 'src/core/diagnostics', 'src/core/performance', 'src/ai', 'src/settings', 'src/integration', 'gateway']),
  storage: (f) => anyUnder(f, ['src/db', 'src/storage', 'src/notes/store', 'src/vocabulary']),
  ui: (f) => anyUnder(f, ['src/components', 'src/onboarding', 'src/app', 'src/notes/NotesPanel'])
    && !['LookupBottomSheet', 'OfflineBadge', 'dictionaryDisplay', 'lookupPopupPlacement'].some((name) => f.split('/').at(-1).startsWith(name)),
  offline: (f) => f.startsWith('src/documents/offline') || under(f, 'src/components/OfflineBadge') || under(f, 'src/components/LookupBottomSheet.offline'),
};

const membership = new Map(files.map((file) => [file, Object.entries(buckets).filter(([, matches]) => matches(file)).map(([name]) => name)]));
const duplicates = [...membership].filter(([, owners]) => owners.length > 1);
const orphans = [...membership].filter(([, owners]) => owners.length === 0);
const assigned = [...membership].filter(([, owners]) => owners.length === 1).length;

console.log(`Total files: ${files.length}`);
console.log(`Assigned files: ${assigned}`);
console.log(`Duplicates: ${duplicates.length}`);
for (const [file, owners] of duplicates) console.log(`  ${file}: ${owners.join(', ')}`);
console.log(`Orphans: ${orphans.length}`);
for (const [file] of orphans) console.log(`  ${file}`);

if (duplicates.length || orphans.length || assigned !== files.length) process.exit(1);
