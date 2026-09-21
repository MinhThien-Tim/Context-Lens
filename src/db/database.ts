import Dexie, { type EntityTable, type Table } from 'dexie';
import type { DocumentSection } from '../documents/sections';
import type { LanguageMode, LookupResponse } from '../lookup/types';
import type { DocumentLocation } from '../documents/location';
import type { EngineCacheRecord } from '../core/cache';
import type { TranslationResult } from '../core/translation/types';
import type { ContextResult } from '../core/context/types';
import { explanationFromLookup } from '../core/context/adapter';
import type { SentenceAnalysis } from '../core/language/types';
import type { PdfStructuredPage } from '../documents/pdf/types';
import type { DictionaryEntry } from '../lookup/dictionary/types';

export interface DocumentRecord {
  toc?: DocumentSection[];
  id: string;
  title: string;
  content: string;
  kind: 'text' | 'markdown' | 'article' | 'pdf' | 'epub' | 'docx';
  data?: Blob;
  safeHtml?: string;
  pageOffsets?: number[];
  pdfPages?: PdfStructuredPage[];
  highlights?: ReaderHighlight[];
  chapterOffsets?: number[];
  source?: { url?: string; author?: string; siteName?: string };
  createdAt: number;
  updatedAt: number;
  location: DocumentLocation;
  /** Version 1 compatibility. Removed after all existing databases migrate. */
  lastPosition?: number;
}

export interface ReaderHighlight {
  id: string;
  startOffset: number;
  endOffset: number;
  color: 'yellow' | 'pink' | 'blue';
  style?: 'highlight' | 'underline';
  createdAt: number;
}

export interface CachedLookupRecord {
  key: string;
  contextKey?: string;
  result: LookupResponse;
  createdAt: number;
  accessedAt: number;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

export interface VocabularyRecord {
  id: string;
  lemma: string;
  surface: string;
  pos: string | null;
  ipa: string | null;
  contextualMeaning: string;
  meaningVi: string[];
  lexicalUnit: string | null;
  originalSentence: string;
  source: { document: string; documentId?: string; location: string };
  createdAt: number;
}

export interface DictionaryPackRecord {
  id: string;
  name: string;
  version: string;
  license: { name: string; url: string; attribution: string };
  entries: DictionaryEntry[];
  installedAt: number;
}
export interface NoteRecord {
  structuredLocation?: DocumentLocation;
  id: string;
  documentId: string;
  documentTitle: string;
  text: string;
  selectedText?: string;
  sentence?: string;
  location: string;
  createdAt: number;
  updatedAt: number;
}

export class ContextLensDatabase extends Dexie {
  documents!: EntityTable<DocumentRecord, 'id'>;
  lookups!: EntityTable<CachedLookupRecord, 'key'>;
  settings!: EntityTable<SettingRecord, 'key'>;
  vocabulary!: EntityTable<VocabularyRecord, 'id'>;
  dictionaryPacks!: EntityTable<DictionaryPackRecord, 'id'>;
  translations!: Table<EngineCacheRecord<TranslationResult>, string>;
  contexts!: Table<EngineCacheRecord<ContextResult>, string>;
  notes!: EntityTable<NoteRecord, 'id'>;
  sentenceAnalyses!: Table<EngineCacheRecord<SentenceAnalysis>, string>;

  constructor(name = 'context-lens') {
    super(name);
    this.version(1).stores({
      documents: 'id, updatedAt',
      lookups: 'key, accessedAt',
      settings: 'key',
      vocabulary: 'id, lemma, createdAt'
    });
    this.version(2).stores({
      documents: 'id, updatedAt',
      lookups: 'key, accessedAt',
      settings: 'key',
      vocabulary: 'id, lemma, createdAt'
    }).upgrade(async (transaction) => {
      await transaction.table<DocumentRecord>('documents').toCollection().modify((document) => {
        if (!document.location) {
          document.location = {
            kind: 'text',
            scrollY: document.lastPosition ?? 0,
            progress: 0,
            updatedAt: Date.now()
          };
        }
        delete document.lastPosition;
      });
    });
    this.version(3).stores({
      documents: 'id, updatedAt',
      lookups: 'key, contextKey, accessedAt',
      settings: 'key',
      vocabulary: 'id, lemma, createdAt'
    });
    this.version(4).stores({
      documents: 'id, kind, updatedAt',
      lookups: 'key, contextKey, accessedAt',
      settings: 'key',
      vocabulary: 'id, lemma, createdAt'
    });
    this.version(5).stores({
      documents: 'id, kind, updatedAt',
      lookups: 'key, contextKey, accessedAt',
      settings: 'key',
      vocabulary: 'id, lemma, createdAt',
      dictionaryPacks: 'id, installedAt'
    });
    // Keep legacy lookups readable; new context keys have stricter identity semantics.
    this.version(6).stores({
      translations: 'key, lastUsedAt, provider, languagePair, hits',
      contexts: 'key, lastUsedAt, provider, languagePair, hits'
    });
    this.version(7).stores({
      notes: 'id, documentId, updatedAt, [documentId+updatedAt]'
    });
    this.version(8).stores({}).upgrade(async transaction => {
      await transaction.table<EngineCacheRecord<ContextResult | { result: LookupResponse; provider: string; model?: string; cached?: boolean }>>('contexts').toCollection().modify(record => {
        const legacy = record.result as { result?: LookupResponse; provider?: string; model?: string; cached?: boolean };
        if (legacy.result?.deep) {
          record.result = { explanation: explanationFromLookup(legacy.result), provider: legacy.provider ?? record.provider, model: legacy.model, cached: legacy.cached };
          record.version = 'context-v4';
        }
      });
    });
    this.version(9).stores({ sentenceAnalyses: 'key, lastUsedAt, provider, languagePair, hits' });
    // Optional TOC and note anchors preserve legacy records without inventing locations.
    this.version(10).stores({});
  }
}

export const db = new ContextLensDatabase();

export interface AppPreferences {
  languageMode: LanguageMode;
  fontSize: number;
  lineHeight: number;
  fontFamily: 'serif' | 'sans';
  theme: 'light' | 'dark' | 'system';
  pdfViewMode: 'original' | 'reading';
  pdfMobileViewMode: 'original' | 'reading';
  pdfZoomMode: 'fit-width' | 'fit-page' | 'custom';
}

export const defaultPreferences: AppPreferences = {
  languageMode: 'bilingual',
  fontSize: 19,
  lineHeight: 1.75,
  fontFamily: 'serif',
  theme: 'system',
  pdfViewMode: 'original',
  pdfMobileViewMode: 'reading',
  pdfZoomMode: 'fit-page'
};

export async function loadPreferences(): Promise<AppPreferences> {
  const record = await db.settings.get('reader-preferences');
  return { ...defaultPreferences, ...(typeof record?.value === 'object' ? record.value : {}) };
}

export async function savePreferences(value: AppPreferences): Promise<void> {
  await db.settings.put({ key: 'reader-preferences', value });
}
