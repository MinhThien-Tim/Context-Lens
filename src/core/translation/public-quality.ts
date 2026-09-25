import type { TranslationInput, TranslationResult } from './types';

export interface PublicTranslationContext {
  lemma?: string;
  pos?: string;
  meaningsVi?: string[];
  contextConfidence?: number;
  senseConfidence?: number;
}

export type PublicTranslationQuality = 'accept' | 'uncertain' | 'reject';
const normalized = (value: string) => value.normalize('NFC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
const normalizeVietnamese = (value: string) => normalized(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
const words = (value: string) => value.split(/\s+/).filter(Boolean);
const lexicalText = (value: string) => value.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function isStructurallyInvalid(source: string, output: string): boolean {
  if (!output || lexicalText(output) === lexicalText(source) || /<\/?[a-z][^>]*>|&(?:lt|gt|amp);/i.test(output)
    || /(?:quota|rate limit|error|invalid request|not found|service unavailable|status code|too many requests)/i.test(output)
    || /[\uFFFD\u0000-\u001F]/u.test(output)) return true;
  return /(?:^|\s)([^\s]+)(?:\s+\1){3,}(?:\s|$)/iu.test(output)
    || output.length > Math.max(100, source.length * 7)
    || (words(source).length <= 2 && words(output).length > 12);
}

function isTargetLanguageImplausible(input: TranslationInput, output: string): boolean {
  return input.sourceLang === 'en' && input.targetLang === 'vi'
    && words(output).length > 2 && !/[\u00C0-\u1EF9]/u.test(output)
    && /\b(?:the|is|are|with|from|that|this|and|of)\b/i.test(output);
}

function hasLocalSemanticSupport(output: string, meanings: string[]): boolean {
  const candidate = words(lexicalText(normalizeVietnamese(output)));
  if (!candidate.length) return false;
  const candidatePhrase = candidate.join(' ');
  return meanings.some(meaning => {
    const local = words(lexicalText(normalizeVietnamese(meaning)));
    if (!local.length) return false;
    const localPhrase = local.join(' ');
    if (localPhrase === candidatePhrase) return true;
    const containsPhrase = (haystack: string[], needle: string[]) => {
      if (needle.length < 2 || needle.length > haystack.length) return false;
      outer: for (let start = 0; start <= haystack.length - needle.length; start++) {
        for (let i = 0; i < needle.length; i++) if (haystack[start + i] !== needle[i]) continue outer;
        return true;
      }
      return false;
    };
    if (containsPhrase(local, candidate) || containsPhrase(candidate, local)) return true;
    const localTokens = new Set(local);
    return candidate.some(token => token.length >= 3 && localTokens.has(token));
  });
}

function isSemanticallyUncertain(output: string, context?: PublicTranslationContext): boolean {
  const meanings = context?.meaningsVi?.filter(meaning => normalized(meaning)) ?? [];
  if (!meanings.length || hasLocalSemanticSupport(output, meanings)) return false;
  const strongEvidence = (context?.senseConfidence ?? 0) >= 0.75 || (context?.contextConfidence ?? 0) >= 0.75;
  return meanings.length > 1 || strongEvidence;
}

export function evaluatePublicTranslationQuality(input: TranslationInput, result: TranslationResult, context?: PublicTranslationContext): PublicTranslationQuality {
  const source = normalized(input.text);
  const output = normalized(result.text ?? '');
  if (isStructurallyInvalid(source, output) || isTargetLanguageImplausible(input, output)) return 'reject';
  return isSemanticallyUncertain(output, context) ? 'uncertain' : 'accept';
}
