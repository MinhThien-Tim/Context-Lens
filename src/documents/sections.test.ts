import { describe, expect, it } from 'vitest';
import { epubSections, htmlSections, pdfSections, textSections } from './sections';
describe('local document structure', () => {
  it('preserves nested headings with exact rendered offsets', () => {
    const { content, toc } = htmlSections('<h1>Book</h1><p>Introduction.</p><h2>Next</h2><p>Body.</p>');
    expect(toc).toHaveLength(2);
    expect(toc[1].parentId).toBe(toc[0].id);
    expect(content.slice(toc[1].offset)).toBe('NextBody.');
  });
  it('does not promote arbitrary short text to headings', () => {
    expect(textSections('Hello\nA short line\nThe end.')).toEqual([]);
    expect(textSections('Chapter 1\n\nText\n\nChapter II: Next')).toHaveLength(2);
  });
  it('resolves PDF outline pages and keeps unresolved parents non-navigable', async () => {
    const toc = await pdfSections([{ title: 'Part', dest: null, items: [{ title: 'Page three', dest: 'third' }, { title: 'Broken', dest: 'bad' }] }], async dest => { if (dest === 'bad') throw new Error(); return 3; }, [0, 10, 12]);
    expect(toc[1]).toMatchObject({ page: 3, offset: 12, level: 2, parentId: toc[0].id });
    expect(toc[2].offset).toBeUndefined();
    expect(await pdfSections([], async () => 1, [0])).toEqual([]);
  });
  it('maps EPUB nested navigation to spine chapters and fragment offsets', () => {
    const toc = epubSections([{ label: 'Start', href: 'text/ch1.xhtml', subitems: [{ label: 'Detail', href: 'text/ch1.xhtml#detail' }] }, { label: 'Missing', href: 'absent.xhtml' }], [{ href: 'text/ch1.xhtml', offset: 120, anchors: { detail: 45 } }]);
    expect(toc[1]).toMatchObject({ chapter: 1, offset: 165, parentId: toc[0].id });
    expect(toc[2].offset).toBeUndefined();
  });
});
