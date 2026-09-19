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
});
