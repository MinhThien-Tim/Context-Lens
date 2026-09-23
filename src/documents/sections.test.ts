import { describe, expect, it } from 'vitest';
import { epubHeadingSections, epubSections, htmlSections, pdfSections, textSections } from './sections';
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
  it('uses repeated chapter paragraphs only when semantic HTML headings are absent', () => {
    const inferred = htmlSections('<p>Chapter I</p><p>Body text.</p><p>Chapter II</p><p>More text.</p>');
    expect(inferred.toc.map(item => [item.title, item.offset])).toEqual([['Chapter I', 0], ['Chapter II', 19]]);
    expect(htmlSections('<h1>Real heading</h1><p>Chapter I</p><p>Chapter II</p>').toc.map(item => item.title)).toEqual(['Real heading']);
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
  it('builds chapter offsets from EPUB headings when navigation is empty', () => {
    expect(epubHeadingSections([{ href: 'one.xhtml', offset: 0, anchors: {}, headings: [{ title: 'Part One', level: 1, offset: 0 }] }, { href: 'two.xhtml', offset: 100, anchors: {}, headings: [{ title: 'Chapter 2', level: 2, offset: 7 }] }])).toEqual([
      expect.objectContaining({ title: 'Part One', chapter: 1, offset: 0 }),
      expect.objectContaining({ title: 'Chapter 2', chapter: 2, offset: 107, parentId: 'epub-heading-0' })
    ]);
  });
});
