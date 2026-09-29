import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The nine subsystems that make up the partition. Enforced so a renamed or
// removed verify script fails loudly instead of silently shrinking the map.
const expectedSubsystems = ['reader', 'pdf', 'import', 'lookup', 'language', 'translation', 'storage', 'ui', 'offline'];
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

// Split a verify script into its `vitest run <positional...>` clause. Filters and
// excludes are kept separate because they are not both substring matches.
const parseVerifyScope = (script) => {
  const match = script.match(/\bvitest\s+run\b([^&|]*)/);
  if (!match) return null;
  const tokens = match[1].match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  const filters = [];
  const excludes = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index].replace(/^["']|["']$/g, '');
    if (token === '--exclude') excludes.push(tokens[++index]?.replace(/^["']|["']$/g, '') ?? '');
    else if (token.startsWith('--exclude=')) excludes.push(token.slice('--exclude='.length));
    else if (token.startsWith('-')) continue;
    else filters.push(token);
  }
  return { filters, excludes };
};

// Vitest matches a positional filter case-insensitively as a substring of the
// repo-relative test path (vitest `filterFiles`). It is NOT a glob or a
// directory-boundary match, so `src/core/cache` also covers `src/core/cache.test.ts`.
const matchesFilter = (file, filter) => file.toLowerCase().includes(filter.toLowerCase());

// `--exclude` uses the same glob matcher Vitest uses for its config excludes
// (`pm.isMatch` from picomatch). Reuse the installed copy so the audit cannot
// drift from the runner; search ancestors as well as local node_modules.
const { createRequire } = await import('node:module');
const requireFromRoot = createRequire(path.join(root, 'package.json'));
let isMatch;
try {
  ({ isMatch } = requireFromRoot('picomatch'));
} catch {
  let dir = root;
  while (!isMatch) {
    try {
      ({ isMatch } = createRequire(path.join(dir, 'package.json'))('picomatch'));
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) throw new Error('Could not resolve picomatch to evaluate verify --exclude globs.');
      dir = parent;
    }
  }
}

const inScope = (file, scope) => scope.filters.some((filter) => matchesFilter(file, filter))
  && !scope.excludes.some((glob) => isMatch(file, glob));

// Read the subsystem scopes straight from the authoritative verify scripts so a
// filter change cannot silently desync the audit from what agents actually run.
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const scopes = {};
const scopeErrors = [];
for (const name of expectedSubsystems) {
  const script = pkg.scripts?.[`verify:${name}`];
  if (!script) {
    scopeErrors.push(`package.json has no verify:${name} script.`);
    continue;
  }
  const scope = parseVerifyScope(script);
  if (!scope || scope.filters.length === 0) {
    scopeErrors.push(`verify:${name} does not scope any Vitest path filter.`);
    continue;
  }
  scopes[name] = scope;
}

const noScope = () => false;
const buckets = Object.fromEntries(
  expectedSubsystems.map((name) => [name, scopes[name] ? (file) => inScope(file, scopes[name]) : noScope]),
);

const membership = new Map(files.map((file) => [file, Object.entries(buckets).filter(([, matches]) => matches(file)).map(([name]) => name)]));
const duplicates = [...membership].filter(([, owners]) => owners.length > 1);
const orphans = [...membership].filter(([, owners]) => owners.length === 0);
const assigned = [...membership].filter(([, owners]) => owners.length === 1).length;

console.log(`Subsystems: ${Object.keys(scopes).length}/${expectedSubsystems.length}`);
console.log(`Total files: ${files.length}`);
console.log(`Assigned files: ${assigned}`);
console.log(`Duplicates: ${duplicates.length}`);
for (const [file, owners] of duplicates) console.log(`  ${file}: ${owners.join(', ')}`);
console.log(`Orphans: ${orphans.length}`);
for (const [file] of orphans) console.log(`  ${file}`);
console.log('Per subsystem:');
for (const name of expectedSubsystems) {
  console.log(`  ${name}: ${[...membership.values()].filter((owners) => owners.includes(name)).length}`);
}
if (scopeErrors.length) {
  console.log(`Scope errors: ${scopeErrors.length}`);
  for (const message of scopeErrors) console.log(`  ${message}`);
}

if (scopeErrors.length || duplicates.length || orphans.length || assigned !== files.length) process.exit(1);
