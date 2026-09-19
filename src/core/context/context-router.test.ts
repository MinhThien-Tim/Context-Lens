import { describe, expect, it, vi } from 'vitest';
import { ContextRouter, contextKey } from './context-router';
import { boundedContext } from './prompt-builder';
import type { ContextInput, ContextProvider, ContextResult } from './types';
import { EngineError } from '../errors';
const input: ContextInput = { sourceLang: 'en', targetLang: 'vi', mode: 'meaning-in-context', request: {
  selection: 'account for', selection_type: 'phrase', sentence: 'Several factors account for the decline.', previous_sentence: null, next_sentence: null, language_mode: 'bilingual',
  learner: { native_language: 'vi', english_level: 'B2' }, options: { include_ipa: true, include_contrast: true, include_grammar: true, include_sentence_translation: true }
} };
function cache() { const values = new Map<string, ContextResult>(); return { get: vi.fn(async (key: string) => values.get(key) ?? null), put: vi.fn(async (key: string, result: ContextResult) => { values.set(key, result); }) }; }
function provider(id = 'user-api'): ContextProvider { return { id, model: 'test', family: id, network: true, explain: vi.fn().mockResolvedValue({ meaning: 'nghĩa theo ngữ cảnh', confidence: 0.9 }) }; }
describe('ContextRouter', () => {
  it('uses cached context without repeating AI', async () => {
    const ai = provider(); const router = new ContextRouter([ai], cache());
    await router.explain(input); expect((await router.explain(input)).cached).toBe(true);
    expect(ai.explain).toHaveBeenCalledTimes(1);
  });
  it('resolves percentage account for without AI and keeps ambiguous uses eligible', async () => {
    const ai = provider(); const router = new ContextRouter([ai], cache());
    const result = await router.explain({ ...input, request: { ...input.request, sentence: 'The sector accounts for 40% of total output.' } });
    expect(result.provider).toBe('heuristic'); expect(result.explanation.meaning).toContain('chiếm');
    expect(ai.explain).not.toHaveBeenCalled();
    await router.explain(input); expect(ai.explain).toHaveBeenCalledTimes(1);
  });
  it('avoids AI for a simple word and a recognized idiom', async () => {
    const ai = provider(); const router = new ContextRouter([ai], cache());
    await router.explain({ ...input, request: { ...input.request, selection: 'prerequisite', sentence: 'Training is a prerequisite.' } });
    const idiom = await router.explain({ ...input, request: { ...input.request, selection: 'make up his own mind', sentence: 'He must make up his own mind.' } });
    expect(idiom.provider).toBe('heuristic'); expect(ai.explain).not.toHaveBeenCalled();
  });
  it('falls back on quota exhaustion and when offline', async () => {
    const ai = provider(); ai.explain = vi.fn().mockRejectedValue(new EngineError('QUOTA'));
    const local = { ...provider('local'), network: false };
    expect((await new ContextRouter([ai, local], cache()).explain(input)).provider).toBe('local');
    expect((await new ContextRouter([ai], cache(), true, () => false).explain(input)).status).toBe('offline');
    expect((await new ContextRouter([ai], cache()).explain(input)).status).toBe('quota');
  });
  it('bounds context and separates mode, sentence, model and language identities', () => {
    const bounded = boundedContext({ ...input, request: { ...input.request, previous_sentence: 'PRIVATE NEIGHBOR', next_sentence: 'PRIVATE NEXT' } });
    expect(bounded.request.previous_sentence).toBeNull(); expect(bounded.request.next_sentence).toBeNull();
    expect(contextKey(bounded, 'one')).not.toBe(contextKey(bounded, 'two'));
    expect(contextKey(bounded, 'one')).not.toBe(contextKey({ ...bounded, mode: 'grammar' }, 'one'));
    expect(contextKey(bounded, 'one')).not.toBe(contextKey({ ...bounded, sourceLang: 'vi' }, 'one'));
  });
});
