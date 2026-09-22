import type { DictionarySenseResult } from '../lookup/types';

/** Pair legacy aggregate Vietnamese meanings with English senses for approachable bilingual display. */
export function pairDictionarySenses(senses: DictionarySenseResult[]): DictionarySenseResult[] {
  const pool = senses.flatMap(sense => sense.meaningsVi).filter((meaning, index, all) =>
    all.findIndex(item => normalize(item) === normalize(meaning)) === index);
  const used = new Set<string>();
  const definitions = senses.filter(sense => sense.definitionEn).map(sense => {
    const own = sense.meaningsVi.filter(meaning => !used.has(normalize(meaning)));
    const meaningsVi = own.length ? own : pool.find(meaning => !used.has(normalize(meaning))) ? [pool.find(meaning => !used.has(normalize(meaning)))!] : [];
    meaningsVi.forEach(meaning => used.add(normalize(meaning)));
    return { ...sense, meaningsVi };
  });
  const remaining = pool.filter(meaning => !used.has(normalize(meaning)));
  if (remaining.length) {
    const template = senses.find(sense => !sense.definitionEn) ?? senses.at(-1);
    if (template) definitions.push({ ...template, id: `${template.id}.remaining`, definitionEn: '', meaningsVi: remaining });
  }
  return definitions.length ? definitions : senses;
}

export function prioritizeDictionarySenses(senses: DictionarySenseResult[]): DictionarySenseResult[] {
  return senses.map((sense, index) => ({ sense, index })).sort((a, b) =>
    Number(b.sense.contextMatch) - Number(a.sense.contextMatch)
    || Number(Boolean(b.sense.definitionEn && b.sense.meaningsVi.length)) - Number(Boolean(a.sense.definitionEn && a.sense.meaningsVi.length))
    || a.index - b.index).map(item => item.sense);
}

export function compactDictionarySenses(senses: DictionarySenseResult[], limit = 2): DictionarySenseResult[] {
  const prioritized = prioritizeDictionarySenses(senses);
  const result: DictionarySenseResult[] = [];
  for (const sense of prioritized) {
    if (result.length >= limit) break;
    if (result.length === 0 || !result.some(item => item.pos === sense.pos) || sense.contextMatch) result.push(sense);
  }
  return result.slice(0, limit);
}

function normalize(value: string): string { return value.normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim(); }
