import { db, type PdfOcrRecord } from '../../db/database';

export const OCR_CONFIG_VERSION = 1;
export const OCR_LANGUAGE = 'eng' as const;

export function ocrKey(documentId: string, page: number, language = OCR_LANGUAGE, configVersion = OCR_CONFIG_VERSION): string {
  return `${documentId}:${page}:${language}:${configVersion}`;
}

export async function loadOcrPages(documentId: string): Promise<PdfOcrRecord[]> {
  return (await db.pdfOcr.where('documentId').equals(documentId).toArray())
    .filter(record => record.language === OCR_LANGUAGE && record.configVersion === OCR_CONFIG_VERSION);
}

export async function saveOcrPage(documentId: string, page: number, text: string): Promise<PdfOcrRecord> {
  const record: PdfOcrRecord = { key: ocrKey(documentId, page), documentId, page, language: OCR_LANGUAGE, configVersion: OCR_CONFIG_VERSION, text, createdAt: Date.now() };
  await db.pdfOcr.put(record);
  return record;
}
