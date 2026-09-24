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
const words = (value: string) => value.trim().split(/\s+/).filter(Boolean);

export function evaluatePublicTranslationQuality(input: TranslationInput, result: TranslationResult, context?: PublicTranslationContext): PublicTranslationQuality {
  const source = normalized(input.text);
  const output = normalized(result.text ?? '');
  if (!output || output === source || /<\/?[a-z][^>]*>|&(?:lt|gt|amp);/i.test(output)
    || /(?:quota|rate limit|error|invalid request|not found|service unavailable|status code|too many requests)/i.test(output)
    || /[\uFFFD\u0000-\u001F]/u.test(output)) return 'reject';
  const sourceWords = words(source).length;
  const outputWords = words(output);
  if (/(?:^|\s)([^\s]+)(?:\s+\1){3,}(?:\s|$)/iu.test(output)
    || output.length > Math.max(100, input.text.length * 7)
    || (sourceWords <= 2 && outputWords.length > 12)) return 'reject';
  if (input.sourceLang === 'en' && input.targetLang === 'vi'
    && outputWords.length > 2 && !/[\u00C0-\u1EF9]/u.test(output)
    && /\b(?:the|is|are|with|from|that|this|and|of)\b/i.test(output)) return 'reject';
  const meanings = context?.meaningsVi?.map(normalized).filter(Boolean) ?? [];
  const overlap = meanings.some(meaning => meaning === output || meaning.includes(output) || output.includes(meaning));
  if (context?.pos && sourceWords === 1 && context.pos.toLowerCase().includes('verb')
    && /^(?:phí|lệ phí|chi phí|giá|tiền)$/u.test(output)) return 'uncertain';
  if (context?.senseConfidence !== undefined && context.senseConfidence < 0.3 && meanings.length > 1 && !overlap) return 'uncertain';
  if (meanings.length > 2 && outputWords.length === 1 && !overlap) return 'uncertain';
  return 'accept';
}
