/** Image-only PDF: the image is supplied as a JPEG encoded by the test browser. */
export function pdfScanFixture(jpeg: Buffer, imageWidth: number, imageHeight: number): Buffer {
  const draw = 'q 612 0 0 792 0 0 cm /Im0 Do Q';
  const objects: Buffer[] = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>'),
    Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, Buffer.from('\nendstream')]),
    Buffer.from(`<< /Length ${Buffer.byteLength(draw)} >>\nstream\n${draw}\nendstream`),
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
