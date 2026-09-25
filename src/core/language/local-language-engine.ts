import { normalizeText } from '../cache';
import { LexicalEngine, normalizeLexical } from './lexicon';
import { PhraseDetector } from './phrases';
import { ContextWindowBuilder, SentenceEngine } from './sentence-engine';
import { SenseResolver } from './sense-resolver';
import type { LensResult, SelectionInput } from './types';
import { compoundCandidates, normalizeSelection, phraseCandidates, reconstructToken } from '../../lookup/normalization';
import { dictionaryRegistry } from '../../lookup/dictionary/registry';

/** Local semantic foundation. No fetch, translation provider, or AI dependency. */
export class LocalLanguageEngine {
  constructor(
    private lexical = new LexicalEngine(),
    private phrases = new PhraseDetector(undefined, lexical),
    private sentences = new SentenceEngine(lexical, phrases),
    private resolver = new SenseResolver(lexical)
  ) {}
  async analyzeSelection(input: SelectionInput): Promise<LensResult> {
    const initial = normalizeSelection(input.selectedText).normalized;
    const repair = reconstructToken(initial, input.sentence, input.selectionStart);
    const lookupText = repair?.token ?? initial;
    const normalized = normalizeLexical(lookupText);
    const result: LensResult = {
      selection: { surface: input.selectedText, normalized, lemma: normalized, reconstructedFrom: repair?.original, reconstructedToken: repair?.token },
      context: new ContextWindowBuilder().build(input), confidence: 0, providers: {}, cached: false, offline: true
    };
    if (!normalized || input.sourceLang.toLowerCase().split('-')[0] !== 'en') return result;
    await this.lexical.prime(lookupText);
    const { analysis, cached } = await this.sentences.analyze(input.sentence, 'en');
    // Map the caller's raw offset onto the whitespace-normalized cache coordinate system.
    const rawStart = repair?.start ?? input.selectionStart;
    const start = rawStart === undefined ? undefined : normalizeText(input.sentence.slice(0, rawStart)).length + (/\s$/.test(input.sentence.slice(0, rawStart)) ? 1 : 0);
    const selectedTokens = this.lexical.tokenize(lookupText).map(t => t.normalized);
    const occurrences = analysis.tokens.filter((token, i) => selectedTokens.length > 0 && selectedTokens.every((word, j) => analysis.tokens[i + j]?.normalized === word))
      .filter(token => start === undefined || token.start === start);
    const occurrence = occurrences.length === 1 ? occurrences[0] : undefined;
    const end = occurrence ? analysis.tokens[analysis.tokens.indexOf(occurrence) + selectedTokens.length - 1].end : undefined;
    const detected = occurrence && analysis.phrases.find(phrase => phrase.start <= occurrence.start && phrase.end >= end!);
    const canonical = detected?.canonical ?? this.phrases.normalizer.normalize(lookupText);
    const detectedEntry = detected ? this.lexical.lookup(detected.canonical) : undefined;
    const phraseEntry = this.phrases.entries.find(entry => entry.lemma === canonical) ?? (detectedEntry && detected ? { ...detectedEntry, type: detected.type } : undefined);
    const compounds = compoundCandidates(canonical, candidate => Boolean(this.lexical.lookup(candidate)));
    const subphrases = [...new Set(compounds.flatMap(phraseCandidates).filter(candidate => !compounds.includes(candidate)))]
      .sort((a, b) => b.split(' ').length - a.split(' ').length);
    const candidates = [...compounds, ...subphrases];
    // Keep the surface lookup first so morphology metadata is not lost when a base candidate also matches.
    const directEntry = this.lexical.lookup(lookupText);
    const candidateMatch = candidates.map(candidate => ({ candidate, entry: this.lexical.lookup(candidate) })).find(match => match.entry);
    const entry = phraseEntry ?? directEntry ?? candidateMatch?.entry;
    if (entry) this.lexical.remember(lookupText, entry);
    const resolved = this.resolver.resolve({ selection: lookupText, lemma: entry?.lemma ?? normalized,
      canonicalPhrase: phraseEntry?.lemma, sentence: analysis.normalizedText, sentenceAnalysis: analysis,
      selectionStart: occurrence?.start, pos: occurrence?.pos, sentenceTranslationVi: analysis.translationVi,
      candidateSenses: entry?.senses ?? [] });
    const sense = resolved.selectedSense;
    const hasEnglish = Boolean(sense?.definitionEn);
    const hasVietnamese = Boolean(sense?.meaningVi || entry?.meaningsVi?.length);
    const status = repair && entry ? 'reconstructed' : !entry ? 'fragment-or-unknown'
      : entry.morphology ? 'base-form' : hasEnglish && hasVietnamese ? 'complete' : 'partial';
    const resolvedPhrase = phraseEntry ?? (entry?.lemma.includes(' ') ? { ...entry, type: 'fixed expression' as const } : undefined);
    const matchedText = phraseEntry?.lemma ?? (directEntry ? lookupText : candidateMatch?.candidate);
    const matchType = phraseEntry ? 'phrase' : directEntry ? (directEntry.morphology ? 'lemma' : 'exact')
      : matchedText?.includes(' ') ? (matchedText === canonical ? 'phrase' : 'subphrase') : entry ? 'head' : undefined;
    const orderedSenses = entry ? [sense, ...resolved.alternatives].filter((item, index, all): item is NonNullable<typeof item> => Boolean(item) && all.findIndex(other => other?.id === item!.id) === index) : [];
    const rulePos = inferContextPos(lookupText, analysis.normalizedText, entry?.pos, occurrence?.start);
    const contextPos = rulePos ?? sense?.pos ?? occurrence?.pos;
    const preferredSensePos = rulePos === 'adjective' && entry?.morphology?.inflection === 'past-participle' ? 'verb' : rulePos;
    const contextOrderedSenses = preferredSensePos ? [...orderedSenses].sort((left, right) => Number(right.pos === preferredSensePos) - Number(left.pos === preferredSensePos)) : orderedSenses;
    const senseResults = contextOrderedSenses.map(item => ({ id: item.id, pos: item.pos ?? entry?.pos[0] ?? 'other', definitionEn: item.definitionEn,
      meaningsVi: item.meaningVi ? splitMeanings(item.meaningVi) : [], source: 'local' as const,
      contextScore: item.id === sense?.id ? resolved.senseConfidence : 0, contextMatch: item.id === sense?.id && resolved.contextMatch }));
    const linkedMeanings = new Set(contextOrderedSenses.flatMap(item => item.meaningVi ? [item.meaningVi, ...splitMeanings(item.meaningVi)] : []).map(normalizeMeaning));
    const unpairedMeaningsVi = (entry?.meaningsVi ?? []).filter(meaning => !linkedMeanings.has(normalizeMeaning(meaning)));
    const dictionary = entry ? {
      word: entry.lemma, surfaceForm: input.selectedText, lemma: entry.lemma,
      pronunciation: dictionaryPronunciation(entry.lemma), contextPos, senseStatus: resolved.status, partOfSpeechConfidence: resolved.posConfidence,
      senseConfidence: resolved.senseConfidence, contextConfidence: resolved.senseConfidence,
      senses: senseResults, unpairedMeaningsVi
    } : undefined;
    return { ...result, dictionary, selection: { ...result.selection, lemma: entry?.lemma ?? normalized, pos: contextPos ?? entry?.pos.join(' / '), status, matchedText, matchType },
      phrase: resolvedPhrase ? { canonical: resolvedPhrase.lemma, type: resolvedPhrase.type } : undefined,
      english: sense?.definitionEn ? { definition: sense.definitionEn, contextualDefinition: resolved.contextMatch ? sense.definitionEn : undefined, synonyms: sense.synonyms, examples: sense.examples } : undefined,
      vietnamese: sense?.meaningVi ? { meaning: sense.meaningVi, contextualMeaning: resolved.contextMatch ? sense.meaningVi : undefined, senseAligned: true }
        : entry?.meaningsVi?.length ? { meaning: entry.meaningsVi.join(' / '), senseAligned: false } : undefined,
      grammar: entry ? { role: contextPos ?? entry.pos.join(' / '), pattern: phraseEntry?.lemma,
        form: entry.morphology ? `${entry.morphology.inflection} of ${entry.morphology.baseLemma}` : undefined } : undefined,
      sense: sense ? { id: sense.id, alternatives: resolved.alternatives.map(s => s.id), reasons: resolved.reasons } : undefined,
      context: { ...result.context, sentenceTranslation: analysis.translationVi, simpleEnglish: analysis.simpleEnglish },
      confidence: resolved.senseConfidence, posConfidence: resolved.posConfidence,
      providers: { lexical: 'local-dictionary', sentence: 'local', context: 'local-sense-resolver' }, cached
    };
  }
  async rememberSentenceTranslation(sentence: string, translatedText: string): Promise<void> {
    await this.sentences.rememberTranslation(sentence, translatedText);
  }
}

function splitMeanings(value: string): string[] {
  return [...new Set(value.split(/\s*(?:\/|;|·)\s*/).map(item => item.trim()).filter(Boolean))];
}

function normalizeMeaning(value: string): string { return value.normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim(); }

function dictionaryPronunciation(lemma: string): string | null {
  return dictionaryRegistry.lookup(lemma)?.entry.ipa ?? null;
}

function inferContextPos(selection: string, sentence: string, availablePos: string[] = [], selectionStart?: number): string | undefined {
  const index = selectionStart ?? sentence.toLocaleLowerCase().indexOf(selection.toLocaleLowerCase());
  if (index < 0) return undefined;
  const prefix = sentence.slice(0, index);
  const suffix = sentence.slice(index + selection.length);
  if (/ed$/i.test(selection) && availablePos.includes('verb')) {
    if (/\b(?:get|gets|got|getting|be|is|am|are|was|were|been|being|have|has|had)\s+$/i.test(prefix)) return 'verb';
    if (/\b(?:the|a|an|this|that|these|those)\s+$/i.test(prefix) && /^\s+[\p{L}\p{M}]+/u.test(suffix)) return 'adjective';
    if (/\b(?:i|you|he|she|it|we|they|[\p{L}\p{M}]+)\s+$/iu.test(prefix) && /^(?:\s|[.,;!?]|$)/.test(suffix)) return 'verb';
  }
  if (/(?:\b(?:can|could|may|might|must|shall|should|will|would|do|does|did)|\bto)\s+$/i.test(prefix)) return 'verb';
  if (/\b(?:a|an|the|this|that|my|our|their|his|her|its)\s+$/i.test(prefix)) {
    if (/^\s+[\p{L}\p{M}]/u.test(suffix) && availablePos.includes('adjective')) return 'adjective';
    return 'noun';
  }
  if (/\b(?:be|is|am|are|was|were|seem|seems|seemed|feel|feels|felt|become|became)\s+$/i.test(prefix)) return 'adjective';
  return undefined;
}
