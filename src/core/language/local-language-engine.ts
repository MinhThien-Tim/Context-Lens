import { normalizeText } from '../cache';
import { LexicalEngine, normalizeLexical } from './lexicon';
import { PhraseDetector } from './phrases';
import { ContextWindowBuilder, SentenceEngine } from './sentence-engine';
import { SenseResolver } from './sense-resolver';
import type { LensResult, SelectionInput } from './types';

/** Local semantic foundation. No fetch, translation provider, or AI dependency. */
export class LocalLanguageEngine {
  constructor(
    private lexical = new LexicalEngine(),
    private phrases = new PhraseDetector(undefined, lexical),
    private sentences = new SentenceEngine(lexical, phrases),
    private resolver = new SenseResolver(lexical)
  ) {}
  async analyzeSelection(input: SelectionInput): Promise<LensResult> {
    const normalized = normalizeLexical(input.selectedText);
    const result: LensResult = {
      selection: { surface: input.selectedText, normalized, lemma: normalized },
      context: new ContextWindowBuilder().build(input), confidence: 0, providers: {}, cached: false, offline: true
    };
    if (!normalized || input.sourceLang.toLowerCase().split('-')[0] !== 'en') return result;
    const { analysis, cached } = await this.sentences.analyze(input.sentence, 'en');
    // Map the caller's raw offset onto the whitespace-normalized cache coordinate system.
    const start = input.selectionStart === undefined ? undefined : normalizeText(input.sentence.slice(0, input.selectionStart)).length + (/\s$/.test(input.sentence.slice(0, input.selectionStart)) ? 1 : 0);
    const selectedTokens = this.lexical.tokenize(input.selectedText).map(t => t.normalized);
    const occurrences = analysis.tokens.filter((token, i) => selectedTokens.length > 0 && selectedTokens.every((word, j) => analysis.tokens[i + j]?.normalized === word))
      .filter(token => start === undefined || token.start === start);
    const occurrence = occurrences.length === 1 ? occurrences[0] : undefined;
    const end = occurrence ? analysis.tokens[analysis.tokens.indexOf(occurrence) + selectedTokens.length - 1].end : undefined;
    const detected = occurrence && analysis.phrases.find(phrase => phrase.start <= occurrence.start && phrase.end >= end!);
    const canonical = detected?.canonical ?? this.phrases.normalizer.normalize(input.selectedText);
    const detectedEntry = detected ? this.lexical.lookup(detected.canonical) : undefined;
    const phraseEntry = this.phrases.entries.find(entry => entry.lemma === canonical) ?? (detectedEntry && detected ? { ...detectedEntry, type: detected.type } : undefined);
    const entry = phraseEntry ?? this.lexical.lookup(input.selectedText);
    const resolved = this.resolver.resolve({ selection: input.selectedText, lemma: entry?.lemma ?? normalized,
      canonicalPhrase: phraseEntry?.lemma, sentence: analysis.normalizedText, sentenceAnalysis: analysis,
      candidateSenses: entry?.senses ?? [] });
    const sense = resolved.selectedSense;
    return { ...result, selection: { ...result.selection, lemma: entry?.lemma ?? this.lexical.lemma(input.selectedText), pos: sense?.pos ?? entry?.pos.join(' / ') },
      phrase: phraseEntry ? { canonical: phraseEntry.lemma, type: phraseEntry.type } : undefined,
      english: sense?.definitionEn ? { definition: sense.definitionEn, contextualDefinition: sense.definitionEn, synonyms: sense.synonyms, examples: sense.examples } : undefined,
      vietnamese: sense?.meaningVi ? { meaning: sense.meaningVi, contextualMeaning: sense.meaningVi, senseAligned: true }
        : entry?.meaningsVi?.length ? { meaning: entry.meaningsVi.join(' / '), senseAligned: false } : undefined,
      grammar: entry ? { role: sense?.pos ?? entry.pos.join(' / '), pattern: phraseEntry?.lemma } : undefined,
      sense: sense ? { id: sense.id, alternatives: resolved.alternatives.map(s => s.id), reasons: resolved.reasons } : undefined,
      context: { ...result.context, sentenceTranslation: analysis.translationVi, simpleEnglish: analysis.simpleEnglish },
      confidence: resolved.confidence, providers: { lexical: 'local-dictionary', sentence: 'local', context: 'local-sense-resolver' }, cached
    };
  }
  async rememberSentenceTranslation(sentence: string, translatedText: string): Promise<void> {
    await this.sentences.rememberTranslation(sentence, translatedText);
  }
}
