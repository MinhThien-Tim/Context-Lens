import nounUrl from '../../../release/wordnet/wordnet-noun.json?url';
import verbUrl from '../../../release/wordnet/wordnet-verb.json?url';
import adjectiveUrl from '../../../release/wordnet/wordnet-adj.json?url';
import adverbUrl from '../../../release/wordnet/wordnet-adv.json?url';
import licenseUrl from '../../../release/wordnet/WORDNET-LICENSE.md?url&no-inline';
import type { LexicalEntry } from './types';

type Synset = [string, string[], string, string[]];
interface WordNetPack { version: string; pos: string; synsets: Synset[]; entries: Record<string, number[]> }
const packs = new Map<string, WordNetPack>();
let pending: Promise<void> | undefined;
let lastFailure = false;
export const wordNetLicenseUrl = licenseUrl;
export function wordNetStatus() { return packs.size === 4 ? 'ready' : lastFailure ? 'unavailable' : pending ? 'loading' : 'not-loaded'; }
export function wordNetVersion() { return `wordnet-3.0:${[...packs.keys()].sort().join(',')}`; }
/** Same-origin packaged assets, precached by the PWA. Never sends reading text. */
export function loadWordNet(): Promise<void> {
  if (packs.size === 4) return Promise.resolve();
  if (!pending) {
    lastFailure = false;
    pending = Promise.all([nounUrl, verbUrl, adjectiveUrl, adverbUrl].map(async url => {
      if (packs.has(url)) return;
      const response = await fetch(url);
      if (!response.ok) throw new Error('English dictionary unavailable');
      const pack = await response.json() as WordNetPack;
      if (pack.version !== '3.0' || !['n', 'v', 'a', 'r'].includes(pack.pos) || !Array.isArray(pack.synsets) || !pack.entries) throw new Error('Invalid English dictionary');
      packs.set(url, pack);
    })).then(() => undefined).catch(error => { lastFailure = true; throw error; }).finally(() => { pending = undefined; });
  }
  return pending;
}
export async function waitForWordNet(): Promise<void> {
  try { await pending; } catch { /* The caller keeps curated and installed dictionary results. Status is exposed above. */ }
}
const posNames: Record<string, string> = { n: 'noun', v: 'verb', a: 'adjective', r: 'adverb' };
export function lookupWordNet(lemma: string): LexicalEntry | undefined {
  const senses = [];
  const pos = new Set<string>();
  for (const pack of packs.values()) {
    const indices = Object.hasOwn(pack.entries, lemma) ? pack.entries[lemma] : [];
    for (const [rank, index] of indices.entries()) {
      const [offset, words, definitionEn, examples] = pack.synsets[index];
      pos.add(posNames[pack.pos]);
      senses.push({ id: `wn3:${pack.pos}:${offset}`, definitionEn, examples, synonyms: words.filter(word => word.toLowerCase() !== lemma), pos: posNames[pack.pos], frequency: 1 / (rank + 1) });
    }
  }
  return senses.length ? { lemma, pos: [...pos], senses } : undefined;
}
