export interface SentenceContext {
  previous: string | null;
  current: string;
  next: string | null;
}

const sentenceSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl
  ? new Intl.Segmenter('en', { granularity: 'sentence' })
  : null;
type SentenceSpan = { text: string; start: number; end: number };
let lastText = '';
let lastSpans: SentenceSpan[] = [];
function sentenceSpans(text: string): SentenceSpan[] {
  if (text === lastText && lastSpans.length) return lastSpans;
  const raw = sentenceSegmenter
    ? Array.from(sentenceSegmenter.segment(text), part => ({ text: part.segment.trim(), start: part.index, end: part.index + part.segment.length })).filter(part => part.text)
    : fallbackSentences(text);
  const merged: SentenceSpan[] = [];
  for (const span of raw) {
    const previous = merged.at(-1);
    if (previous && /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|e\.g|i\.e|[A-Z])\.$/.test(previous.text)) {
      previous.end = span.end; previous.text = text.slice(previous.start, previous.end).trim();
    } else merged.push({ ...span });
  }
  // Keep only the active text's boundaries; never prefetch network results.
  lastText = text; lastSpans = merged;
  return merged;
}

export function sentenceContextAt(text: string, offset: number): SentenceContext {
  const cleanOffset = Math.max(0, Math.min(offset, Math.max(0, text.length - 1)));
  const sentences = sentenceSpans(text);
  const found = sentences.findIndex((part) => cleanOffset >= part.start && cleanOffset < part.end);
  const index = found >= 0 ? found : Math.max(0, sentences.filter(part => part.start <= cleanOffset).length - 1);
  const current = sentences[index] ?? { text: text.trim(), start: 0, end: text.length };
  return {
    previous: index > 0 ? sentences[index - 1].text : null,
    current: current.text,
    next: index < sentences.length - 1 ? sentences[index + 1].text : null
  };
}

function fallbackSentences(text: string) {
  const matches = Array.from(text.matchAll(/[^.!?]+(?:[.!?]+[\s\"'”’]*|$)/g));
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
