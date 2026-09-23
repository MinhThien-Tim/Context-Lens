import DOMPurify from 'dompurify';

export function sanitizeReaderHtml(rawHtml: string, options: { allowExternalImages?: boolean } = {}): string {
  const allowExternalImages = options.allowExternalImages ?? true;
  const sanitized = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'a', 'img', 'figure', 'figcaption', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'width', 'height'],
    ALLOW_DATA_ATTR: false
  });
  const container = document.createElement('div');
  container.innerHTML = sanitized;
  for (const image of container.querySelectorAll('img')) {
    const source = image.getAttribute('src') ?? '';
    if (!allowExternalImages && /^(?:https?:)?\/\//i.test(source)) {
      image.replaceWith(document.createTextNode(image.alt ? `[Image: ${image.alt}]` : '[External image removed]'));
      continue;
    }
    if (!/^(?:https?:|data:image\/|blob:|\/)/i.test(source)) {
      image.remove();
      continue;
    }
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
