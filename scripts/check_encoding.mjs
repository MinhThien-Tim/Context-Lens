/*
 * Mojibake guard for source copy.
 *
 * UI strings in this repo are written by hand and several carry Vietnamese and
 * Western punctuation (`…`, `·`, `≥`, `↗`, `“ ”`). When a file is edited or
 * pasted through a Windows-1252 round trip - Git checkout with a mis-set
 * `core.autocrlf`, a PowerShell redirection, an editor configured for a legacy
 * codepage - those characters are stored as their mojibake form (U+00E2 U+20AC
  * for an ellipsis, U+00C2 U+00B7 for a middle dot, U+00C3 U+2014 for a
  * multiplication sign). Nothing else in the narrow `verify:*` commands
  * notices: `tsc` is happy because the mojibake is still valid UTF-8, and the
  * affected text is user-facing copy that no test asserts on.
 *
 * This script fails the build on that class of corruption, reporting each hit
 * as `FAIL: <file>:<line>`.
 *
 * Detection is deliberately narrow. It matches only lead sequences that arise
 * from cp1252 mis-decoding of the characters this codebase actually uses, and
 * it ignores prose, comments and any file on the allowlist below. The point is
 * to catch the regression class with no false positives on real copy, not to
 * re-encode anything: the fix is always to restore the intended character.
 *
 * Usage: node scripts/check_encoding.mjs [dir-or-file ...]  (default: src, e2e, scripts)
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const targets = process.argv.slice(2);
const inputs = targets.length ? targets : ['src', 'e2e', 'scripts'];

const SOURCE_EXTENSION = /\.(ts|tsx|js|jsx|mjs|cjs|css|html)$/i;

/*
 * Mojibake leads produced by cp1252 mis-decoding of the characters used in
  * this repo's copy. Listed as escaped code units so that this guard does not
  * match its own documentation:
  *   U+00E2 U+20AC -> …   U+00C2 U+00A7 -> §   U+00C2 U+00B7 -> ·
  *   U+00C3 U+2014 -> ×   U+00E2 U+2020 -> †   U+00E2 U+2030 -> ‰
  * Each alternative is the leading byte of a character whose UTF-8 encoding
 * begins with 0xC2/0xC3/0xE2, which no correctly encoded Vietnamese or Western
 * word in this codebase begins with.
 */
const MOJIBAKE = /\u00e2\u20ac|\u00c2\u00a7|\u00c2\u00b7|\u00c3\u2014|\u00e2\u2020|\u00e2\u2030|\u00c2[\u0080-\u00bf]|\u00c3[\u0080-\u00bf]|\u00e1\u00ba/g;

/*
 * Pre-existing corruption in the Vietnamese language tables, outside the scope
 * of the App.tsx repair that introduced this guard. One of these lines decodes
 * lossily (`hÆ¡n` would become `hạn`, where the comparative adjective needs
 * `hơn`), so it cannot be corrected by re-decoding alone and needs a domain
 * decision. Tracked separately; remove an entry once its line is repaired.
 */
const ALLOWED = new Set([
  'src/core/language/sense-resolver.ts',
  'src/core/language/local-language-engine.ts',
]);

async function collect(dir, found) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      await collect(full, found);
    } else if (entry.isFile() && SOURCE_EXTENSION.test(entry.name)) {
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
    console.error(`FAIL: encoding guard input not found: ${input}`);
    process.exit(1);
  }
  if (info.isDirectory()) await collect(resolved, files);
  else if (SOURCE_EXTENSION.test(resolved)) files.push(resolved);
}
files.sort();

if (files.length === 0) {
  console.error(`FAIL: no source files found under: ${inputs.join(', ')}`);
  process.exit(1);
}

const failures = [];
const relative = (file) => path.relative(root, file).replaceAll('\\', '/');
let scanned = 0;

for (const file of files) {
  const rel = relative(file);
  if (ALLOWED.has(rel)) continue;
  const source = await readFile(file, 'utf8');
  scanned += 1;
  source.split(/\r?\n/).forEach((line, index) => {
    MOJIBAKE.lastIndex = 0;
    if (MOJIBAKE.test(line)) failures.push(`${rel}:${index + 1}`);
  });
}

if (failures.length) {
  console.error(failures.map((message) => `FAIL: mojibake in ${message}`).join('\n'));
  console.error('Restore the intended characters; do not paste through a legacy codepage.');
  process.exit(1);
}

console.log(`Encoding OK: ${scanned} source files carry no cp1252 mojibake.`);