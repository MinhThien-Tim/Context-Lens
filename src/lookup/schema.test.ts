import { describe, expect, it } from 'vitest';
import { lookupResponseSchema } from './schema';
import { validLookup } from '../test/fixtures';

describe('lookup response validation', () => {
  it('accepts the strict response shape', () => expect(lookupResponseSchema.safeParse(validLookup).success).toBe(true));
  it('rejects malformed and undocumented fields', () => {
    expect(lookupResponseSchema.safeParse({ ...validLookup, confidence: 4 }).success).toBe(false);
    expect(lookupResponseSchema.safeParse({ ...validLookup, surprise: true }).success).toBe(false);
  });
});
