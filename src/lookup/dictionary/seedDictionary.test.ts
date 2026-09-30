import { describe, expect, it } from 'vitest';
import { irregularLemmaCandidates, lemmaCandidates, rankedLemmaCandidates, seedDictionary, strictIrregularLemmaCandidates } from './seedDictionary';
import { dictionaryRegistry } from './registry';
import type { DictionaryProvider } from './types';

describe('replaceable local dictionary', () => {
  it('resolves common inflections to a lemma', () => {
    expect(seedDictionary.lookup('accounts')?.entry.lemma).toBe('account');
    expect(seedDictionary.lookup('struggled')?.entry.lemma).toBe('struggle');
    expect(lemmaCandidates('maintaining')).toContain('maintain');
  });
  it('ranks regular and irregular candidates without inventing an entry', () => {
    for (const [surface, lemma] of [['delivered', 'deliver'], ['indicated', 'indicate'], ['studied', 'study'], ['stopped', 'stop'], ['making', 'make'], ['watches', 'watch'], ['written', 'write'], ['went', 'go']]) {
      expect(rankedLemmaCandidates(surface)).toContain(lemma);
    }
    expect(rankedLemmaCandidates('sing')[0]).toBe('sing');
    expect(rankedLemmaCandidates('red')[0]).toBe('red');
    expect(rankedLemmaCandidates('gas')[0]).toBe('gas');
  });
  it('resolves comparative and superlative forms without stripping real words', () => {
    for (const [surface, lemma] of [['smarter', 'smart'], ['smartest', 'smart'], ['larger', 'large'], ['largest', 'large'],
      ['heavier', 'heavy'], ['heaviest', 'heavy'], ['bigger', 'big'], ['biggest', 'big'], ['hotter', 'hot']]) {
      expect(rankedLemmaCandidates(surface)).toContain(lemma);
      expect(rankedLemmaCandidates(surface)[0]).toBe(surface);
    }
    for (const [word, forbidden] of [['computer', 'comput'], ['career', 'care'], ['water', 'wat'], ['paper', 'pap'], ['brother', 'broth']]) {
      expect(rankedLemmaCandidates(word)).toEqual([word]);
      expect(lemmaCandidates(word)).not.toContain(forbidden);
    }
  });
  it('resolves the required inflection and irregular matrix to a lemma', () => {
    for (const [surface, lemma] of [['studies', 'study'], ['carries', 'carry'], ['watches', 'watch'], ['represents', 'represent'],
      ['represented', 'represent'], ['indicated', 'indicate'], ['delivered', 'deliver'], ['running', 'run'], ['studying', 'study'],
      ['written', 'write'], ['wrote', 'write'], ['driven', 'drive'], ['drove', 'drive'], ['given', 'give'], ['gave', 'give'],
      ['taken', 'take'], ['took', 'take'], ['seen', 'see'], ['saw', 'see'], ['gone', 'go'], ['went', 'go'], ['found', 'find'],
      ['left', 'leave'], ['done', 'do'], ['did', 'do'], ['children', 'child'], ['men', 'man'], ['women', 'woman'],
      ['feet', 'foot'], ['teeth', 'tooth'], ['mice', 'mouse']]) {
      expect(rankedLemmaCandidates(surface)).toContain(lemma);
    }
    expect(strictIrregularLemmaCandidates('better')).toEqual(expect.arrayContaining(['good', 'well']));
    expect(strictIrregularLemmaCandidates('best')).toContain('good');
    expect(strictIrregularLemmaCandidates('worse')).toEqual(['bad']);
    expect(strictIrregularLemmaCandidates('worst')).toEqual(['bad']);
  });
  it('keeps the exact form as the first candidate so a real entry is never looked past', () => {
    expect(rankedLemmaCandidates('computer')[0]).toBe('computer');
    expect(seedDictionary.lookup('struggle')?.entry.lemma).toBe('struggle');
  });
  it('treats a surface that names an Object.prototype member as an ordinary miss', () => {
    for (const surface of ['constructor', 'tostring', 'valueof', 'hasownproperty', 'isprototypeof', 'propertyisenumerable', 'tolocalestring', '__proto__', 'proto']) {
      expect(strictIrregularLemmaCandidates(surface)).toEqual([]);
      expect(irregularLemmaCandidates(surface)).toEqual([]);
      expect(Array.isArray(rankedLemmaCandidates(surface))).toBe(true);
      expect(seedDictionary.lookup(surface)?.entry.lemma ?? null).toBeNull();
    }
    expect(strictIrregularLemmaCandidates('better')).toEqual(['good', 'well']);
    // `saw` is a verb form and a real word at once, so both tables contribute.
    expect(irregularLemmaCandidates('saw')).toEqual(expect.arrayContaining(['see']));
    expect(rankedLemmaCandidates('saw')).toContain('saw');
  });
  it('allows a language pack to override the seed provider', () => {
    const pack: DictionaryProvider = { id: 'test-pack', version: '1', lookup: (surface) => surface === 'reader' ? { surface, entry: { lemma: 'reader', partOfSpeech: 'noun', ipa: null, definitionEn: 'a person who reads', meaningsVi: ['người đọc'] } } : null };
    const unregister = dictionaryRegistry.register(pack);
    expect(dictionaryRegistry.lookup('reader')?.entry.meaningsVi).toEqual(['người đọc']);
    unregister();
    expect(dictionaryRegistry.lookup('reader')).toBeNull();
  });
});
