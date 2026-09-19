import { initialTextLocation } from '../location';
import { ImportError, type ImportedDocument, type ImportOptions } from './types';

const ARTICLE_TIMEOUT_MS = 15_000;
const MAX_ARTICLE_BYTES = 5 * 1024 * 1024;

export async function importArticle(urlValue: string, options: ImportOptions = {}): Promise<ImportedDocument> {
  const [{ Readability }, { sanitizeReaderHtml }] = await Promise.all([
    import('@mozilla/readability'),
    import('./sanitize')
  ]);
  const url = normalizeHttpUrl(urlValue);
  let html: string;
  try {
    html = await fetchArticle(url, options.signal);
  } catch (error) {
    const proxy = import.meta.env.VITE_ARTICLE_PROXY_URL as string | undefined;
    if (!proxy) throw error;
    html = await fetchArticle(new URL(`?url=${encodeURIComponent(url.href)}`, proxy), options.signal);
  }
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  absolutizeUrls(parsed, url);
  const article = new Readability(parsed, { keepClasses: false }).parse();
  if (!article?.textContent?.trim()) throw new ImportError('Article extraction failed. Paste the article text manually.', 'extraction');
  const safeHtml = sanitizeReaderHtml(article.content ?? '');
  return {
    title: article.title || url.hostname, kind: 'article', content: article.textContent.trim(), safeHtml,
    source: { url: url.href, author: article.byline || undefined, siteName: article.siteName || url.hostname },
    location: initialTextLocation()
  };
}

async function fetchArticle(url: URL, externalSignal?: AbortSignal): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ARTICLE_TIMEOUT_MS);
  const abort = () => controller.abort();
  externalSignal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'text/html,application/xhtml+xml' } });
    if (!response.ok) throw new ImportError(`Article request failed (${response.status}).`, 'network');
    const type = response.headers.get('content-type') ?? '';
    if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) throw new ImportError('The URL did not return an HTML article.', 'extraction');
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > MAX_ARTICLE_BYTES) throw new ImportError('The article is larger than the 5 MB limit.', 'too_large');
    const html = await response.text();
    if (new Blob([html]).size > MAX_ARTICLE_BYTES) throw new ImportError('The article is larger than the 5 MB limit.', 'too_large');
    return html;
  } catch (error) {
    if (error instanceof ImportError) throw error;
    if (externalSignal?.aborted) throw new ImportError('Import cancelled.', 'cancelled');
    throw new ImportError('The site blocked direct import. Configure a proxy or paste the article text manually.', 'cors');
  } finally { clearTimeout(timer); externalSignal?.removeEventListener('abort', abort); }
}

function normalizeHttpUrl(value: string): URL {
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    return url;
  } catch { throw new ImportError('Enter a valid HTTP or HTTPS article URL.', 'invalid_file'); }
}

function absolutizeUrls(document: Document, base: URL): void {
  for (const element of document.querySelectorAll<HTMLElement>('[src], [href]')) {
    for (const attribute of ['src', 'href']) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      try { element.setAttribute(attribute, new URL(value, base).href); } catch { element.removeAttribute(attribute); }
    }
  }
}
