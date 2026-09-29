import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const failures = [];
const fail = message => failures.push(message);

function stripJsoncComments(source) {
  let output = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
      output += char;
    } else if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index++;
      output += '\n';
    } else if (char === '/' && next === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index++;
      index++;
      output += ' ';
    } else {
      output += char;
    }
  }

  let json = '';
  inString = false;
  escaped = false;
  for (let index = 0; index < output.length; index++) {
    const char = output[index];
    if (inString) {
      json += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    if (char === ',') {
      let next = index + 1;
      while (/\s/.test(output[next] ?? '')) next++;
      if (output[next] === '}' || output[next] === ']') continue;
    }
    json += char;
  }
  return json;
}

const property = (node, name) => node?.properties?.find(item =>
  ts.isPropertyAssignment(item) && (ts.isIdentifier(item.name) || ts.isStringLiteral(item.name)) && item.name.text === name,
);
const stringValue = node => ts.isStringLiteral(node) ? node.text : undefined;
const arrayStrings = node => ts.isArrayLiteralExpression(node)
  ? node.elements.map(stringValue).filter(value => value !== undefined)
  : [];

const viteSource = await readFile(resolve(root, 'vite.config.ts'), 'utf8');
const viteFile = ts.createSourceFile('vite.config.ts', viteSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const pwaImports = new Set();
for (const statement of viteFile.statements) {
  if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== 'vite-plugin-pwa') continue;
  const bindings = statement.importClause?.namedBindings;
  if (bindings && ts.isNamedImports(bindings)) {
    for (const element of bindings.elements) if (element.propertyName?.text === 'VitePWA' || element.name.text === 'VitePWA') pwaImports.add(element.name.text);
  }
}

const pwaOptions = [];
const visitVite = node => {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && pwaImports.has(node.expression.text)
      && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) pwaOptions.push(node.arguments[0]);
  ts.forEachChild(node, visitVite);
};
visitVite(viteFile);
if (pwaOptions.length !== 1) {
  fail(`Expected one VitePWA options object in vite.config.ts; found ${pwaOptions.length}.`);
} else {
  const options = pwaOptions[0];
  if (stringValue(property(options, 'registerType')?.initializer) !== 'prompt') fail("VitePWA registerType must remain 'prompt'.");
  const ignores = arrayStrings(property(property(options, 'workbox')?.initializer, 'globIgnores')?.initializer);
  for (const prefix of ['pdf-reader', 'ocr-reader', 'epub-reader', 'docx-reader', 'archive-runtime']) {
    if (!ignores.some(pattern => pattern.includes(`${prefix}-*.js`))) fail(`VitePWA workbox.globIgnores must exclude ${prefix} chunks.`);
  }
}

try {
  const source = await readFile(resolve(root, 'gateway/wrangler.jsonc'), 'utf8');
  const config = JSON.parse(stripJsoncComments(source));
  const routes = config.assets?.run_worker_first;
  if (JSON.stringify(routes) !== JSON.stringify(['/api/*'])) fail('gateway/wrangler.jsonc assets.run_worker_first must equal ["/api/*"].');
  if (config.vars?.ONLINE_ENABLED !== 'false') fail('gateway/wrangler.jsonc vars.ONLINE_ENABLED must default to "false".');
} catch (error) {
  fail(`Could not parse gateway/wrangler.jsonc: ${error.message}`);
}

const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
for (const name of ['build', 'gateway:build']) {
  if (!pkg.scripts?.[name]?.includes('node scripts/check_bundle_budget.mjs')) fail(`package.json ${name} must run scripts/check_bundle_budget.mjs.`);
}
if (!pkg.scripts?.['verify:full']?.includes('npm run verify:contracts')) fail('package.json verify:full must run verify:contracts.');

const map = await readFile(resolve(root, 'docs/verification-map.md'), 'utf8');
const mapped = [];
for (const line of map.split(/\r?\n/)) {
  if (!line.startsWith('|')) continue;
  const match = line.match(/`npm run (verify:[\w-]+)`/);
  if (match) mapped.push(match[1]);
}
const duplicateMaps = [...new Set(mapped.filter((name, index) => mapped.indexOf(name) !== index))];
const scripts = Object.keys(pkg.scripts ?? {}).filter(name => name.startsWith('verify:')).sort();
const mapNames = [...new Set(mapped)].sort();
if (duplicateMaps.length) fail(`Duplicate verify script entries in docs/verification-map.md: ${duplicateMaps.join(', ')}.`);
if (JSON.stringify(mapNames) !== JSON.stringify(scripts)) {
  fail(`docs/verification-map.md verify scripts differ from package.json; missing: ${scripts.filter(name => !mapNames.includes(name)).join(', ') || 'none'}; stale: ${mapNames.filter(name => !scripts.includes(name)).join(', ') || 'none'}.`);
}

if (failures.length) {
  console.error(failures.map(message => `FAIL: ${message}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Architecture contracts OK: PWA policy, Worker routing/default, build budget hooks, and verify script map.');
}
