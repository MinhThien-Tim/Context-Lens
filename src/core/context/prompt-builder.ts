import type { ContextInput } from './types';
import { ContextWindowBuilder } from '../language/sentence-engine';
import { selectionInput } from '../language/adapter';
/** Keep selected text and its immediate context bounded before hashing or sending. */
export function boundedContext(input: ContextInput): ContextInput {
  const deep = ['simplify', 'sentence-structure'].includes(input.mode);
  const request = input.request;
  const needsParagraph = ['simplify', 'sentence-structure'].includes(input.mode);
  const window = new ContextWindowBuilder().build(selectionInput(request, input.sourceLang, input.targetLang));
  const selection = request.selection.slice(0, 400);
  const offset = Math.max(0, request.sentence.indexOf(selection));
  const sentenceLimit = deep ? 3200 : 1200;
  const start = Math.max(0, offset - Math.floor(sentenceLimit / 2));
  const sentence = request.sentence.slice(start, start + sentenceLimit);
  return { ...input, request: { ...request, selection,
    sentence,
    previous_sentence: needsParagraph || (window.needsPreviousSentence && !request.paragraph) ? request.previous_sentence?.slice(-300) ?? null : null,
    next_sentence: needsParagraph && !request.paragraph ? request.next_sentence?.slice(0, 300) ?? null : null,
    paragraph: needsParagraph && request.paragraph ? request.paragraph.slice(0, 4000) : undefined,
    context_mode: input.mode, source_language: input.sourceLang, target_language: input.targetLang,
    options: { ...request.options, include_grammar: ['grammar', 'sentence-structure'].includes(input.mode), include_sentence_translation: input.mode === 'simplify' }
  } };
}
