import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const dist = resolve('dist');
const html = await readFile(resolve(dist, 'index.html'), 'utf8');
const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(match => match[1].replace(/^\//, ''));
const sizes = await Promise.all(assets.map(async asset => ({ asset, bytes: (await stat(resolve(dist, asset))).size })));
const limits = { js: 350 * 1024, css: 100 * 1024 };
const failures = sizes.filter(item => item.bytes > limits[item.asset.endsWith('.css') ? 'css' : 'js']);
if (failures.length) throw new Error(`Initial bundle budget exceeded: ${failures.map(item => `${item.asset}=${item.bytes}`).join(', ')}`);
const assetNames = await readdir(resolve(dist, 'assets'));
const heavyChunks = assetNames.filter(name => /^(?:pdf-reader|ocr-reader|epub-reader|docx-reader|archive-runtime)-.*\.js$/.test(name));
const sw = await readFile(resolve(dist, 'sw.js'), 'utf8');
const precache = sw.match(/precacheAndRoute\((\[[\s\S]*?\]),\{\}\)/)?.[1];
if (!precache) throw new Error('Could not find the generated Workbox precache list in dist/sw.js.');
const precached = new Set([...precache.matchAll(/url:"([^"]+)"/g)].map(match => match[1]));
const heavyInPrecache = [...precached].filter(url => /(?:^|\/)(?:pdf-reader|ocr-reader|epub-reader|docx-reader|archive-runtime)-.*\.js$/.test(url));
if (heavyInPrecache.length) throw new Error(`Heavy reader chunks entered service-worker precache: ${heavyInPrecache.join(', ')}`);
if (heavyChunks.length === 0) throw new Error('Expected lazy heavy reader chunks, but none were emitted.');

const requiredAssets = ['icon.svg', 'icon-192.svg', 'icon-512.svg'];
const dictionary = assetNames.find(name => /^context-lens-en-vi-.*\.json$/.test(name));
const wordnet = assetNames.filter(name => /^wordnet-.*\.json$/.test(name));
if (!dictionary) throw new Error('Expected the generated EN-VI dictionary payload in dist/assets.');
if (wordnet.length === 0) throw new Error('Expected generated WordNet payloads in dist/assets.');
requiredAssets.push(`assets/${dictionary}`, ...wordnet.map(name => `assets/${name}`));
const missingRequired = requiredAssets.filter(url => !precached.has(url));
if (missingRequired.length) throw new Error(`Required static assets are missing from service-worker precache: ${missingRequired.join(', ')}`);

console.log(`Bundle budget OK: ${sizes.map(item => `${item.asset} ${(item.bytes / 1024).toFixed(1)} KiB`).join(', ')}; ${heavyChunks.length} heavy reader chunks stay out of precache; required icons, dictionary, and WordNet assets are precached.`);
