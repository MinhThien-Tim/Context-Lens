import { describe, expect, it } from 'vitest';
import { preparePastedDocument } from './pasteImport';

describe('pasted document import', () => {
  it('keeps useful rich structure and removes active content and remote images', () => {
    const document = preparePastedDocument('Web clip', {
      mode: 'rich', plainText: 'Heading\nFirst\nSecond',
      html: '<style>body{display:none}</style><h1>Heading</h1><ul><li>First</li><li>Second</li></ul><img src="https://tracker.example/pixel.png"><script>alert(1)</script>'
    });
    expect(document.safeHtml).toContain('<h1>Heading</h1>');
    expect(document.safeHtml).toContain('<ul>');
    expect(document.safeHtml).not.toMatch(/script|style|https:\/\/tracker/);
    expect(document.content).toContain('First');
  });

  it('keeps plain-text paragraphs and line breaks', () => {
    const document = preparePastedDocument('Plain', { mode: 'plain', plainText: 'First line\nsecond line\n\nNext paragraph' });
    expect(document.content).toBe('First line\nsecond line\n\nNext paragraph');
    expect(document.safeHtml).toBeUndefined();
  });
});
