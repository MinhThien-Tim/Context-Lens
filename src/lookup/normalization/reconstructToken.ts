export interface TokenRepair { token: string; original: string; start: number; end: number }

/** Expand a PDF selection only when the supplied sentence proves it is inside a word. */
export function reconstructToken(selection: string, sentence: string, selectionStart?: number): TokenRepair | undefined {
  if (!/^[\p{L}\p{M}'-]+$/u.test(selection) || !sentence) return undefined;
  const starts = selectionStart === undefined
    ? Array.from(sentence.matchAll(new RegExp(selection.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu')), match => match.index!)
    : [selectionStart];
  const repairs = starts.flatMap(start => {
    if (sentence.slice(start, start + selection.length).toLocaleLowerCase() !== selection.toLocaleLowerCase()) return [];
    let left = start, right = start + selection.length;
    while (left > 0 && /[\p{L}\p{M}'-]/u.test(sentence[left - 1])) left--;
    while (right < sentence.length && /[\p{L}\p{M}'-]/u.test(sentence[right])) right++;
    const token = sentence.slice(left, right);
    return token.length > selection.length ? [{ token, original: selection, start: left, end: right }] : [];
  });
  return repairs.length === 1 ? repairs[0] : undefined;
}
