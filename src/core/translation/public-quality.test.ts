import { describe, expect, it } from 'vitest';
import { evaluatePublicTranslationQuality, type PublicTranslationContext } from './public-quality';
import type { TranslationInput, TranslationResult } from './types';

const input: TranslationInput = { text: 'prerequisite', sourceLang: 'en', targetLang: 'vi' };
const evaluate = (text: string, context?: PublicTranslationContext, source = input.text) =>
  evaluatePublicTranslationQuality({ ...input, text: source }, { text, sourceText: source, targetLang: 'vi', provider: 'mymemory' } as TranslationResult, context);

describe('public translation quality', () => {
  it('accepts clean short translations, including without local context or accents', () => {
    expect(evaluate('tươi tốt', undefined, 'lush')).toBe('accept');
    expect(evaluate('tuoi tot', undefined, 'lush')).toBe('accept');
    expect(evaluate('điều kiện tiên quyết', { meaningsVi: ['điều kiện tiên quyết'] })).toBe('accept');
  });

  it('rejects unchanged and malformed output', () => {
    expect(evaluate('prerequisite')).toBe('reject');
    expect(evaluate('Prerequisite!')).toBe('reject');
    expect(evaluate('<html>error</html>')).toBe('reject');
    expect(evaluate('lỗi \uFFFD')).toBe('reject');
    expect(evaluate('the result is still in English')).toBe('reject');
  });

  it('defers unsupported output when local meanings compete', () => {
    expect(evaluate('mức giá', { meaningsVi: ['buộc tội', 'sạc', 'lao tới'], pos: 'verb', senseConfidence: 0.2 }, 'charge')).toBe('uncertain');
  });

  it('accepts local overlap even with low confidence or missing accents', () => {
    expect(evaluate('buoc toi', { meaningsVi: ['buộc tội', 'sạc', 'lao tới'], senseConfidence: 0.2 }, 'charge')).toBe('accept');
  });

  it('uses whole tokens and phrases rather than substring overlap', () => {
    expect(evaluate('buoc toi', { meaningsVi: ['buộc tội'] }, 'charge')).toBe('accept');
    expect(evaluate('đi', { meaningsVi: ['điều kiện'] }, 'charge')).toBe('accept');
  });

  it('defers disagreement with strong local evidence but accepts sparse weak evidence', () => {
    expect(evaluate('mức giá', { meaningsVi: ['buộc tội'], senseConfidence: 0.9 }, 'charge')).toBe('uncertain');
    expect(evaluate('mức giá', { meaningsVi: ['buộc tội'], senseConfidence: 0.2 }, 'charge')).toBe('accept');
  });
});
