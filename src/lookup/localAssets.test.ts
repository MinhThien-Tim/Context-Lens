import { expect, it, vi } from 'vitest';

vi.mock('./dictionary/packs', () => ({ loadBundledDictionary: vi.fn() }));
vi.mock('../core/language/wordnet', () => ({ loadWordNet: vi.fn(), wordNetStatus: () => 'loading' }));

it('publishes bundled meanings before WordNet finishes and shares both loads', async () => {
  const { loadBundledDictionary } = await import('./dictionary/packs');
  const { loadWordNet } = await import('../core/language/wordnet');
  let dictionaryReady!: () => void; let wordnetReady!: () => void;
  vi.mocked(loadBundledDictionary).mockImplementation(() => new Promise<void>(done => { dictionaryReady = done; }));
  vi.mocked(loadWordNet).mockImplementation(() => new Promise<void>(done => { wordnetReady = done; }));
  const { ensureLocalDictionaryAssets } = await import('./localAssets');
  const first = vi.fn(); const second = vi.fn(); let complete = false;
  const a = ensureLocalDictionaryAssets(first).then(() => { complete = true; });
  const b = ensureLocalDictionaryAssets(second);
  dictionaryReady(); await Promise.resolve(); await Promise.resolve();
  expect(first).toHaveBeenCalledOnce(); expect(second).toHaveBeenCalledOnce(); expect(complete).toBe(false);
  expect(loadBundledDictionary).toHaveBeenCalledOnce(); expect(loadWordNet).toHaveBeenCalledOnce();
  wordnetReady(); await Promise.all([a, b]); expect(complete).toBe(true);
});
