import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { LookupBottomSheet } from './LookupBottomSheet';
import { validLookup } from '../test/fixtures';
import type { LookupResponse } from '../lookup/types';

const noop = vi.fn();
const initial: LookupResponse = { ...validLookup, quick: { definition_en: 'Available English', meaning_vi: [], lexical_unit: null }, dictionary: {
  word: 'maintain', surfaceForm: 'maintain', lemma: 'maintain', pronunciation: null, contextConfidence: 0,
  senses: [{ id: 'same-sense', pos: 'verb', definitionEn: 'Available English', meaningsVi: [], source: 'local', contextScore: 0, contextMatch: false }] } };
const host = document.createElement('div');
afterEach(() => { act(() => render(null, host)); host.remove(); vi.unstubAllGlobals(); });
function draw(result: LookupResponse, pending = true, full = false) {
  document.body.append(host);
  act(() => render(<LookupBottomSheet open selectionKey={result.selection.surface} selectionText={result.selection.surface} result={result} quickPending={pending}
    displayMode={full ? 'panel' : 'popup'} loading={false} error={null} mode="bilingual" onModeChange={noop} onClose={noop}
    onOpenSettings={noop} onSpeak={noop} onToggleSave={noop} onExplain={noop} onTranslateSentence={noop} saved={false} />, host));
}

it('keeps base content usable while enrichment runs and reveals only new content', () => {
  draw(initial);
  const english = host.querySelector('.sense-definition');
  const body = host.querySelector('.inspector-body')!; body.scrollTop = 40;
  expect(english?.textContent).toBe('Available English'); expect(host.textContent).not.toContain('Finding meanings');
  expect(host.textContent).toContain('Finding more meanings'); expect(host.querySelector('.meaning-reveal')).toBeNull();
  const enriched = { ...initial, source: 'translation' as const, dictionary: { ...initial.dictionary!, senses: initial.dictionary!.senses.map(s => ({ ...s, meaningsVi: ['Late Vietnamese'] })) } };
  draw(enriched, false);
  expect(host.querySelector('.sense-definition')).toBe(english);
  expect(host.querySelector('.sense-definition')?.classList.contains('meaning-reveal')).toBe(false);
  expect(host.querySelector('.sense-vi.meaning-reveal')?.textContent).toBe('Late Vietnamese');
  expect(host.querySelector('.inspector-body')).toBe(body); expect(body.scrollTop).toBe(40);
  expect(host.textContent).not.toContain('Finding more meanings');
  draw(enriched, false, true);
  expect(host.querySelector('.deep-explanation')?.textContent).toContain('Late Vietnamese');
  expect(host.querySelector('.deep-explanation .meaning-reveal')).toBeNull(); expect(noop).not.toHaveBeenCalled();
});

it('shows Finding meanings only for an empty pending result and clears it at first useful data', () => {
  draw({ ...initial, dictionary: undefined, quick: { definition_en: '', meaning_vi: [], lexical_unit: null } });
  expect(host.textContent).toContain('Finding meanings');
  draw(initial); expect(host.textContent).not.toContain('Finding meanings');
});

it('does not animate cached meanings or replay existing text on expansion', () => {
  draw(initial);
  draw({ ...initial, source: 'cache', engine: { provider: 'test', cached: true }, dictionary: { ...initial.dictionary!, unpairedMeaningsVi: ['Cached Vietnamese'] } });
  expect(host.textContent).toContain('Cached Vietnamese'); expect(host.querySelector('.meaning-reveal')).toBeNull();
});

it('rejects a previous selection result and resets reveal history for a new selection', () => {
  draw(initial);
  const other = { ...initial, selection: { ...initial.selection, surface: 'institution' } };
  draw(other); expect(host.querySelector('.meaning-reveal')).toBeNull();
  act(() => render(<LookupBottomSheet open result={initial} selectionText="institution" selectionKey="institution" loading={false} error={null}
    mode="bilingual" onModeChange={noop} onClose={noop} onOpenSettings={noop} onSpeak={noop} onToggleSave={noop} saved={false} />, host));
  expect(host.querySelector('.sense-definition')).toBeNull();
});

it('disables the reveal animation for reduced motion without gating data updates', () => {
  const css = readFileSync('src/styles.css', 'utf8');
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.meaning-reveal\s*\{\s*animation: none;/);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('prefers-reduced-motion'), addEventListener: noop, removeEventListener: noop }));
  draw(initial); draw({ ...initial, dictionary: { ...initial.dictionary!, unpairedMeaningsVi: ['New meaning'] } }, false);
  expect(host.textContent).toContain('New meaning');
});
