import { db } from '../../db/database';
import { EngineCache, cacheKey, normalizeText, type ResultCache } from '../cache';
import { LexicalEngine } from './lexicon';
import { PhraseDetector } from './phrases';
import type { SelectionInput, SentenceAnalysis } from './types';
export { buildSentenceIndex } from '../../lookup/context';

export const ANALYSIS_VERSION = 1;
export class SentenceAnalysisCache extends EngineCache<SentenceAnalysis> {
  constructor(database = db, limit = 1000, enabled = true) { super(database.sentenceAnalyses, `sentence-v${ANALYSIS_VERSION}`, limit, enabled); }
}
export class SentenceEngine {
  private pending = new Map<string, Promise<{ analysis: SentenceAnalysis; cached: boolean }>>();
  constructor(private lexical = new LexicalEngine(), private phrases = new PhraseDetector(), private cache: ResultCache<SentenceAnalysis> = new SentenceAnalysisCache()) {}
  async rememberTranslation(sentence: string, translationVi: string): Promise<void> {
    const { analysis } = await this.analyze(sentence, 'en');
    await this.cache.put(analysis.id, { ...analysis, translationVi }, 'local', 'en');
  }
  async analyze(sentence: string, sourceLang = 'en'): Promise<{ analysis: SentenceAnalysis; cached: boolean }> {
    const normalizedText = normalizeText(sentence);
    const key = cacheKey([ANALYSIS_VERSION, sourceLang, normalizedText, this.lexical.version, this.phrases.version]);
    const existing = this.pending.get(key);
    if (existing) return structuredClone(await existing);
    const pending = (async () => {
      const stored = await this.cache.get(key);
      if (stored) return { analysis: { ...stored, lastUsedAt: Date.now() }, cached: true };
      const now = Date.now();
      const tokens = this.lexical.tokenize(normalizedText);
      const analysis: SentenceAnalysis = {
        id: key, sourceText: normalizedText, normalizedText, sourceLang, tokens,
        lemmas: tokens.map(token => token.lemma), phrases: this.phrases.detect(normalizedText),
        semanticHints: /\d+(?:\.\d+)?\s*(?:%|percent)/i.test(normalizedText) ? ['proportion'] : [],
        provider: 'local', createdAt: now, lastUsedAt: now, analysisVersion: ANALYSIS_VERSION
      };
      const simpleEnglish = normalizedText.replace(/\bnotwithstanding\b/gi, word => word[0] === 'N' ? 'Despite' : 'despite');
      if (simpleEnglish !== normalizedText) analysis.simpleEnglish = simpleEnglish;
      await this.cache.put(key, analysis, 'local', sourceLang);
      return { analysis, cached: false };
    })();
    this.pending.set(key, pending);
    try { return structuredClone(await pending); } finally { this.pending.delete(key); }
  }
}
export class ContextWindowBuilder {
  build(input: SelectionInput) {
    const needsPreviousSentence = /^(?:this|that|these|those|such|it|they)\b|\b(?:former|latter|this development|such a policy|the arrangement|these changes)\b/i.test(input.sentence.trim());
    return { sentence: input.sentence, previousSentence: needsPreviousSentence ? input.previousSentence : undefined, needsPreviousSentence };
  }
}
