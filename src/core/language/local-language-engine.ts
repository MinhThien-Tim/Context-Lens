import { normalizeText } from '../cache';
import { LexicalEngine, normalizeLexical } from './lexicon';
import { PhraseDetector } from './phrases';
import { ContextWindowBuilder, SentenceEngine } from './sentence-engine';
import { SenseResolver } from './sense-resolver';
import { occurrencePos } from './pos-arbitration';
import { senseVietnameseMeanings } from './sense-meanings';
import type { LensResult, SelectionInput, LexicalSense } from './types';
import type { DictionarySenseResult } from '../../lookup/types';
import { compoundCandidates, isPartialSelection, normalizeSelection, phraseCandidates, reconstructToken } from '../../lookup/normalization';
import { dictionaryRegistry } from '../../lookup/dictionary/registry';

/** Local semantic foundation. No fetch, translation provider, or AI dependency. */
export class LocalLanguageEngine {
  constructor(
    private lexical = new LexicalEngine(),
    private phrases = new PhraseDetector(undefined, lexical),
    private sentences = new SentenceEngine(lexical, phrases),
    private resolver = new SenseResolver(lexical)
  ) {}
  async analyzeSelection(input: SelectionInput, candidateSenses?: DictionarySenseResult[]): Promise<LensResult> {
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
    const lexicalEntry = phraseEntry ?? directEntry ?? candidateMatch?.entry;
    const entry = lexicalEntry ?? (candidateSenses?.length ? { lemma: normalized, pos: [...new Set(candidateSenses.map(sense => sense.pos))], senses: [] as LexicalSense[] } : undefined);
    if (lexicalEntry) this.lexical.remember(lookupText, lexicalEntry);
    const senses = candidateSenses ? candidateSenses.map(sense => ({ ...entry?.senses.find(item => item.id === sense.id),
      id: sense.id, pos: sense.pos, definitionEn: sense.definitionEn, meaningsVi: sense.meaningsVi,
      alignment: sense.alignment, source: sense.source })) : entry?.senses ?? [];
    const lexicalPos = [...new Set([...(entry?.pos ?? []), ...senses.map(sense => sense.pos).filter((pos): pos is string => Boolean(pos))])];
    const rulePos = occurrencePos(analysis, occurrence ? analysis.tokens.indexOf(occurrence) : -1, lexicalPos);
    const preferredSensePos = rulePos === 'adjective' && entry?.morphology?.inflection === 'past-participle' ? 'verb' : rulePos;
    const resolved = this.resolver.resolve({ selection: lookupText, lemma: entry?.lemma ?? normalized,
      canonicalPhrase: phraseEntry?.lemma, sentence: analysis.normalizedText, sentenceAnalysis: analysis,
      selectionStart: occurrence?.start, pos: preferredSensePos, sentenceTranslationVi: analysis.translationVi,
      candidateSenses: senses });
    const sense = resolved.selectedSense;
    const hasEnglish = Boolean(sense?.definitionEn);
    const senseMeanings = sense ? senseVietnameseMeanings(sense) : [];
    const hasVietnamese = Boolean(senseMeanings.length || entry?.meaningsVi?.length);
    // A complete token that no source knows is an unknown word, not a partial selection.
    const partial = !repair && isPartialSelection(initial, input.sentence, input.selectionStart);
    const status = repair && entry ? 'reconstructed' : !entry ? (partial ? 'fragment' : 'unknown')
      : entry.morphology ? 'base-form' : hasEnglish && hasVietnamese ? 'complete' : 'partial';
    const resolvedPhrase = phraseEntry ?? (entry?.lemma.includes(' ') ? { ...entry, type: 'fixed expression' as const } : undefined);
    const matchedText = phraseEntry?.lemma ?? (directEntry ? lookupText : candidateMatch?.candidate);
    const matchType = phraseEntry ? 'phrase' : directEntry ? (directEntry.morphology ? 'lemma' : 'exact')
      : matchedText?.includes(' ') ? (matchedText === canonical ? 'phrase' : 'subphrase') : entry ? 'head' : undefined;
    const orderedSenses = entry ? [sense, ...resolved.alternatives, ...senses].filter((item, index, all): item is NonNullable<typeof item> => Boolean(item) && all.findIndex(other => other?.id === item!.id) === index) : [];
    const contextPos = (resolved.contextMatch && sense?.pos) || rulePos || (lexicalPos.length === 1 ? lexicalPos[0] : undefined);
    const contextOrderedSenses = preferredSensePos ? [...orderedSenses].sort((left, right) => Number(right.pos === preferredSensePos) - Number(left.pos === preferredSensePos)) : orderedSenses;
    const degreeMeaning = (meaning: string) => entry?.morphology?.inflection === 'comparative' && (sense?.pos ?? entry?.pos[0]) === 'adjective' && /^(?:thÃ´ng minh|sÃ¡ng suá»‘t|khÃ´n ngoan)$/.test(meaning) ? `${meaning} hÆ¡n` : meaning;
    const senseResults = contextOrderedSenses.map(item => ({ id: item.id, pos: item.pos ?? entry?.pos[0] ?? 'other', definitionEn: item.definitionEn,
      meaningsVi: senseVietnameseMeanings(item).map(meaning => item.id === sense?.id ? degreeMeaning(meaning) : meaning), alignment: item.alignment, source: item.source ?? 'local' as const,
      pairingState: senseVietnameseMeanings(item).length ? 'paired' as const : 'missing' as const,
      contextScore: item.id === sense?.id ? resolved.senseConfidence : 0, contextMatch: item.id === sense?.id && resolved.contextMatch }));
    const linkedMeanings = new Set(contextOrderedSenses.flatMap(senseVietnameseMeanings).map(normalizeMeaning));
    const unpairedMeaningsVi = (entry?.meaningsVi ?? []).filter(meaning => !linkedMeanings.has(normalizeMeaning(meaning)));
    const dictionary = entry ? {
      word: entry.lemma, surfaceForm: input.selectedText, lemma: entry.lemma,
      pronunciation: dictionaryPronunciation(entry.lemma), contextPos, senseStatus: resolved.status, partOfSpeechConfidence: resolved.posConfidence,
      senseConfidence: resolved.senseConfidence, contextConfidence: resolved.senseConfidence,
      senses: senseResults, unpairedMeaningsVi, vietnameseReferences: entry.vietnameseReferences
    } : undefined;
    return { ...result, dictionary, selection: { ...result.selection, lemma: entry?.lemma ?? normalized, pos: contextPos ?? entry?.pos.join(' / '), status, matchedText, matchType },
      phrase: resolvedPhrase ? { canonical: resolvedPhrase.lemma, type: resolvedPhrase.type } : undefined,
      english: sense?.definitionEn ? { definition: sense.definitionEn, contextualDefinition: resolved.contextMatch ? sense.definitionEn : undefined, synonyms: sense.synonyms, examples: sense.examples } : undefined,
      vietnamese: senseMeanings.length ? { meaning: senseMeanings.map(degreeMeaning).join(' / '), contextualMeaning: resolved.contextMatch ? senseMeanings.map(degreeMeaning).join(' / ') : undefined, senseAligned: true }
        : entry?.meaningsVi?.length ? { meaning: entry.meaningsVi.join(' / '), senseAligned: false } : undefined,
      grammar: entry ? { role: contextPos ?? entry.pos.join(' / '), pattern: phraseEntry?.lemma,
        form: entry.morphology ? `${entry.morphology.inflection} of ${entry.morphology.baseLemma}` : undefined } : undefined,
      sense: sense ? { id: sense.id, alternatives: resolved.alternatives.map(s => s.id), reasons: resolved.reasons, diagnostics: resolved.diagnostics } : undefined,
      context: { ...result.context, sentenceTranslation: analysis.translationVi, simpleEnglish: analysis.simpleEnglish },
      confidence: resolved.senseConfidence, posConfidence: resolved.posConfidence,
      providers: { lexical: 'local-dictionary', sentence: 'local', context: 'local-sense-resolver' }, cached
    };
  }
  async rememberSentenceTranslation(sentence: string, translatedText: string): Promise<void> {
    await this.sentences.rememberTranslation(sentence, translatedText);
  }
}

function normalizeMeaning(value: string): string { return value.normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim(); }

function dictionaryPronunciation(lemma: string): string | null {
  return dictionaryRegistry.lookup(lemma)?.entry.ipa ?? null;
}
