import { z } from 'zod';

const nullableText = z.string().nullable();

export const lookupResponseSchema = z.object({
  request_id: z.string().min(1),
  language_mode: z.enum(['en', 'vi', 'bilingual']),
  selection: z.object({
    surface: z.string().min(1),
    lemma: z.string().min(1),
    normalized: z.string().min(1),
    selection_type: z.enum(['word', 'phrase', 'sentence']),
    part_of_speech: nullableText,
    ipa_uk: nullableText,
    ipa_us: nullableText
  }).strict(),
  context: z.object({
    sentence: z.string(),
    previous_sentence: nullableText,
    next_sentence: nullableText
  }).strict(),
  quick: z.object({
    definition_en: z.string(),
    meaning_vi: z.array(z.string()).max(4),
    lexical_unit: z.object({
      type: z.string(),
      text: z.string(),
      meaning_en: z.string(),
      meaning_vi: z.string()
    }).strict().nullable()
  }).strict(),
  deep: z.object({
    context_explanation_en: z.string(),
    context_explanation_vi: z.string(),
    contrast: z.array(z.object({
      meaning: z.string(),
      example: z.string(),
      meaning_vi: z.string(),
      reason_not_selected: z.string()
    }).strict()).max(2),
    grammar: z.object({
      pattern: z.string(),
      explanation_en: z.string(),
      explanation_vi: z.string()
    }).strict().nullable(),
    sentence_analysis: z.object({
      translation_vi: z.string(),
      chunks: z.array(z.object({
        text: z.string(),
        role: z.string(),
        meaning_vi: z.string()
      }).strict())
    }).strict()
  }).strict(),
  difficulty: z.object({ cefr: z.string(), worth_learning: z.boolean() }).strict(),
  confidence: z.number().min(0).max(1)
}).strict();

export const lookupJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['request_id', 'language_mode', 'selection', 'context', 'quick', 'deep', 'difficulty', 'confidence'],
  properties: {
    request_id: { type: 'string' },
    language_mode: { enum: ['en', 'vi', 'bilingual'] },
    selection: {
      type: 'object', additionalProperties: false,
      required: ['surface', 'lemma', 'normalized', 'selection_type', 'part_of_speech', 'ipa_uk', 'ipa_us'],
      properties: {
        surface: { type: 'string' }, lemma: { type: 'string' }, normalized: { type: 'string' },
        selection_type: { enum: ['word', 'phrase', 'sentence'] }, part_of_speech: { type: ['string', 'null'] },
        ipa_uk: { type: ['string', 'null'] }, ipa_us: { type: ['string', 'null'] }
      }
    },
    context: {
      type: 'object', additionalProperties: false, required: ['sentence', 'previous_sentence', 'next_sentence'],
      properties: { sentence: { type: 'string' }, previous_sentence: { type: ['string', 'null'] }, next_sentence: { type: ['string', 'null'] } }
    },
    quick: {
      type: 'object', additionalProperties: false, required: ['definition_en', 'meaning_vi', 'lexical_unit'],
      properties: {
        definition_en: { type: 'string' }, meaning_vi: { type: 'array', items: { type: 'string' }, maxItems: 4 },
        lexical_unit: { anyOf: [
          { type: 'null' },
          {
            type: 'object', additionalProperties: false,
            required: ['type', 'text', 'meaning_en', 'meaning_vi'],
            properties: { type: { type: 'string' }, text: { type: 'string' }, meaning_en: { type: 'string' }, meaning_vi: { type: 'string' } }
          }
        ] }
      }
    },
    deep: {
      type: 'object', additionalProperties: false,
      required: ['context_explanation_en', 'context_explanation_vi', 'contrast', 'grammar', 'sentence_analysis'],
      properties: {
        context_explanation_en: { type: 'string' },
        context_explanation_vi: { type: 'string' },
        contrast: {
          type: 'array', maxItems: 2,
          items: {
            type: 'object', additionalProperties: false,
            required: ['meaning', 'example', 'meaning_vi', 'reason_not_selected'],
            properties: { meaning: { type: 'string' }, example: { type: 'string' }, meaning_vi: { type: 'string' }, reason_not_selected: { type: 'string' } }
          }
        },
        grammar: { anyOf: [
          { type: 'null' },
          {
            type: 'object', additionalProperties: false,
            required: ['pattern', 'explanation_en', 'explanation_vi'],
            properties: { pattern: { type: 'string' }, explanation_en: { type: 'string' }, explanation_vi: { type: 'string' } }
          }
        ] },
        sentence_analysis: {
          type: 'object', additionalProperties: false,
          required: ['translation_vi', 'chunks'],
          properties: {
            translation_vi: { type: 'string' },
            chunks: {
              type: 'array',
              items: {
                type: 'object', additionalProperties: false,
                required: ['text', 'role', 'meaning_vi'],
                properties: { text: { type: 'string' }, role: { type: 'string' }, meaning_vi: { type: 'string' } }
              }
            }
          }
        }
      }
    },
    difficulty: {
      type: 'object', additionalProperties: false, required: ['cefr', 'worth_learning'],
      properties: { cefr: { type: 'string' }, worth_learning: { type: 'boolean' } }
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 }
  }
} as const;
