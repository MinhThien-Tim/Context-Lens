import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { importLocalFile } from './fileImport';

vi.mock('mammoth', async () => import('mammoth/mammoth.browser'));

describe('DOCX import', () => {
  it('extracts readable paragraphs from a valid Word document', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
    zip.folder('_rels')?.file('.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
    zip.folder('word')?.file('document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>The government maintained public confidence.</w:t></w:r></w:p></w:body></w:document>`);
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const file = { name: 'policy.docx', size: bytes.byteLength, arrayBuffer: async () => bytes.buffer } as File;
    const result = await importLocalFile(file);
    expect(result).toEqual(expect.objectContaining({ kind: 'docx', title: 'policy' }));
    expect(result.content).toContain('maintained public confidence');
  });
  it('maps named chapter styles to semantic Contents entries', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
    zip.folder('_rels')?.file('.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
    zip.folder('word')?.file('document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="CustomChapter"/></w:pPr><w:r><w:t>First chapter</w:t></w:r></w:p><w:p><w:r><w:t>Body.</w:t></w:r></w:p></w:body></w:document>`);
    zip.folder('word/_rels')?.file('document.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    zip.folder('word')?.file('styles.xml', `<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="CustomChapter"><w:name w:val="Chapter Title"/></w:style></w:styles>`);
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const result = await importLocalFile({ name: 'chapters.docx', size: bytes.byteLength, arrayBuffer: async () => bytes.buffer } as File);
    expect(result.toc?.[0]).toMatchObject({ title: 'First chapter', level: 1, offset: 0 });
  });
});
