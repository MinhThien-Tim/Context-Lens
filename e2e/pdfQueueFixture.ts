/** Mixed five-page PDF: text, scan, blank white image, scan, scan. */
export function pdfQueueFixture(jpeg: Buffer, imageWidth: number, imageHeight: number, blankJpeg?: Buffer, pageKinds: Array<'text' | 'scan' | 'white' | 'blank'> = ['text', 'scan', blankJpeg ? 'white' : 'blank', 'scan', 'scan']): Buffer {
  const objects: Buffer[] = [Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'), Buffer.from('')];
  const pageRefs: number[] = [];
  const add = (value: Buffer | string) => { objects.push(typeof value === 'string' ? Buffer.from(value) : value); return objects.length; };
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const image = add(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, Buffer.from('\nendstream')]));
  const blankImage = blankJpeg && add(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${blankJpeg.length} >>\nstream\n`), blankJpeg, Buffer.from('\nendstream')]));
  for (const kind of pageKinds) {
    const draw = kind === 'text' ? 'BT /F1 18 Tf 48 730 Td (A readable PDF page with selectable words.) Tj ET' : kind === 'scan' || kind === 'white' ? 'q 612 0 0 792 0 0 cm /Im0 Do Q' : '';
    const stream = add(`<< /Length ${Buffer.byteLength(draw)} >>\nstream\n${draw}\nendstream`);
    const resources = kind === 'text' ? `/Font << /F1 ${font} 0 R >>` : kind === 'scan' || kind === 'white' ? `/XObject << /Im0 ${kind === 'white' ? blankImage : image} 0 R >>` : '';
    pageRefs.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << ${resources} >> /Contents ${stream} 0 R >>`));
  }
  objects[1] = Buffer.from(`<< /Type /Pages /Kids [${pageRefs.map(ref => `${ref} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`);
  const parts = [Buffer.from('%PDF-1.7\n')];
  const offsets = [0]; let length = parts[0].length;
  for (let index = 0; index < objects.length; index++) {
    offsets.push(length);
    const part = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), objects[index], Buffer.from('\nendobj\n')]);
    parts.push(part); length += part.length;
  }
  const xref = length;
  parts.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
  return Buffer.concat(parts);
}
