export interface NormalizedSelection {
  surface: string;
  normalized: string;
}

/** Normalize lookup punctuation without changing the text shown to the reader. */
export function normalizeSelection(surface: string): NormalizedSelection {
  return {
    surface,
    normalized: surface.normalize('NFC').trim().toLocaleLowerCase('en-US')
      .replace(/[\u2018\u2019\u02bc]/g, "'")
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-')
      .replace(/\s+/g, ' ')
  };
}
