import { useLayoutEffect, useMemo, useRef } from 'preact/hooks';
import type { LookupResponse } from '../lookup/types';

/** Compare data, not visibility: expanding or changing language never animates existing text. */
export function useMeaningReveal(result: LookupResponse) {
  const key = `${result.selection.surface}\n${result.context.sentence}`;
  const previous = useRef<{ key: string; texts: Set<string> }>();
  const texts = useMemo(() => new Set([
    result.quick.definition_en, result.quick.meaning_vi.join('; '),
    ...(result.dictionary?.senses.flatMap(sense => [sense.definitionEn, sense.meaningsVi.join('; ')]) ?? []),
    ...(result.dictionary?.unpairedMeaningsVi ?? []),
    result.deep.sentence_analysis.translation_vi, result.lens?.context?.sentenceTranslation,
    result.deep.context_explanation_en, result.deep.context_explanation_vi,
    ...(result.lens?.english?.examples ?? []), result.lens?.english?.synonyms?.join(', '),
    ...result.deep.contrast.map(item => item.example)
  ].filter((text): text is string => Boolean(text))), [result]);
  const delayed = previous.current?.key === key && result.source !== 'cache' && !result.engine?.cached
    ? new Set([...texts].filter(text => !previous.current!.texts.has(text))) : new Set<string>();
  useLayoutEffect(() => { previous.current = { key, texts }; }, [key, texts]);
  return (text: string) => delayed.has(text) ? ' meaning-reveal' : '';
}
