import { describe, expect, it } from 'vitest';
import { buildContextPrompt } from '../../ai/prompt';
import { contextExplanationSchema, contextProviderResponseSchema } from './schema';
import type { ContextInput } from './types';

const input: ContextInput = { mode: 'grammar', sourceLang: 'en', targetLang: 'vi', request: {
  selection: 'account for', selection_type: 'phrase', sentence: 'The sector accounts for 40%.', previous_sentence: null, next_sentence: null,
  language_mode: 'bilingual', learner: { native_language: 'vi', english_level: 'B2' },
  options: { include_ipa: true, include_contrast: true, include_grammar: true, include_sentence_translation: true }
} };

describe('compact context contract', () => {
  it('accepts task-specific optional fields without quick lookup data', () => {
    expect(contextExplanationSchema.parse({ grammar: { pattern: 'X accounts for Y%', explanation: 'X chiếm Y%.' }, confidence: 0.9 })).not.toHaveProperty('quick');
  });
  it('rejects empty or undocumented output', () => {
    expect(contextExplanationSchema.safeParse({}).success).toBe(false);
    expect(contextExplanationSchema.safeParse({ meaning: 'x', quick: {} }).success).toBe(false);
  });
  it('compacts null placeholders from strict structured-output providers', () => {
    const parsed = contextProviderResponseSchema.parse({
      meaning: 'cất cánh', naturalTranslation: null, sense: null, grammar: null,
      whyHere: null, notThisMeaning: null, pattern: null, example: null,
      simplified: null, sentenceTranslation: null, chunks: null, confidence: 0.9
    });
    expect(parsed).toEqual({ meaning: 'cất cánh', confidence: 0.9 });
  });
  it('sends only bounded reading context and task fields', () => {
    const payload = JSON.parse(buildContextPrompt(input));
    expect(payload).toEqual(expect.objectContaining({ task: 'grammar', selectedText: 'account for', sentence: input.request.sentence }));
    expect(payload).not.toHaveProperty('learner'); expect(payload).not.toHaveProperty('options');
  });
});
