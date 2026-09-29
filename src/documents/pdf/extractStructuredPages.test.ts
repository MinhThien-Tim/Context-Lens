import { describe, expect, it } from 'vitest';
import { extractStructuredPage, joinLines, reconstructTextRuns, shiftStructuredPage } from './extractStructuredPages';
import type { PdfSourceTextItem } from './types';
import { readingExtractionSamples } from './readingExtraction.fixtures';
import realColumns from './twoColumn.real.fixture.json';

const item = (str: string, x: number, y: number, size = 12, width = str.length * 6): PdfSourceTextItem => ({ str, width, height: size, transform: [size, 0, 0, size, x, y] });
const letters = (word: string, x: number, y: number, gap = 3, size = 12): PdfSourceTextItem[] => [...word].map((letter, index) => item(letter, x + index * (6 + gap), y, size, 6));

describe('PDF text-run reconstruction', () => {
  it('joins a tracked heading without mutating source items or neighboring words', () => {
    const run = letters('CONTENTS', 40, 700);
    const original = run.map(part => ({ ...part }));
    expect(reconstructTextRuns(run).map(part => part.str)).toEqual(['CONTENTS']);
    expect(run).toEqual(original);
    const page = extractStructuredPage(1, [item('THE', 10, 700, 12, 18), ...run, item('PAGE', 130, 700, 12, 24)], 600, 800);
    expect(page.plainText).toBe('THE CONTENTS PAGE');
    expect(page.blocks[0].endOffset).toBe(page.plainText.length);
  });

  it('keeps separate words and widely spaced or inconsistent labels separate', () => {
    expect(extractStructuredPage(1, [item('Normal', 40, 700), item('words', 85, 700)], 600, 800).plainText).toBe('Normal words');
    expect(reconstructTextRuns([item('A', 40, 700), item('B', 54, 700), item('C', 68, 700)]).map(part => part.str)).toEqual(['A', 'B', 'C']);
    expect(reconstructTextRuns([item('A', 40, 700), item('B', 49, 700), item('C', 61, 700), item('D', 70, 700)]).map(part => part.str)).toEqual(['A', 'B', 'C', 'D']);
    expect(extractStructuredPage(1, [item('A', 40, 700), item('B', 54, 700), item('C', 68, 700)], 600, 800).plainText).toBe('A B C');
  });

  it('reconstructs same-baseline glyphs within detected columns and preserves column order', () => {
    // Three right and two left body baselines establish a gutter at x=300.
    // The 22-unit gap between LEFT and RIGHT is below the 78-unit large-gap threshold.
    const items = [
      item('Right body first', 300, 720, 12, 150),
      item('Left body first', 40, 710, 12, 180),
      item('Right body second', 300, 700, 12, 150),
      item('Left body second', 40, 690, 12, 180),
      item('Right body third', 300, 680, 12, 150),
      ...letters('RIGHT', 300, 660),
      ...letters('LEFT', 245, 660),
    ];
    const page = extractStructuredPage(1, items, 600, 800);
    expect(page.plainText).toBe('Left body first Left body second\n\nLEFT\n\nRight body first Right body second Right body third RIGHT');
    for (const block of page.blocks) expect(page.plainText.slice(block.startOffset, block.endOffset)).toBe(block.text);
  });

  it('rejects changed font, size, baseline, EOL and reversed geometry', () => {
    const base = letters('WORD', 40, 700).map(part => ({ ...part, fontName: 'font-a' }));
    const variants: PdfSourceTextItem[][] = [
      base.map((part, i) => i === 2 ? { ...part, fontName: 'font-b' } : part),
      base.map((part, i) => i === 2 ? { ...part, height: 16, transform: [16, 0, 0, 16, part.transform[4], 700] } : part),
      base.map((part, i) => i === 2 ? { ...part, transform: [12, 0, 0, 12, part.transform[4], 697] } : part),
      base.map((part, i) => i === 1 ? { ...part, hasEOL: true } : part),
      base.map((part, i) => i === 2 ? { ...part, transform: [12, 0, 0, 12, 45, 700] } : part),
    ];
    for (const parts of variants) expect(reconstructTextRuns(parts).map(part => part.str)).toEqual(['W', 'O', 'R', 'D']);
  });
});

describe('structured PDF extraction', () => {
  it('repairs only supported unmarked splits at a repeated paragraph right edge', () => {
    for (const [before, after, joined] of [
      ['pres', 'ent', 'present'], ['interpre', 'tation', 'interpretation'], ['pur', 'suit', 'pursuit'],
    ]) {
      const source = [
        item('A full body line supplies the right margin', 40, 740, 12, 260),
        item('Another full line reaches the same edge', 40, 724, 12, 260),
        item(`The author describes ${before}`, 40, 708, 12, 260),
        item(`${after} in this example.`, 40, 692, 12, 150),
      ];
      const page = shiftStructuredPage(extractStructuredPage(2, source, 600, 800), 120);
      expect(page.plainText).toContain(`describes ${joined} in this example.`);
      expect(page.blocks).toHaveLength(1);
      expect(page.blocks[0].text).toBe(page.plainText);
      expect(page.plainText.slice(page.blocks[0].startOffset - 120, page.blocks[0].endOffset - 120)).toBe(page.blocks[0].text);
      expect(page.endOffset).toBe(120 + page.plainText.length);
    }
  });

  it('retains spaces when split evidence or lexical evidence is insufficient', () => {
    const prefix = [item('First ordinary line at the right edge', 40, 740, 12, 260), item('Second ordinary line at the right edge', 40, 724, 12, 260)];
    const page = (before: string, after: string, width = 260) => extractStructuredPage(1, [
      ...prefix, item(before, 40, 708, 12, width), item(after, 40, 692, 12, 120),
    ], 600, 800).plainText;
    expect(page('A passage ends with pres', 'ent in context.', 180)).toContain('pres ent');
    expect(page('A passage ends with unknow', 'nable in context.')).toContain('unknow nable');
    expect(page('The words are pur', 'suit in context.', 230)).toContain('pur suit');
    expect(page('A sentence ends here.', 'another begins.')).toContain('here. another');
    expect(page('Short words are in', 'the next line.')).toContain('in the');
    expect(page('A well-', 'known example.')).toContain('well-known');
    expect(page('An inter\u00ad', 'national example.')).toContain('international');
  });

  it('does not repair across a heading or paragraph block', () => {
    const page = extractStructuredPage(1, [
      item('A LARGE HEADING pres', 40, 760, 20, 260),
      item('ent starts the paragraph.', 40, 720),
      item('Another line continues the paragraph.', 40, 704),
    ], 600, 800);
    expect(page.blocks[0].type).toBe('heading');
    expect(page.blocks[1].text).toContain('ent starts');
    expect(page.plainText).not.toContain('present');
  });

  it('does not repair a supported split across columns', () => {
    const page = extractStructuredPage(1, [
      item('Left body line one', 40, 720, 12, 220),
      item('The next left body line', 40, 704, 12, 220),
      item('The last line ends in pres', 40, 688, 12, 220),
      item('ent begins the right column', 330, 720, 12, 220),
      item('Right body line two', 330, 704, 12, 220),
      item('Right body line three', 330, 688, 12, 220),
    ], 600, 800);
    expect(page.plainText).toContain('pres\n\nent begins');
    expect(page.plainText).not.toContain('present');
  });

  it('groups lines into paragraphs and preserves canonical offsets', () => {
    const page = shiftStructuredPage(extractStructuredPage(2, [item('A readable paragraph', 40, 700), item('continues on this line.', 40, 684)], 600, 800), 100);
    expect(page.blocks).toHaveLength(1);
    expect(page.blocks[0]).toEqual(expect.objectContaining({ type: 'paragraph', text: 'A readable paragraph continues on this line.', startOffset: 100 }));
    expect(page.endOffset).toBe(100 + page.plainText.length);
    expect(page.textIntegrity).toBe('valid');
  });

  it('classifies headings, dialogue, lists and footnotes conservatively', () => {
    const page = extractStructuredPage(1, [item('A REAL HEADING', 40, 740, 20), item('NARRATOR: Welcome.', 40, 690), item('• First item', 40, 650), item('• Second item', 40, 634), item('1 Footnote text', 40, 70, 9)], 600, 800);
    expect(page.blocks.map(block => block.type)).toEqual(['heading', 'dialogue', 'list', 'footnote']);
    expect(page.blocks.find(block => block.type === 'dialogue')?.speaker).toBe('NARRATOR');
    expect(page.blocks.find(block => block.type === 'list')?.items).toEqual(['First item', 'Second item']);
  });

  it('orders the left column before the right column', () => {
    const page = extractStructuredPage(1, [item('Right first visually', 340, 720), item('Left first logically', 30, 710), item('Right second body line', 340, 700), item('Left second body line', 30, 690), item('Right third body line', 340, 680), item('Left third body line', 30, 670)], 600, 800);
    expect(page.plainText.indexOf('Left')).toBeLessThan(page.plainText.indexOf('Right'));
  });

  it('reads the real ACL page excerpt left column then right, with its spanning title first', () => {
    const page = shiftStructuredPage(extractStructuredPage(1, realColumns.items, realColumns.width, realColumns.height), 100);
    expect(page.plainText.startsWith('Transformer-XL: Attentive Language Models')).toBe(true);
    expect(page.plainText.indexOf('We propose')).toBeLessThan(page.plainText.indexOf('tion to language'));
    expect(page.plainText.indexOf('fixed-length')).toBeLessThan(page.plainText.indexOf('results on multiple'));
    expect(page.plainText).toContain('longer-term dependency, but are limited by a fixed-length context in the setting of language modeling. We propose a novel neural ar-');
    for (const block of page.blocks) expect(page.plainText.slice(block.startOffset - 100, block.endOffset - 100)).toBe(block.text);
    expect(page.endOffset).toBe(100 + page.plainText.length);
    expect(page.textIntegrity).toBe('valid');
  });

  it('places spanning title, quotation and footnote around complete column bands', () => {
    const items = [item('A spanning title for both columns', 40, 760, 20, 510),
      ...[700, 684, 668].flatMap((y, i) => [item(`Left body line ${i}`, 40, y, 12, 220), item(`Right body line ${i}`, 330, y, 12, 220)]),
      item('“A spanning quotation across both text regions.”', 60, 620, 12, 490),
      ...[580, 564, 548].flatMap((y, i) => [item(`Lower left line ${i}`, 40, y, 12, 220), item(`Lower right line ${i}`, 330, y, 12, 220)]),
      item('1 A full width footnote explaining the source.', 40, 60, 9, 510)];
    const text = extractStructuredPage(1, items, 600, 800).plainText;
    const phrases = ['A spanning title', 'Left body line 2', 'Right body line 0', 'Right body line 2', 'A spanning quotation', 'Lower left line 2', 'Lower right line 0', 'full width footnote'];
    for (let i = 1; i < phrases.length; i++) expect(text.indexOf(phrases[i])).toBeGreaterThan(text.indexOf(phrases[i - 1]));
  });

  it('does not turn isolated right-aligned quotes into a second column', () => {
    const items = [item('First short body line.', 40, 700), item('“An inset quotation.”', 340, 680), item('Second short body line.', 40, 660), item('“Another quotation.”', 340, 640), item('Body text resumes here.', 40, 620)];
    const text = extractStructuredPage(1, items, 600, 800).plainText;
    expect(text.indexOf('An inset')).toBeLessThan(text.indexOf('Second short'));
    expect(text.indexOf('Another quotation')).toBeLessThan(text.indexOf('Body text resumes'));
  });

  it('keeps visual order when only two lines support each possible column', () => {
    const page = extractStructuredPage(1, [item('Right first visually', 340, 720), item('Left first logically', 30, 710), item('Right second', 340, 700), item('Left second', 30, 690)], 600, 800);
    expect(page.plainText.indexOf('Right first')).toBeLessThan(page.plainText.indexOf('Left first'));
    expect(page.plainText.indexOf('Left first')).toBeLessThan(page.plainText.indexOf('Right second'));
  });

  it('joins explicit soft hyphens but preserves ambiguous hard hyphens', () => {
    expect(joinLines(['inter\u00ad', 'national policy'])).toBe('international policy');
    expect(joinLines(['well-', 'known example'])).toBe('well-known example');
    expect(joinLines(['re-', 'creation'])).toBe('re-creation');
    expect(joinLines(['a well-known', 'example'])).toBe('a well-known example');
  });

  it('preserves an indented paragraph boundary after a short terminal line', () => {
    const page = extractStructuredPage(1, readingExtractionSamples.book, 600, 800);
    expect(page.blocks.map(block => block.text)).toEqual(['The first paragraph ends here.', 'A new paragraph starts here and continues on the next line.']);
  });

  it('keeps article and furniture source order without deleting margin text', () => {
    for (const name of ['article', 'furniture'] as const) {
      const page = extractStructuredPage(1, readingExtractionSamples[name], 600, 800);
      expect(page.blocks.find(block => block.text === (name === 'article' ? 'Research findings' : 'Methods'))?.type).toBe('heading');
      for (const block of page.blocks) expect(page.plainText.slice(block.startOffset, block.endOffset)).toBe(block.text);
      if (name === 'furniture') {
        expect(page.plainText.startsWith('Journal of Reading')).toBe(true);
        expect(page.plainText.endsWith('Journal of Reading — 12')).toBe(true);
      }
    }
  });

  it('keeps ambiguous hyphenation and removes only explicit discretionary hyphens', () => {
    const page = extractStructuredPage(1, readingExtractionSamples.hyphens, 600, 800);
    expect(page.plainText).toBe('A well-known example uses international evidence and re-creation as distinct terms.');
  });

  it('marks blank and scan-only pages as poor without crashing', () => {
    expect(extractStructuredPage(3, [], 600, 800)).toEqual(expect.objectContaining({ plainText: '', blocks: [], extractionQuality: 'poor', textIntegrity: 'valid' }));
  });

  it('keeps centered title lines together and flags tracked lettering for review', () => {
    const page = extractStructuredPage(5, [
      item('T H I R D', 205, 502, 8, 29), item(' ', 234, 502, 8, 6), item('E D I T I O N', 239, 502, 8, 39),
      item('“THEY SAY', 130, 461, 24, 131), item(' ', 261, 461, 24, 18), item('I SAY”', 279, 461, 24, 75),
      item('T h e M o v e s T h a t M a t t e r', 154, 431, 15, 177),
      item('H', 223, 358, 23, 37), item('GERALD GRAFF', 184, 316, 14, 116),
      item('CATHY BIRKENSTEIN', 163, 292, 14, 157), item('both of the University of Illinois at Chicago', 154, 271, 10, 177)
    ], 403, 556);
    expect(page.plainText).toContain('THIRD EDITION');
    expect(page.plainText).toContain('“THEY SAY I SAY”');
    expect(page.plainText).not.toMatch(/\n\nH\n\n/);
    expect(page.extractionQuality).toBe('partial');
    expect(page.textIntegrity).not.toBe('corrupt');
    expect(page.plainText.indexOf('THIRD')).toBeLessThan(page.plainText.indexOf('GERALD'));
  });

  it('keeps headings, dotted contents, non-English prose and decorative glyphs out of corruption', () => {
    const page = extractStructuredPage(1, [
      item('Résumé of Nguyễn and Müller', 40, 730, 20),
      item('Introduction ........................ 12', 40, 690),
      item('研究方法と結果を説明します。', 40, 650),
      item('◆', 40, 610),
    ], 600, 800);
    expect(page.textIntegrity).toBe('valid');
    expect(page.plainText).toContain('Résumé of Nguyễn and Müller');
  });

  it('detects actual PDF.js control mappings without changing text or offsets', () => {
    // Escaped getTextContent() items from unfixpages.pdf, with their original page positions.
    const samples = [
      { number: 17, width: 423.158, height: 595.128, items: [
        item('\u0007!\u001e\u0011\u000f$$\u001e!*\u001e\u0011*\u0007\u0014\u0016\u001a\u001e$\u001e\u001f\u0014)*', 146.889, 444.63, 8.1, 85.3882),
        item('\u001d\u0016(\u0010"$\u0016%)* \u0003\u001e\u001a\u001b\u0013\u000f*\u0003\u001e!\u0018*', 259.45129, 414.28, 8.1, 80.52585),
      ] },
      { number: 18, width: 422.075, height: 595.128, items: [
        item('\u0011E \u001a\u0015\u000e\u001f"\u001e', 172.18273, 514.18, 13.85, 86.70767),
        item('\u0007\u0010\u0013 \u000f \u000e\u0014\u0015 \u0006', 69.48, 445.59, 20.75, 137.03025),
        item('\u001c\u001b\u001f&\u001c\u001bM \u0018\'M', 165.46, 407.55, 6.1, 55.29966),
      ] },
      { number: 19, width: 422.025, height: 595.043, items: [
        item('?2\u0005ć \u0004\u0005\u0012ć \u000f\u0004\u0006\u0001\u001eć 2ć \u0007\u0004\u0002\u0001ć \u0001\u001b\u0001 \u0012\u0002\u0007\b\u0005\u0013ć \u0002\u0007\u0004\u0002ć', 52.6, 440.43, 7.75, 158.71655),
        item('\b \u0001\u000f\u0002\u0010\u0012ć \b\u0005\u001b\b\u0013\u0003 \u0004\u0002\b\u0005\u0013ć', 126.274925, 428.39, 7.75, 84.085175),
      ] },
      { number: 20, width: 423, height: 595.08, items: [
        item('\u0004\u001e\u0015\u000e\u0001Ƿ\u001e\u0012Ƿ\u0010\u001e\u0014\u0014Ƿ \u0003_ů\u0001\u0007Ƿ\u0012\u0003Ƿ', 121.861, 514.11, 7.7, 80.28944),
        item('\u0012-\u0001Ƿ \u0004\u0002\u001e', 122.221, 502.21, 7.7, 27.17176),
      ] },
    ];
    for (const { number, width, height, items } of samples) {
      const sourceStrings = items.map(source => source.str);
      const page = shiftStructuredPage(extractStructuredPage(number, items, width, height), 300);
      expect(items.map(source => source.str)).toEqual(sourceStrings);
      expect(page.textIntegrity).toBe('corrupt');
      expect(page.extractionQuality).not.toBe('poor');
      expect(page.plainText.replace(/\n\n/g, ' ')).toBe(sourceStrings.join(' '));
      for (const block of page.blocks) expect(page.plainText.slice(block.startOffset - 300, block.endOffset - 300)).toBe(block.text);
      expect(page.blocks[0].startOffset).toBe(300);
      expect(page.endOffset).toBe(300 + page.plainText.length);
    }
  });

  it('keeps actual imperfect but readable PDF.js excerpts out of corruption', () => {
    // getTextContent() lines from unfixpages2.pdf pages 1–3; split words are present in the source.
    const samples = [
      { number: 1, width: 278.201045, height: 514.754776, items: [
        item('[When] I was passing through a severe crisis of seep', 26.7, 379.1, 11, 152.636),
        item('ticism and doubt... I came across Tolstoy s book', 24.9, 365.4, 11, 140.118),
      ] },
      { number: 2, width: 286.476045, height: 551.654776, items: [
        item('tant for humanity, about the meaning of life and about', 12.5, 526.6, 15, 255.585),
        item('virtue. ... I would like to create a book ... in which I', 12, 513.1, 15, 256.305),
      ] },
      { number: 3, width: 286.476045, height: 551.654776, items: [
        item('the ignorance, and especially by the cultural, moral igno', 12.7, 500.2, 15, 249.045),
        item('rance of our society. . . . All our education should be', 12.7, 487, 15, 254.64),
      ] },
    ];
    for (const { number, width, height, items } of samples) {
      const page = extractStructuredPage(number, items, width, height);
      expect(page.textIntegrity).not.toBe('corrupt');
      expect(page.plainText).toBe(items.map(source => source.str).join(' '));
      for (const block of page.blocks) expect(page.plainText.slice(block.startOffset, block.endOffset)).toBe(block.text);
    }
  });

  it('requires distributed damage and retains readable imperfect extraction', () => {
    const single = extractStructuredPage(1, [item('Readable prose with one \ufffd damaged glyph.', 40, 700)], 600, 800);
    expect(single.textIntegrity).toBe('suspect');
    const repeated = extractStructuredPage(1, [item('A \ue000\ue001\ue002\ue003\ue004\ue005\ue006\ue007 passage', 40, 700), item('Another \ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd passage', 40, 684)], 600, 800);
    expect(repeated.textIntegrity).toBe('corrupt');
    const imperfect = extractStructuredPage(1, [item('T h e  research  continues  with  readable  text.', 40, 700), item('A second ordinary line remains understandable.', 40, 684)], 600, 800);
    expect(imperfect.textIntegrity).toBe('valid');
  });
});
