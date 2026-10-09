/*
 * CSS syntax and import-chain guard.
 *
 * The narrow `verify:*` subsystem commands run `tsc -b` plus jsdom Vitest, and
 * neither parses stylesheets. A malformed stylesheet - an unclosed `@media`
 * block, for example - therefore passes typecheck and every component test and
 * only fails later in `vite build`, where PostCSS raises "Unclosed block".
 *
 * This script closes that gap without duplicating the production build: it
 * reuses the same PostCSS parser the Vite pipeline uses and fails non-zero on
 * any parse error or on an unresolvable local `@import`.
 *
 * It parses every stylesheet under `src/` instead of walking a single entry
 * point, because `src/styles.css` is the only eagerly imported stylesheet:
 * `src/reader-layout.css` (and through it the reader base/mobile/desktop files)
 * is loaded through a lazy `import()` call in `src/app/App.tsx`. An entry-only
 * walk would not see it, which is exactly how the unclosed mobile block escaped
 * the narrow checks.
 *
 * Usage: node scripts/check_css_syntax.mjs [dir-or-file ...]   (default: src)
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';

const root = process.cwd();
const targets = process.argv.slice(2);
const inputs = targets.length ? targets : ['src'];

const CSS_EXTENSION = '.css';
// Local only: bare specifiers and url()/protocol imports are not repo files.
const LOCAL_IMPORT = /^\.{1,2}\//;

async function collect(dir, found) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      await collect(full, found);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(CSS_EXTENSION)) {
      found.push(full);
    }
  }
  return found;
}

const files = [];
for (const input of inputs) {
  const resolved = path.resolve(root, input);
  let info;
  try {
    info = await stat(resolved);
  } catch {
    console.error(`FAIL: CSS syntax guard input not found: ${input}`);
    process.exit(1);
  }
  if (info.isDirectory()) await collect(resolved, files);
  else if (resolved.toLowerCase().endsWith(CSS_EXTENSION)) files.push(resolved);
}
files.sort();

if (files.length === 0) {
  console.error(`FAIL: no stylesheets found under: ${inputs.join(', ')}`);
  process.exit(1);
}

const failures = [];
const relative = (file) => path.relative(root, file).replaceAll('\\', '/');

for (const file of files) {
  const source = await readFile(file, 'utf8');
  let rootNode;
  try {
    rootNode = postcss.parse(source, { from: file });
  } catch (error) {
    const location = error.line ? `:${error.line}:${error.column}` : '';
    failures.push(`${relative(file)}${location}: ${error.reason ?? error.message}`);
    continue;
  }

  // A parse failure inside an imported file is caught by its own iteration;
  // here we only confirm the import target actually exists, so a renamed or
  // deleted stylesheet cannot silently drop a whole presentation layer.
  rootNode.walkAtRules('import', (rule) => {
    const match = rule.params.match(/^(['"])([^'"]+)\1/);
    if (!match) return;
    const specifier = match[2];
    if (!LOCAL_IMPORT.test(specifier)) return;
    const target = path.resolve(path.dirname(file), specifier);
    if (!files.includes(target)) {
      const location = rule.source?.start ? `:${rule.source.start.line}:${rule.source.start.column}` : '';
      failures.push(`${relative(file)}${location}: unresolved local @import "${specifier}"`);
    }
  });
}

if (failures.length) {
  console.error(failures.map((message) => `FAIL: ${message}`).join('\n'));
  process.exit(1);
}

console.log(`CSS syntax OK: ${files.length} stylesheets parse cleanly and every local @import resolves.`);
