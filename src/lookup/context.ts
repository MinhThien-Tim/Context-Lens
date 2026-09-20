export interface SentenceContext {
  previous: string | null;
  current: string;
  next: string | null;
  paragraph?: string;
}

const sentenceSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl
  ? new Intl.Segmenter('en', { granularity: 'sentence' })
  : null;
type SentenceSpan = { text: string; start: number; end: number };
const NON_TERMINAL_ABBREVIATION = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Mt|vs|etc|e\.g|i\.e)\.$/i;
const SINGLE_INITIAL = /\b[A-Z]\.$/;
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
    if (previous && (NON_TERMINAL_ABBREVIATION.test(previous.text) || SINGLE_INITIAL.test(previous.text))) {
      previous.end = span.end; previous.text = text.slice(previous.start, previous.end).trim();
    } else merged.push({ ...span });
  }
  // Keep only the active text's boundaries; never prefetch network results.
  lastText = text; lastSpans = merged;
  return merged;
}

export function sentenceContextAt(text: string, offset: number): SentenceContext {
  return sentenceContextForRange(text, offset, offset);
}

export function sentenceContextForRange(text: string, startOffset: number, endOffset: number): SentenceContext {
  const cleanOffset = Math.max(0, Math.min(startOffset, Math.max(0, text.length - 1)));
  const cleanEnd = Math.max(cleanOffset, Math.min(endOffset, text.length));
  const sentences = sentenceSpans(text);
  const found = sentences.findIndex((part) => cleanOffset >= part.start && cleanOffset < part.end);
  const index = found >= 0 ? found : Math.max(0, sentences.filter(part => part.start <= cleanOffset).length - 1);
  const lastSelected = Math.max(index, sentences.filter(part => part.start < cleanEnd).length - 1);
  const selected = sentences.slice(index, lastSelected + 1);
  const current = selected[0] ?? { text: text.trim(), start: 0, end: text.length };
  const previousParagraphBreak = text.lastIndexOf('\n\n', current.start - 1);
  const paragraphStart = previousParagraphBreak < 0 ? 0 : previousParagraphBreak + 2;
  const paragraphBreak = text.indexOf('\n\n', selected.at(-1)?.end ?? current.end);
  const paragraphEnd = paragraphBreak < 0 ? text.length : paragraphBreak;
  return {
    previous: index > 0 ? sentences[index - 1].text : null,
    current: selected.map(part => part.text).join(' ') || current.text,
    next: lastSelected < sentences.length - 1 ? sentences[lastSelected + 1].text : null,
    paragraph: text.slice(paragraphStart, paragraphEnd).trim() || undefined
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
  return value.trim().replace(/\s+/g, ' ').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}%]+$/gu, '');
}
