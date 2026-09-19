import { dictionaryRegistry } from '../../lookup/dictionary/registry';
export function estimateComplexity(selectedText: string, sentence: string) {
  const reasons: string[] = [];
  if (/\b(account(?:s|ed)? for|make up|made up|take off|set up|bank|charge|interest)\b/i.test(selectedText)) reasons.push('multiple senses');
  if (sentence.split(/\s+/).length > 28 || (sentence.match(/[,;—()]/g)?.length ?? 0) > 3) reasons.push('nested sentence');
  if (/\b(ambiguity|institutional|precisely|whereas|notwithstanding)\b/i.test(sentence)) reasons.push('abstract or complex construction');
  if (!dictionaryRegistry.lookup(selectedText)) reasons.push('no exact dictionary entry');
  return { level: reasons.length > 1 ? 'complex' as const : reasons.length ? 'medium' as const : 'simple' as const, reasons };
}
