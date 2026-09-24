import { db, type PdfOcrRecord } from '../../db/database';

export const OCR_CONFIG_VERSION = 2;
const requestedPixels = Number(import.meta.env.VITE_OCR_RASTER_PIXELS);
export const OCR_RENDER_PIXELS = [1_500_000, 2_000_000, 3_000_000].includes(requestedPixels) ? requestedPixels : 3_000_000;
export const OCR_RENDER_PARAMETERS = `scale<=2.5;pixels<=${OCR_RENDER_PIXELS};edge<=4096;rotation=pdf`;
export const OCR_LANGUAGE = 'eng' as const;
export type OcrLanguage = 'eng' | 'eng+vie';

export function ocrKey(documentId: string, page: number, language: OcrLanguage = OCR_LANGUAGE, configVersion = OCR_CONFIG_VERSION, documentHash = documentId, renderParameters = OCR_RENDER_PARAMETERS): string {
  return `${documentId}:${documentHash}:${page}:${language}:${configVersion}:${renderParameters}`;
}

export async function loadOcrPages(documentId: string): Promise<PdfOcrRecord[]> {
  const records = await db.pdfOcr.where('documentId').equals(documentId).toArray();
  const document = await db.documents.get(documentId);
  let hash = document?.pdfHash;
  if (!hash && document?.data && records.some(record => record.configVersion === 1)) {
    try {
      hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await document.data.arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join('');
      await db.documents.update(documentId, { pdfHash: hash });
    } catch { /* Keep older recognized text readable if an old file blob is unavailable. */ }
  }
  const current = records.filter(record => (record.language === 'eng' || record.language === 'eng+vie') && record.configVersion === OCR_CONFIG_VERSION && record.renderParameters === OCR_RENDER_PARAMETERS && (!hash || record.documentHash === hash));
  if (hash && OCR_RENDER_PIXELS === 3_000_000) {
    for (const previous of records.filter(record => record.configVersion === 1 && !current.some(item => item.page === record.page && item.language === record.language))) {
      current.push(await saveOcrPage(documentId, previous.page, previous.text, previous.language, hash));
    }
  }
  if (!hash) current.push(...records.filter(record => record.configVersion === 1 && !current.some(item => item.page === record.page && item.language === record.language)));
  return current;
}

export async function saveOcrPage(documentId: string, page: number, text: string, language: OcrLanguage = OCR_LANGUAGE, documentHash = documentId): Promise<PdfOcrRecord> {
  const blocks = text.split(/\n\s*\n/).filter(Boolean).reduce<Array<{ text: string; startOffset: number; endOffset: number }>>((result, block) => {
    const startOffset = result.length ? result.at(-1)!.endOffset + 2 : 0;
    result.push({ text: block, startOffset, endOffset: startOffset + block.length });
    return result;
  }, []);
  const record: PdfOcrRecord = { key: ocrKey(documentId, page, language, OCR_CONFIG_VERSION, documentHash), documentId, documentHash, page, language, configVersion: OCR_CONFIG_VERSION, renderParameters: OCR_RENDER_PARAMETERS, text, blocks, createdAt: Date.now() };
  await db.pdfOcr.put(record);
  return record;
}

export async function clearOcrPages(documentId: string): Promise<void> {
  await db.pdfOcr.where('documentId').equals(documentId).delete();
}
