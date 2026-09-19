import { describe, expect, it } from 'vitest';
import { localLookup } from './localDictionary';
import type { LookupRequest } from './types';

const request = (selection: string, sentence: string): LookupRequest => ({ selection, selection_type: 'word', sentence, previous_sentence: null, next_sentence: null, language_mode: 'bilingual', learner: { native_language: 'vi', english_level: 'B2-C1' }, options: { include_ipa: true, include_contrast: true, include_grammar: true, include_sentence_translation: true } });

describe('offline fallback and lexical units', () => {
  it('recognizes make up one’s mind instead of explaining mind alone', () => {
    expect(localLookup(request('mind', 'He finally made up his own mind.')).quick.lexical_unit?.text).toBe("make up one's mind");
  });
  it('distinguishes account of from account for', () => {
    expect(localLookup(request('Accounts', 'Accounts of what happened to the ship vary.')).quick.lexical_unit?.type).toBe('noun phrase');
    expect(localLookup(request('account', 'Several factors account for the decline.')).quick.lexical_unit?.type).toBe('phrasal verb');
  });
  it('always returns a renderable fallback for unknown words', () => {
    expect(localLookup(request('unlisted', 'An unlisted word appears.')).source).toBe('offline');
  });
});
