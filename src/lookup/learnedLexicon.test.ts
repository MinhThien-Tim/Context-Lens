import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../db/database';
import { readLearnedLexeme, storeLearnedLexeme } from './learnedLexicon';

describe('versioned learned lexicon', () => {
  afterEach(() => db.learnedLexicon.clear());
  it('reuses only results produced by the same dictionary version', async () => {
    const entry = { lemma: 'deliver', pos: ['verb'], senses: [{ id: 'deliver.test', definitionEn: 'to take something somewhere' }],
      meaningsVi: ['giao'], sources: { english: ['wordnet-3.0'], vietnamese: ['bundled.test'] } };
    await storeLearnedLexeme('delivered', 'Delivered', entry, 'v1');
    expect(await readLearnedLexeme('delivered', 'v1')).toMatchObject({ lemma: 'deliver', meaningsVi: ['giao'] });
    expect(await readLearnedLexeme('delivered', 'v2')).toBeUndefined();
  });
});
