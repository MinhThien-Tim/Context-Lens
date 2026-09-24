/** Two-page PDF: selectable text followed by an image-only scan. */
export function pdfMixedFixture(jpeg: Buffer, imageWidth: number, imageHeight: number): Buffer {
  const text = 'BT /F1 18 Tf 48 730 Td (A readable PDF page with selectable text.) Tj ET';
  const image = 'q 612 0 0 792 0 0 cm /Im0 Do Q';
  const objects: Buffer[] = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 7 0 R >> >> /Contents 8 0 R >>'),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
    Buffer.from(`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`),
    Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, Buffer.from('\nendstream')]),
    Buffer.from(`<< /Length ${Buffer.byteLength(image)} >>\nstream\n${image}\nendstream`),
  ];
  const parts = [Buffer.from('%PDF-1.7\n')];
  const offsets = [0];
  let length = parts[0].length;
  for (let index = 0; index < objects.length; index++) {
    offsets.push(length);
    const part = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), objects[index], Buffer.from('\nendobj\n')]);
    parts.push(part); length += part.length;
  }
  const xref = length;
  parts.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
  return Buffer.concat(parts);
}
