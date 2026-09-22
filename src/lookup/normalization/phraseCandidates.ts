/** Exact phrase first, then every contiguous subphrase from longest to shortest. */
export function phraseCandidates(value: string): string[] {
  const words = value.split(' ').filter(Boolean);
  const candidates = [value];
  for (let length = words.length - 1; length >= 1; length--) {
    for (let start = 0; start + length <= words.length; start++) candidates.push(words.slice(start, start + length).join(' '));
  }
  return [...new Set(candidates.filter(Boolean))].slice(0, 16);
}
