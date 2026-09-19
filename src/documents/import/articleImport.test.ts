import { describe, expect, it, vi } from 'vitest';
import { importArticle } from './articleImport';

describe('article import', () => {
  it('extracts readable content, resolves URLs, and removes unsafe markup', async () => {
    const html = `<!doctype html><html><head><title>News title</title></head><body><nav>Menu</nav><article><h1>News title</h1><p>Long enough article content for the reader to identify this as the main story. It contains several complete English sentences for testing.</p><img src="/photo.jpg" onerror="alert(1)"><script>alert(1)</script></article></body></html>`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } })));
    const result = await importArticle('https://example.com/story');
    expect(result.kind).toBe('article');
    expect(result.content).toContain('Long enough article content');
    expect(result.safeHtml).toContain('https://example.com/photo.jpg');
    expect(result.safeHtml).not.toMatch(/script|onerror/i);
  });
});
