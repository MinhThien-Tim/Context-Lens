import { describe, expect, it } from 'vitest';
import { importLocalFile } from './fileImport';
import { ImportError } from './types';

describe('local file import', () => {
  it('imports TXT and Markdown without loading book readers', async () => {
    const text = await importLocalFile(new File(['First paragraph.'], 'reading.txt', { type: 'text/plain' }));
    const markdown = await importLocalFile(new File(['# Heading\n\nText<script>alert(1)</script>'], 'notes.md', { type: 'text/markdown' }));
    expect(text).toEqual(expect.objectContaining({ kind: 'text', title: 'reading', content: 'First paragraph.' }));
    expect(markdown).toEqual(expect.objectContaining({ kind: 'markdown', title: 'notes' }));
    expect(markdown.safeHtml).toContain('<h1>Heading</h1>');
    expect(markdown.safeHtml).not.toContain('<script>');
  });
  it('rejects unsupported local files', async () => {
    await expect(importLocalFile(new File(['x'], 'archive.zip'))).rejects.toEqual(expect.objectContaining<Partial<ImportError>>({ code: 'unsupported' }));
  });
});
