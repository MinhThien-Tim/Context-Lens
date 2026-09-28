export type DictionaryQuality = 'reviewed' | 'curated' | 'imported';
export interface SenseAlignment {
  kind: 'explicit' | 'reviewed' | 'identical-gloss' | 'inferred' | 'translated-definition' | 'unresolved';
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  /** Derived display translations must never become independent resolver evidence. */
  dependsOnSenseId?: string;
}
export type DictionaryReviewStatus = 'imported' | 'cross-checked' | 'editor-reviewed' | 'human-reviewed';

export interface DictionaryProvenance {
  sourceId: string;
  sourceUrl: string;
  sourceRevision: string;
  license: string;
  retrievedAt: string;
  reviewStatus: DictionaryReviewStatus;
  reviewerKind?: 'human' | 'ai-assisted';
  reviewedBy?: string;
  reviewedAt?: string;
  senseIds?: string[];
  notes?: string;
}

export interface DictionarySenseTranslation {
  id: string;
  definitionEn: string;
  meaningsVi: string[];
  partOfSpeech?: string;
  provenance?: DictionaryProvenance;
}

export interface VietnameseReference {
  text: string;
  target: string;
  status: 'resolved' | 'unresolved';
  reason?: 'missing' | 'cycle' | 'depth';
}

export interface DictionaryEntry {
  /** Compact source definition ID, POS, gloss index, optional example. */
  viSenses?: [number, string, number, string?][];
  lemma: string;
  partOfSpeech: string;
  ipa: string | null;
  definitionEn: string;
  meaningsVi: string[];
  baseLemma?: string;
  inflection?: InflectionType;
  provenance?: DictionaryProvenance;
  senses?: DictionarySenseTranslation[];
  vietnameseReferences?: VietnameseReference[];
}

export type InflectionType = 'past' | 'past-participle' | 'present-participle' | 'third-person' | 'plural' | 'comparative' | 'superlative' | 'variant';

export interface DictionaryMatch {
  entry: DictionaryEntry;
  surface: string;
  surfaceEntry?: DictionaryEntry;
  morphology?: { baseLemma: string; inflection: InflectionType };
}

export interface SourcedDictionaryMatch extends DictionaryMatch {
  providerId: string;
  providerVersion: string;
  quality: DictionaryQuality;
}

export interface DictionaryProvider {
  readonly id: string;
  readonly version: string;
  readonly quality?: DictionaryQuality;
  lookup(surface: string): DictionaryMatch | null;
  lookupReverse?(surface: string): DictionaryMatch | null;
}
