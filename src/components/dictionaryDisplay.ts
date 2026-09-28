import type { DictionarySenseResult, LookupResponse } from '../lookup/types';
import { senseVietnameseMeanings } from '../core/language/sense-meanings';

/** Keep aggregate glosses separate, including when an AI result omits the local dictionary. */
export function unpairedVietnameseMeanings(...results: LookupResponse[]): string[] {
  const linked = new Set(results.flatMap(result => result.dictionary?.senses.flatMap(senseVietnameseMeanings) ?? []).map(normalize));
  const glosses = results.flatMap(result => {
    const unpaired = result.dictionary?.unpairedMeaningsVi ?? [];
    return unpaired.length || !result.dictionary || result.dictionary.senses.some(sense => senseVietnameseMeanings(sense).length)
      ? unpaired : result.quick.meaning_vi;
  });
  return glosses.filter((meaning, index, all) => meaning.trim() && !linked.has(normalize(meaning))
    && all.findIndex(item => normalize(item) === normalize(meaning)) === index);
}

/** Deduplicate only source-linked meanings. Never invent bilingual sense pairs. */
export function pairDictionarySenses(senses: DictionarySenseResult[]): DictionarySenseResult[] {
  return senses.map(sense => ({ ...sense, meaningsVi: senseVietnameseMeanings(sense) }));
}

export function prioritizeDictionarySenses(senses: DictionarySenseResult[], contextPos?: string): DictionarySenseResult[] {
  return senses.map((sense, index) => ({ sense, index })).sort((a, b) =>
    Number(b.sense.contextMatch) - Number(a.sense.contextMatch)
    || Number(b.sense.pos === contextPos) - Number(a.sense.pos === contextPos)
    || a.index - b.index).map(item => item.sense);
}

export function compactDictionarySenses(senses: DictionarySenseResult[], contextPos?: string, ambiguous = false): DictionarySenseResult[] {
  const prioritized = prioritizeDictionarySenses(senses, contextPos);
  const positions = [...new Set(prioritized.map(sense => sense.pos))];
  const primaryPos = contextPos && positions.includes(contextPos) ? contextPos : positions[0];
  // Preserve every POS; leave one extra ordinary meaning in the primary group.
  return positions.flatMap(pos => prioritized.filter(sense => sense.pos === pos).slice(0, ambiguous ? (contextPos ? 4 : 2) : pos === primaryPos ? 2 : 1))
    .slice(0, ambiguous && !contextPos ? 6 : undefined);
}

function normalize(value: string): string { return value.normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim(); }
