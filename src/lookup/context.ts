export interface SentenceContext {
  previous: string | null;
  current: string;
  next: string | null;
}

const sentenceSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl
  ? new Intl.Segmenter('en', { granularity: 'sentence' })
  : null;

export function sentenceContextAt(text: string, offset: number): SentenceContext {
  const cleanOffset = Math.max(0, Math.min(offset, Math.max(0, text.length - 1)));
  const sentences = sentenceSegmenter
    ? Array.from(sentenceSegmenter.segment(text), (part) => ({ text: part.segment.trim(), start: part.index, end: part.index + part.segment.length }))
      .filter((part) => part.text.length > 0)
    : fallbackSentences(text);

  const index = Math.max(0, sentences.findIndex((part) => cleanOffset >= part.start && cleanOffset < part.end));
  const current = sentences[index] ?? { text: text.trim(), start: 0, end: text.length };
  return {
    previous: index > 0 ? sentences[index - 1].text : null,
    current: current.text,
    next: index < sentences.length - 1 ? sentences[index + 1].text : null
  };
}

function fallbackSentences(text: string) {
  const matches = Array.from(text.matchAll(/[^.!?]+(?:[.!?]+[\s\"']*|$)/g));
  return matches.map((match) => ({ text: match[0].trim(), start: match.index ?? 0, end: (match.index ?? 0) + match[0].length }));
}

export function wordAtPoint(range: Range): { text: string; offset: number } | null {
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE || !node.textContent) return null;
  const content = node.textContent;
  let start = range.startOffset;
  let end = start;
  const wordChar = /[\p{L}\p{M}'’-]/u;
  while (start > 0 && wordChar.test(content[start - 1])) start--;
  while (end < content.length && wordChar.test(content[end])) end++;
  const text = content.slice(start, end).replace(/^[’'-]+|[’'-]+$/g, '');
  if (!text) return null;
  const root = node.parentElement?.closest('[data-reader-text]');
  if (!root) return { text, offset: start };
  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEnd(node, start);
  return { text, offset: before.toString().length };
}

export function normalizeSelection(value: string): string {
  return value.trim().replace(/\s+/g, ' ').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}
