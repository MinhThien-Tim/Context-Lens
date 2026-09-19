import { describe, expect, it } from 'vitest';
import { lemmaCandidates, seedDictionary } from './seedDictionary';
import { dictionaryRegistry } from './registry';
import type { DictionaryProvider } from './types';

describe('replaceable local dictionary', () => {
  it('resolves common inflections to a lemma', () => {
    expect(seedDictionary.lookup('accounts')?.entry.lemma).toBe('account');
    expect(seedDictionary.lookup('struggled')?.entry.lemma).toBe('struggle');
    expect(lemmaCandidates('maintaining')).toContain('maintain');
  });
  it('allows a language pack to override the seed provider', () => {
    const pack: DictionaryProvider = { id: 'test-pack', version: '1', lookup: (surface) => surface === 'reader' ? { surface, entry: { lemma: 'reader', partOfSpeech: 'noun', ipa: null, definitionEn: 'a person who reads', meaningsVi: ['người đọc'] } } : null };
    const unregister = dictionaryRegistry.register(pack);
    expect(dictionaryRegistry.lookup('reader')?.entry.meaningsVi).toEqual(['người đọc']);
    unregister();
    expect(dictionaryRegistry.lookup('reader')).toBeNull();
  });
});
