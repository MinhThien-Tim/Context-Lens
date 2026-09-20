import type { ContextInput } from './types';
import { ContextWindowBuilder } from '../language/sentence-engine';
import { selectionInput } from '../language/adapter';
/** Keep selected text and its immediate context bounded before hashing or sending. */
export function boundedContext(input: ContextInput): ContextInput {
  const deep = ['simplify', 'sentence-structure'].includes(input.mode);
  const request = input.request;
  const window = new ContextWindowBuilder().build(selectionInput(request, input.sourceLang, input.targetLang));
  const selection = request.selection.slice(0, 2000);
  const offset = Math.max(0, request.sentence.indexOf(selection));
  const start = Math.max(0, offset - 600);
  return { ...input, request: { ...request, selection,
    sentence: request.sentence.slice(start, start + 3200),
    previous_sentence: deep || window.needsPreviousSentence ? request.previous_sentence?.slice(-500) ?? null : null,
    next_sentence: deep ? request.next_sentence?.slice(0, 500) ?? null : null,
    paragraph: deep ? request.paragraph?.slice(0, 4000) : undefined,
    context_mode: input.mode, source_language: input.sourceLang, target_language: input.targetLang,
    options: { ...request.options, include_grammar: ['grammar', 'sentence-structure'].includes(input.mode), include_sentence_translation: input.mode === 'simplify' }
  } };
}
