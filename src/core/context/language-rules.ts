export interface KnownExpression {
  type: 'idiom' | 'collocation' | 'phrasal verb' | 'noun phrase';
  text: string;
  meaningEn: string;
  meaningVi: string;
  whyHere: string;
  notThisMeaning?: string;
  pattern: string;
  confidence: number;
}

/** Only return a match when the sentence contains evidence for one specific sense. */
export function matchKnownExpression(selection: string, sentence: string): KnownExpression | null {
  const selected = selection.toLocaleLowerCase('en').trim();
  if (/^accounts?$/.test(selected) && /\baccounts? of\b/i.test(sentence)) {
    return { type: 'noun phrase', text: 'account of an event', meaningEn: 'a report or description of an event', meaningVi: 'lời kể; bản tường thuật', whyHere: 'The preposition “of” introduces the event being described.', pattern: 'an account of + event', confidence: 0.93 };
  }
  if (/\b(?:mind|make up|made up)\b/.test(selected) && /\b(?:make|makes|made) up (?:\w+ )?(?:own )?mind\b/i.test(sentence)) {
    return { type: 'idiom', text: "make up one's mind", meaningEn: 'make a decision', meaningVi: 'đưa ra quyết định', whyHere: 'The words form a fixed expression meaning “decide”.', notThisMeaning: '“Make up” không mang nghĩa “bịa ra” ở đây.', pattern: "make up one's mind", confidence: 0.95 };
  }
  if (/\b(?:maintain|confidence|maintain public confidence)\b/.test(selected) && /\bmaintain public confidence\b/i.test(sentence)) {
    return { type: 'collocation', text: 'maintain public confidence', meaningEn: 'keep public trust from weakening', meaningVi: 'duy trì lòng tin của công chúng', whyHere: '“Maintain” and “public confidence” form a common collocation.', pattern: 'maintain + noun', confidence: 0.94 };
  }
  if (/^accounts?(?: for)?$/.test(selected) && /\baccounts? for\s+(?:about |approximately |over |nearly )?\d+(?:\.\d+)?\s*(?:%|percent)/i.test(sentence)) {
    return { type: 'phrasal verb', text: 'account for', meaningEn: 'constitute or make up a share of a total', meaningVi: 'chiếm; tạo nên một phần của tổng số', whyHere: 'The percentage identifies a share of the total.', notThisMeaning: 'Không mang nghĩa “giải thích” trong câu này.', pattern: 'X accounts for Y% of Z', confidence: 0.95 };
  }
  if (/^accounts?(?: for)?$/.test(selected) && /\b(?:factor|reason|cause)s?\b.*\baccounts? for\b|\baccounts? for\b.*\b(?:decline|discrepancy|difference|change|result)\b/i.test(sentence)) {
    return { type: 'phrasal verb', text: 'account for', meaningEn: 'explain or be the cause of', meaningVi: 'giải thích hoặc là nguyên nhân của', whyHere: 'The sentence names a factor or cause for an outcome.', notThisMeaning: 'Không mang nghĩa “chiếm một tỷ lệ” vì câu không nêu phần của tổng số.', pattern: 'X accounts for Y', confidence: 0.9 };
  }
  return null;
}
