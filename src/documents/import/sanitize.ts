import DOMPurify from 'dompurify';

export function sanitizeReaderHtml(rawHtml: string): string {
  const sanitized = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: ['p', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'a', 'img', 'figure', 'figcaption', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'width', 'height'],
    ALLOW_DATA_ATTR: false
  });
  const container = document.createElement('div');
  container.innerHTML = sanitized;
  for (const image of container.querySelectorAll('img')) {
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
  }
  for (const link of container.querySelectorAll('a')) {
    link.target = '_blank';
    link.rel = 'noreferrer noopener';
  }
  return container.innerHTML;
}
