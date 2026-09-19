import type { ContextInput, ContextResult } from './types';
export function heuristicContext(input: ContextInput): ContextResult | null {
  if (!['meaning-in-context', 'phrase', 'idiom', 'word-sense', 'nuance'].includes(input.mode) || input.sourceLang !== 'en') return null;
  const selection = input.request.selection.toLowerCase();
  const sentence = input.request.sentence;
  if (/^accounts?(?: for)?$/.test(selection) && /\baccounts? for\s+(?:about |approximately |over |nearly )?\d+(?:\.\d+)?\s*(?:%|percent)/i.test(sentence)) {
    return { provider: 'heuristic', explanation: { meaning: 'chiếm; tạo nên một phần của tổng số', sense: 'constitute or make up a share of a total', whyHere: 'The percentage identifies a share of the total.', notThisMeaning: 'Không mang nghĩa “giải thích” trong câu này.', grammar: { pattern: 'X accounts for Y% of Z', explanation: 'X chiếm tỷ lệ Y% trong tổng Z.' }, confidence: 0.95 } };
  }
  if (/\b(?:mind|make up|made up)\b/.test(selection) && /\b(?:make|makes|made) up (?:\w+ )?(?:own )?mind\b/i.test(sentence)) {
    return { provider: 'heuristic', explanation: { meaning: 'đưa ra quyết định', sense: "the idiom “make up one's mind”", whyHere: 'The words form a fixed expression meaning “decide”.', notThisMeaning: '“Make up” không mang nghĩa “bịa ra” ở đây.', grammar: { pattern: "make up one's mind", explanation: 'Từ sở hữu thay đổi theo người đưa ra quyết định.' }, confidence: 0.95 } };
  }
  return null;
}
