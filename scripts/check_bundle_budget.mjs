import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const dist = resolve('dist');
const html = await readFile(resolve(dist, 'index.html'), 'utf8');
const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(match => match[1].replace(/^\//, ''));
const sizes = await Promise.all(assets.map(async asset => ({ asset, bytes: (await stat(resolve(dist, asset))).size })));
const limits = { js: 350 * 1024, css: 100 * 1024 };
const failures = sizes.filter(item => item.bytes > limits[item.asset.endsWith('.css') ? 'css' : 'js']);
if (failures.length) throw new Error(`Initial bundle budget exceeded: ${failures.map(item => `${item.asset}=${item.bytes}`).join(', ')}`);
const readerChunks = (await readdir(resolve(dist, 'assets'))).filter(name => /^(?:pdf|epub|docx)-reader-|^archive-runtime-/.test(name));
console.log(`Bundle budget OK: ${sizes.map(item => `${item.asset} ${(item.bytes / 1024).toFixed(1)} KiB`).join(', ')}; ${readerChunks.length} heavy reader chunks remain lazy.`);
