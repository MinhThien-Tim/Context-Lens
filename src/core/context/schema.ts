import { z } from 'zod';
import type { ContextExplanation } from './types';

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

const nullableProviderExplanationSchema = z.object({
  meaning: z.string().max(800).nullable(),
  naturalTranslation: z.string().max(1200).nullable(),
  sense: z.string().max(400).nullable(),
  grammar: z.object({ pattern: z.string().max(400).nullable(), explanation: z.string().max(1200) }).strict().nullable(),
  whyHere: z.string().max(1200).nullable(),
  notThisMeaning: z.string().max(800).nullable(),
  pattern: z.string().max(400).nullable(),
  example: z.string().max(800).nullable(),
  simplified: z.string().max(1200).nullable(),
  sentenceTranslation: z.string().max(2000).nullable(),
  chunks: z.array(z.object({ text: z.string().max(800), role: z.string().max(200), meaning: z.string().max(800).nullable() }).strict()).max(12).nullable(),
  confidence: z.number().min(0).max(1).nullable()
}).strict();

/** Accepts both the compact domain object and strict-provider null placeholders. */
export const contextProviderResponseSchema = z.union([contextExplanationSchema, nullableProviderExplanationSchema]).transform(value => {
  const compact = Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null)) as ContextExplanation;
  if (compact.grammar?.pattern === null) delete compact.grammar.pattern;
  if (compact.chunks) compact.chunks = compact.chunks.map(chunk => chunk.meaning === null ? { text: chunk.text, role: chunk.role } : chunk);
  return contextExplanationSchema.parse(compact);
});

export const contextExplanationJsonSchema = {
  type: 'object', additionalProperties: false,
  required: ['meaning', 'naturalTranslation', 'sense', 'grammar', 'whyHere', 'notThisMeaning', 'pattern', 'example', 'simplified', 'sentenceTranslation', 'chunks', 'confidence'],
  properties: {
    meaning: { type: ['string', 'null'] }, naturalTranslation: { type: ['string', 'null'] }, sense: { type: ['string', 'null'] },
    grammar: { anyOf: [{ type: 'object', additionalProperties: false, required: ['pattern', 'explanation'], properties: { pattern: { type: ['string', 'null'] }, explanation: { type: 'string' } } }, { type: 'null' }] },
    whyHere: { type: ['string', 'null'] }, notThisMeaning: { type: ['string', 'null'] }, pattern: { type: ['string', 'null'] }, example: { type: ['string', 'null'] },
    simplified: { type: ['string', 'null'] }, sentenceTranslation: { type: ['string', 'null'] },
    chunks: { anyOf: [{ type: 'array', maxItems: 12, items: { type: 'object', additionalProperties: false, required: ['text', 'role', 'meaning'], properties: { text: { type: 'string' }, role: { type: 'string' }, meaning: { type: ['string', 'null'] } } } }, { type: 'null' }] },
    confidence: { type: ['number', 'null'], minimum: 0, maximum: 1 }
  }
} as const;
