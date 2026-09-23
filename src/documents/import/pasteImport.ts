import { htmlSections, textSections } from '../sections';
import { initialTextLocation } from '../location';
import { sanitizeReaderHtml } from './sanitize';
import { ImportError, type ImportedDocument } from './types';

export type PasteMode = 'rich' | 'plain';

export const MAX_PASTE_BYTES = 5 * 1024 * 1024;

export interface PastedContent {
  plainText: string;
  html?: string;
  mode: PasteMode;
}

export function preparePastedDocument(title: string, input: PastedContent): ImportedDocument {
  const plainText = normalizePlainText(input.plainText);
  const rawSize = new Blob([input.html ?? '', plainText]).size;
  if (rawSize > MAX_PASTE_BYTES) throw new ImportError('Pasted content is larger than the 5 MB limit.', 'too_large');

  if (input.mode === 'rich' && input.html?.trim()) {
    const normalized = normalizeClipboardHtml(input.html);
    const safeHtml = sanitizeReaderHtml(normalized, { allowExternalImages: false });
    const { content, toc } = htmlSections(safeHtml);
    if (!content.trim()) throw new ImportError('The clipboard does not contain readable text.', 'invalid_file');
    return { title: cleanTitle(title), kind: 'text', content, toc, safeHtml, location: initialTextLocation() };
  }

  if (!plainText.trim()) throw new ImportError('Paste some text before starting.', 'invalid_file');
  return { title: cleanTitle(title), kind: 'text', content: plainText, toc: textSections(plainText), location: initialTextLocation() };
}

export function normalizePlainText(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/[\t ]+$/gm, '').trim();
}

function cleanTitle(value: string): string {
  return value.trim() || 'Untitled reading';
}

function normalizeClipboardHtml(rawHtml: string): string {
  const document = new DOMParser().parseFromString(rawHtml, 'text/html');
  document.querySelectorAll('script,style,meta,link,iframe,object,embed').forEach(node => node.remove());
  document.querySelectorAll('div').forEach(div => {
    const paragraph = document.createElement('p');
    while (div.firstChild) paragraph.append(div.firstChild);
    div.replaceWith(paragraph);
  });
  return document.body.innerHTML;
}
