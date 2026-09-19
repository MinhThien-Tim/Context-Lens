import { z } from 'zod';

export const contextExplanationSchema = z.object({
  meaning: z.string().max(800).optional(),
  naturalTranslation: z.string().max(1200).optional(),
  sense: z.string().max(400).optional(),
  grammar: z.object({ pattern: z.string().max(400).optional(), explanation: z.string().max(1200) }).strict().optional(),
  whyHere: z.string().max(1200).optional(),
  notThisMeaning: z.string().max(800).optional(),
  pattern: z.string().max(400).optional(),
  example: z.string().max(800).optional(),
  simplified: z.string().max(1200).optional(),
  sentenceTranslation: z.string().max(2000).optional(),
  chunks: z.array(z.object({ text: z.string().max(800), role: z.string().max(200), meaning: z.string().max(800).optional() }).strict()).max(12).optional(),
  confidence: z.number().min(0).max(1).optional()
}).strict().refine(value => Object.keys(value).some(key => key !== 'confidence'), 'At least one explanation field is required');

export const contextExplanationJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    meaning: { type: 'string' }, naturalTranslation: { type: 'string' }, sense: { type: 'string' },
    grammar: { type: 'object', additionalProperties: false, required: ['explanation'], properties: { pattern: { type: 'string' }, explanation: { type: 'string' } } },
    whyHere: { type: 'string' }, notThisMeaning: { type: 'string' }, pattern: { type: 'string' }, example: { type: 'string' },
    simplified: { type: 'string' }, sentenceTranslation: { type: 'string' },
    chunks: { type: 'array', maxItems: 12, items: { type: 'object', additionalProperties: false, required: ['text', 'role'], properties: { text: { type: 'string' }, role: { type: 'string' }, meaning: { type: 'string' } } } },
    confidence: { type: 'number', minimum: 0, maximum: 1 }
  }
} as const;
