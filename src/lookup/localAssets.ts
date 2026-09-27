import { loadBundledDictionary } from './dictionary/packs';
import { loadWordNet, wordNetStatus } from '../core/language/wordnet';

export type LocalAssetStatus = 'not-loaded' | 'loading' | 'ready' | 'partial' | 'unavailable';
let pending: Promise<void> | undefined;
let dictionaryPending: Promise<void> | undefined;
let dictionaryReady = false;
let failed = false;

export function localAssetStatus(): LocalAssetStatus {
  if (dictionaryReady && wordNetStatus() === 'ready') return 'ready';
  if (pending) return 'loading';
  if (dictionaryReady || wordNetStatus() === 'ready') return 'partial';
  return failed ? 'unavailable' : 'not-loaded';
}

/** One readiness barrier for every local consumer. Individual sources may still degrade independently. */
export function ensureLocalDictionaryAssets(onDictionaryReady?: () => void): Promise<void> {
  if (localAssetStatus() === 'ready') return Promise.resolve();
  if (!pending) {
    failed = false;
    dictionaryPending = loadBundledDictionary().then(() => { dictionaryReady = true; });
    pending = Promise.allSettled([
      dictionaryPending,
      loadWordNet()
    ]).then(results => {
      if (results.every(result => result.status === 'rejected')) {
        failed = true;
        throw new Error('Local dictionary assets unavailable');
      }
    }).finally(() => { pending = undefined; });
  }
  // Publish the dictionary independently of the larger WordNet asset barrier.
  return onDictionaryReady
    ? Promise.all([pending, dictionaryPending!.then(onDictionaryReady, () => {})]).then(() => {})
    : pending;
}
