import type { DictionarySenseResult } from '../lookup/types';

/** Deduplicate only source-linked meanings. Never invent bilingual sense pairs. */
export function pairDictionarySenses(senses: DictionarySenseResult[]): DictionarySenseResult[] {
  return senses.map(sense => ({ ...sense, meaningsVi: sense.meaningsVi.filter((meaning, index, all) =>
    all.findIndex(item => normalize(item) === normalize(meaning)) === index) }));
}

export function prioritizeDictionarySenses(senses: DictionarySenseResult[], contextPos?: string): DictionarySenseResult[] {
  return senses.map((sense, index) => ({ sense, index })).sort((a, b) =>
    Number(b.sense.contextMatch) - Number(a.sense.contextMatch)
    || Number(b.sense.pos === contextPos) - Number(a.sense.pos === contextPos)
    || a.index - b.index).map(item => item.sense);
}

export function compactDictionarySenses(senses: DictionarySenseResult[], contextPos?: string): DictionarySenseResult[] {
  const prioritized = prioritizeDictionarySenses(senses, contextPos);
  if (prioritized.length <= 4) return prioritized;
  if (contextPos) {
    const matching = prioritized.filter(sense => sense.pos === contextPos);
    if (matching.length >= 3) return matching.slice(0, 3);
  }
  const matched = prioritized.find(sense => sense.contextMatch);
  if (matched) {
    const contextual = prioritized.filter(sense => sense.pos === matched.pos).slice(0, 4);
    if (contextual.length >= 2) return contextual;
    return [...contextual, ...prioritized.filter(sense => sense.pos !== matched.pos).slice(0, 2 - contextual.length)];
  }
  return prioritized.slice(0, 3);
}

function normalize(value: string): string { return value.normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim(); }
