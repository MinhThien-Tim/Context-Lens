export interface DictionaryEntry {
  lemma: string;
  partOfSpeech: string;
  ipa: string | null;
  definitionEn: string;
  meaningsVi: string[];
}

export interface DictionaryMatch {
  entry: DictionaryEntry;
  surface: string;
}

export interface DictionaryProvider {
  readonly id: string;
  readonly version: string;
  lookup(surface: string): DictionaryMatch | null;
}
