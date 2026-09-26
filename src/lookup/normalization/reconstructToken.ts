export interface TokenRepair { token: string; original: string; start: number; end: number }

/** Expand a PDF selection only when the supplied sentence proves it is inside a word. */
export function reconstructToken(selection: string, sentence: string, selectionStart?: number): TokenRepair | undefined {
  if (!/^[\p{L}\p{M}'-]+$/u.test(selection) || !sentence) return undefined;
  const starts = occurrenceStarts(selection, sentence, selectionStart);
  const repairs = starts.flatMap(start => {
    const [left, right] = tokenBounds(selection, sentence, start);
    if (left === undefined) return [];
    const token = sentence.slice(left, right);
    return token.length > selection.length ? [{ token, original: selection, start: left, end: right }] : [];
  });
  return repairs.length === 1 ? repairs[0] : undefined;
}

/**
 * Token-boundary evidence that the selection covers only part of a larger word. A valid
 * complete token has none, so a dictionary miss is never a fragment on its own.
 */
export function isPartialSelection(selection: string, sentence: string, selectionStart?: number): boolean {
  if (!/^[\p{L}\p{M}'-]+$/u.test(selection) || !sentence) return false;
  return occurrenceStarts(selection, sentence, selectionStart)
    .some(start => { const [left, right] = tokenBounds(selection, sentence, start); return left !== undefined && right - left > selection.length; });
}

function occurrenceStarts(selection: string, sentence: string, selectionStart?: number): number[] {
  return selectionStart === undefined
    ? Array.from(sentence.matchAll(new RegExp(selection.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu')), match => match.index!)
    : [selectionStart];
}

/** Word characters directly around the selection, or `undefined` when it is not at that offset. */
function tokenBounds(selection: string, sentence: string, start: number): [number | undefined, number] {
  if (sentence.slice(start, start + selection.length).toLocaleLowerCase() !== selection.toLocaleLowerCase()) return [undefined, start];
  let left = start, right = start + selection.length;
  while (left > 0 && /[\p{L}\p{M}'-]/u.test(sentence[left - 1])) left--;
  while (right < sentence.length && /[\p{L}\p{M}'-]/u.test(sentence[right])) right++;
  return [left, right];
}
