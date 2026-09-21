export interface DictionaryEntry {
  lemma: string;
  partOfSpeech: string;
  ipa: string | null;
  definitionEn: string;
  meaningsVi: string[];
  baseLemma?: string;
  inflection?: InflectionType;
}

export type InflectionType = 'past' | 'past-participle' | 'present-participle' | 'third-person' | 'plural' | 'comparative' | 'superlative' | 'variant';

export interface DictionaryMatch {
  entry: DictionaryEntry;
  surface: string;
  surfaceEntry?: DictionaryEntry;
  morphology?: { baseLemma: string; inflection: InflectionType };
}

export interface DictionaryProvider {
  readonly id: string;
  readonly version: string;
  lookup(surface: string): DictionaryMatch | null;
  lookupReverse?(surface: string): DictionaryMatch | null;
}
