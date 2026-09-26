import type { DictionaryEntry, DictionaryMatch, DictionaryProvider } from './types';

const entries: Record<string, DictionaryEntry> = {
  prerequisite: { lemma: 'prerequisite', partOfSpeech: 'noun', ipa: '/ˌpriːˈrekwɪzɪt/', definitionEn: 'something required before something else can happen', meaningsVi: ['điều kiện tiên quyết'] },
  account: { lemma: 'account', partOfSpeech: 'noun / verb', ipa: '/əˈkaʊnt/', definitionEn: 'a report of an event; or to explain or cause something', meaningsVi: ['lời kể', 'giải thích'] },
  confidence: { lemma: 'confidence', partOfSpeech: 'noun', ipa: '/ˈkɒnfɪdəns/', definitionEn: 'trust or belief that someone or something will succeed', meaningsVi: ['lòng tin', 'sự tin tưởng'] },
  maintain: { lemma: 'maintain', partOfSpeech: 'verb', ipa: '/meɪnˈteɪn/', definitionEn: 'to keep something at the same level or condition', meaningsVi: ['duy trì', 'giữ vững'] },
  mind: { lemma: 'mind', partOfSpeech: 'noun', ipa: '/maɪnd/', definitionEn: 'the part of a person that thinks and decides', meaningsVi: ['tâm trí', 'ý định'] },
  struggle: { lemma: 'struggle', partOfSpeech: 'verb', ipa: '/ˈstrʌɡl/', definitionEn: 'to try very hard to do something difficult', meaningsVi: ['chật vật', 'gặp khó khăn'] }
};

export class SeedDictionary implements DictionaryProvider {
  readonly id = 'context-lens-seed';
  readonly version = '1';
  readonly quality = 'curated' as const;

  lookup(surface: string): DictionaryMatch | null {
    const normalized = surface.toLocaleLowerCase().trim().replace(/[^a-z' -]/g, '').replace(/\s+/g, ' ');
    for (const candidate of rankedLemmaCandidates(normalized)) {
      const entry = entries[candidate];
      if (entry) return { entry, surface };
    }
    return null;
  }
  lookupReverse(surface: string): DictionaryMatch | null {
    const normalized = normalizeVietnamese(surface);
    const entry = Object.values(entries).find(candidate => candidate.meaningsVi.some(meaning => normalizeVietnamese(meaning) === normalized));
    return entry ? { entry, surface } : null;
  }
}

function normalizeVietnamese(value: string): string { return value.normalize('NFC').toLocaleLowerCase('vi').trim().replace(/\s+/g, ' '); }

export function lemmaCandidates(word: string): string[] {
  const candidates = [word];
  if (word.endsWith('ies') && word.length > 4) candidates.push(`${word.slice(0, -3)}y`);
  if (word.endsWith('es') && word.length > 3) candidates.push(word.slice(0, -2));
  if (word.endsWith('s') && word.length > 3) candidates.push(word.slice(0, -1));
  if (word.endsWith('ied') && word.length > 4) candidates.push(`${word.slice(0, -3)}y`);
  if (word.endsWith('ed') && word.length > 3) {
    candidates.push(word.slice(0, -1));
    candidates.push(word.slice(0, -2));
    candidates.push(...yStem(word.slice(0, -2)));
    if (doublesFinalConsonant(word.slice(0, -2))) candidates.push(word.slice(0, -3));
  }
  if (word.endsWith('ing') && word.length > 5) {
    candidates.push(`${word.slice(0, -3)}e`);
    candidates.push(word.slice(0, -3));
    candidates.push(...yStem(word.slice(0, -3)));
    if (doublesFinalConsonant(word.slice(0, -3))) candidates.push(word.slice(0, -4));
  }
  candidates.push(...degreeCandidates(word));
  return [...new Set(candidates)];
}

/** A doubled final consonant is a spelling artefact of `-ed`/`-ing`/`-er`: `stopped` → `stop`. */
function doublesFinalConsonant(stem: string): boolean { return /([bcdfghjklmnpqrstvwxyz])\1$/.test(stem); }

/** A final `y` surfaces as `i` before `-ing`/`-ed`: `studying` → `study`, `carried` → `carry`. */
function yStem(stem: string): string[] {
  return stem.endsWith('i') && /[bcdfghjklmnpqrstvxzw]$/.test(stem.slice(0, -1)) ? [`${stem.slice(0, -1)}y`] : [];
}

/**
 * `-er`/`-est` that belongs to the word instead of a comparative/superlative suffix.
 * Rule-based stem stripping cannot separate these shapes (Porter's own method reduces
 * `career` to `care`), so the small set of real words it would damage is listed instead.
 */
const nonDegreeWords = new Set(['after', 'answer', 'banker', 'bother', 'brother', 'butter', 'cancer', 'career', 'center', 'centre',
  'chamber', 'chapter', 'character', 'computer', 'corner', 'cover', 'danger', 'discover', 'earnest', 'father', 'finger', 'flower',
  'forest', 'former', 'inner', 'interest', 'latter', 'leader', 'letter', 'manager', 'manner', 'master', 'matter', 'member', 'mother',
  'number', 'officer', 'order', 'outer', 'owner', 'painter', 'paper', 'partner', 'player', 'powder', 'power', 'printer', 'proper',
  'reader', 'rather', 'reporter', 'runner', 'senior', 'sister', 'soldier', 'speaker', 'summer', 'teacher', 'tower', 'upper', 'water',
  'weather', 'winter', 'worker', 'writer']);

/**
 * Comparative/superlative bases for one word: `-ier/-iest` restore `y`, `-er/-est` are
 * stripped, a doubled final consonant is undone (`hotter` → `hot`), and a stem that lost
 * its silent `e` gets it back (`larger` → `large`). Candidates are guesses only; a
 * provider still has to contain the result.
 */
function degreeCandidates(word: string): string[] {
  if (!/^[a-z'-]+$/.test(word) || nonDegreeWords.has(word)) return [];
  const bases = [
    ...(word.endsWith('iest') ? [`${word.slice(0, -4)}y`] : []),
    ...(word.endsWith('ier') ? [`${word.slice(0, -3)}y`] : []),
    ...(word.endsWith('est') ? [word.slice(0, -3)] : []),
    ...(word.endsWith('er') ? [word.slice(0, -2)] : [])
  ].filter(base => base.length >= 3);
  return bases.flatMap(base => [
    base,
    ...(doublesFinalConsonant(base) ? [base.slice(0, -1)] : base.endsWith('e') ? [] : [`${base}e`])
  ]);
}

/** Irregular forms that no rule can reach. Lemmas are ordered by usefulness. */
const irregularLemmas: Record<string, string[]> = {
  // verbs the regular rules already handle, kept here so both engines share one table
  made: ['make'], makes: ['make'], making: ['make'],
  ran: ['run'], running: ['run'],
  was: ['be'], were: ['be'], is: ['be'], are: ['be'], been: ['be'],
  had: ['have'], having: ['have'],
  // high-value irregular verbs
  written: ['write'], wrote: ['write'], writing: ['write'],
  driven: ['drive'], drove: ['drive'], driving: ['drive'],
  given: ['give'], gave: ['give'], giving: ['give'],
  taken: ['take'], took: ['take'], taking: ['take'],
  seen: ['see'], saw: ['see'], seeing: ['see'],
  gone: ['go'], went: ['go'], going: ['go'],
  // irregular plurals
  children: ['child'], men: ['man'], women: ['woman'],
  feet: ['foot'], teeth: ['tooth'], mice: ['mouse'],
  dying: ['die'], lying: ['lie'], tying: ['tie'], did: ['do'],
  // irregular degrees
  better: ['good', 'well'], best: ['good', 'well'], worse: ['bad'], worst: ['bad']
};

/**
 * Irregular forms that are also ordinary words (`a saw`, `the left`). They may only be
 * used when the exact form has nothing usable, so a rich exact entry stays the answer.
 */
const irregularWordOverlaps: Record<string, string[]> = { saw: ['see'], left: ['leave'], found: ['find'], done: ['do'] };

/** Irregular lemmas that outrank the exact form, because the surface is never a word of its own. */
export function strictIrregularLemmaCandidates(word: string): string[] { return irregularLemmas[word] ?? []; }

/** Every irregular lemma for one form, in preference order. */
export function irregularLemmaCandidates(word: string): string[] { return [...strictIrregularLemmaCandidates(word), ...(irregularWordOverlaps[word] ?? [])]; }

/** Ordered guesses only. Providers must still require that the candidate exists. */
export function rankedLemmaCandidates(word: string): string[] {
  return [...new Set([word, ...irregularLemmaCandidates(word), ...lemmaCandidates(word)].filter((value): value is string => Boolean(value)))];
}

export const seedDictionary = new SeedDictionary();
