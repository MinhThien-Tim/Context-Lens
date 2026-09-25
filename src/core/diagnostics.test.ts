import { afterEach, describe, expect, it } from 'vitest';
import { getDiagnostics, groupDiagnosticDetails, recordDiagnostic, resetDiagnostics } from './diagnostics';

afterEach(() => resetDiagnostics());

describe('runtime diagnostics details', () => {
  it('records only the selected text and event metadata supplied by the caller', () => {
    recordDiagnostic('quickLookup', { text: 'charge', mode: 'word' });
    const snapshot = getDiagnostics();
    expect(snapshot.details[0]).toMatchObject({ event: 'quickLookup', text: 'charge', normalizedText: 'charge', mode: 'word' });
    expect(JSON.stringify(snapshot)).not.toMatch(/full sentence|private prompt|API_SECRET/);
  });

  it('groups repeated normalized text by event and mode', () => {
    recordDiagnostic('mymemoryReject', { text: '  Charge  ', mode: 'word' });
    recordDiagnostic('mymemoryReject', { text: 'charge', mode: 'word' });
    recordDiagnostic('mymemoryAccept', { text: 'charge', mode: 'word' });
    recordDiagnostic('mymemoryReject', { text: 'charge', mode: 'phrase' });
    expect(groupDiagnosticDetails(getDiagnostics().details, 'mymemoryReject').map(group => [group.detail.text, group.count, group.detail.mode])).toEqual([
      ['Charge', 2, 'word'], ['charge', 1, 'phrase']
    ]);
    expect(groupDiagnosticDetails(getDiagnostics().details, 'mymemoryAccept')).toHaveLength(1);
  });

  it('caps detail history and reset clears counters, recent metadata, and details', () => {
    for (let index = 0; index < 250; index++) recordDiagnostic('quickLookup', { text: `word-${index}` });
    expect(getDiagnostics().details).toHaveLength(200);
    expect(getDiagnostics().recent).toHaveLength(40);
    resetDiagnostics();
    expect(getDiagnostics().counters.quickLookup).toBe(0);
    expect(getDiagnostics().details).toEqual([]);
    expect(getDiagnostics().recent).toEqual([]);
  });
});
