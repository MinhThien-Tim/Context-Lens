import { afterEach, expect, it } from 'vitest';
import { db } from '../../db/database';
import { clearOcrPages, loadOcrPages, OCR_CONFIG_VERSION, OCR_RENDER_PARAMETERS } from './ocrStore';

afterEach(async () => { await db.pdfOcr.clear(); await db.documents.clear(); });

it('keeps a valid older OCR result when migrating to hash and raster keys', async () => {
  await db.documents.put({ id: 'legacy-ocr', kind: 'pdf', title: 'Legacy', content: '', pdfHash: 'a'.repeat(64), pageOffsets: [0], createdAt: 1, updatedAt: 1, location: { kind: 'pdf', page: 1, scrollY: 0, progress: 0, updatedAt: 1 } });
  await db.pdfOcr.put({ key: 'legacy-ocr:1:eng:1', documentId: 'legacy-ocr', page: 1, language: 'eng', configVersion: 1, text: 'Recognized words', createdAt: 2 });
  const [record] = await loadOcrPages('legacy-ocr');
  expect(record).toMatchObject({ page: 1, text: 'Recognized words', configVersion: OCR_CONFIG_VERSION, renderParameters: OCR_RENDER_PARAMETERS });
  expect(record.documentHash).toHaveLength(64);
  expect(record.blocks?.[0]?.text).toBe('Recognized words');
  await clearOcrPages('legacy-ocr');
  expect(await db.pdfOcr.where('documentId').equals('legacy-ocr').count()).toBe(0);
});
