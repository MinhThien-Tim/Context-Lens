import type { DictionaryEntry, DictionaryMatch, DictionaryProvider } from './types';

const entries: Record<string, DictionaryEntry> = {
  account: { lemma: 'account', partOfSpeech: 'noun / verb', ipa: '/əˈkaʊnt/', definitionEn: 'a report of an event; or to explain or cause something', meaningsVi: ['lời kể', 'giải thích'] },
  confidence: { lemma: 'confidence', partOfSpeech: 'noun', ipa: '/ˈkɒnfɪdəns/', definitionEn: 'trust or belief that someone or something will succeed', meaningsVi: ['lòng tin', 'sự tin tưởng'] },
  maintain: { lemma: 'maintain', partOfSpeech: 'verb', ipa: '/meɪnˈteɪn/', definitionEn: 'to keep something at the same level or condition', meaningsVi: ['duy trì', 'giữ vững'] },
  mind: { lemma: 'mind', partOfSpeech: 'noun', ipa: '/maɪnd/', definitionEn: 'the part of a person that thinks and decides', meaningsVi: ['tâm trí', 'ý định'] },
  struggle: { lemma: 'struggle', partOfSpeech: 'verb', ipa: '/ˈstrʌɡl/', definitionEn: 'to try very hard to do something difficult', meaningsVi: ['chật vật', 'gặp khó khăn'] }
};

export class SeedDictionary implements DictionaryProvider {
  readonly id = 'context-lens-seed';
  readonly version = '1';

  lookup(surface: string): DictionaryMatch | null {
    const normalized = surface.toLocaleLowerCase().replace(/[^a-z'-]/g, '');
    for (const candidate of lemmaCandidates(normalized)) {
      const entry = entries[candidate];
      if (entry) return { entry, surface };
    }
    return null;
  }
}

export function lemmaCandidates(word: string): string[] {
  const candidates = [word];
  if (word.endsWith('ies') && word.length > 4) candidates.push(`${word.slice(0, -3)}y`);
  if (word.endsWith('es') && word.length > 3) candidates.push(word.slice(0, -2));
  if (word.endsWith('s') && word.length > 3) candidates.push(word.slice(0, -1));
  if (word.endsWith('ied') && word.length > 4) candidates.push(`${word.slice(0, -3)}y`);
  if (word.endsWith('ed') && word.length > 3) {
    candidates.push(word.slice(0, -2));
    candidates.push(word.slice(0, -1));
  }
  if (word.endsWith('ing') && word.length > 5) {
    candidates.push(word.slice(0, -3));
    candidates.push(`${word.slice(0, -3)}e`);
  }
  return [...new Set(candidates)];
}

export const seedDictionary = new SeedDictionary();
