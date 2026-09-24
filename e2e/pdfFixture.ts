/** Deterministic, original test content; no copyrighted book is bundled. */
export function pdfFixture(count = 64, blankPage = 0, rotatePage = 0) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const pages: number[] = [];
  for (let n = 1; n <= count; n++) {
    const pageId = objects.length + 1;
    const height = n % 7 === 0 ? 900 : 792;
    pages.push(pageId);
    const lines = n === blankPage ? [] : [n === 1 ? 'Preface' : `Chapter ${n}: Reading carefully`, 'The decision had surprised many voters.', 'The government struggled to maintain public confidence.', 'We study inter-', 'national examples and repeated words.', 'A word appears here. Another word appears there.', ...Array.from({ length: 20 }, (_, i) => `Paragraph ${i + 1} on page ${n} explains a useful reading example.`)];
    const stream = `BT /F1 14 Tf 50 ${height - 60} Td 22 TL\n${lines.map((line, i) => `${i ? 'T* ' : ''}(${line}) Tj`).join('\n')}\nET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 ${height}] ${n === rotatePage ? '/Rotate 90' : ''} /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R /Annots [${pageId + 2} 0 R] >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    objects.push(`<< /Type /Annot /Subtype /Link /Rect [50 40 220 60] /A << /S /URI /URI (https://example.com/) >> >>`);
  }
  objects[1] = `<< /Type /Pages /Kids [${pages.map(id => `${id} 0 R`).join(' ')}] /Count ${count} >>`;
  if (count === 8) {
    const outline = objects.length + 1;
    objects[0] = `<< /Type /Catalog /Pages 2 0 R /Outlines ${outline} 0 R >>`;
    objects.push(`<< /Type /Outlines /First ${outline + 1} 0 R /Last ${outline + 1} 0 R /Count 1 >>`);
    objects.push(`<< /Title (Chapter 3) /Parent ${outline} 0 R /Dest [${pages[2]} 0 R /Fit] >>`);
  }
  let pdf = '%PDF-1.7\n'; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
