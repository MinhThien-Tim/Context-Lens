import { render } from 'preact';
import { act } from 'preact/test-utils';
import { expect, it, vi } from 'vitest';
import { LookupBottomSheet } from './LookupBottomSheet';
import { validLookup } from '../test/fixtures';

it('does not substitute a Vietnamese translation for a missing English definition', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const noop = vi.fn();
  const result = { ...validLookup, source: 'offline' as const,
    quick: { ...validLookup.quick, definition_en: '', meaning_vi: ['xảy ra'], lexical_unit: null } };
  try {
    act(() => render(<LookupBottomSheet open result={result} loading={false} error={null} mode="en"
      onModeChange={noop} onClose={noop} onOpenSettings={noop} onSpeak={noop} onToggleSave={noop} saved={false} />, host));
    expect(host.textContent).toContain('No English definition is available');
    expect(host.querySelector('.meaning-vi')).toBeNull();
  } finally { act(() => render(null, host)); host.remove(); }
});

it('requests context only on action and keeps quick text when a deep result arrives', () => {
  const host = document.createElement('div'); document.body.append(host);
  const onExplain = vi.fn(); const noop = vi.fn();
  const props = { open: true, result: validLookup, loading: false, error: null, mode: 'bilingual' as const, onModeChange: noop, onClose: noop, onOpenSettings: noop, onSpeak: noop, onToggleSave: noop, saved: false, onExplain };
  try {
    act(() => render(<LookupBottomSheet {...props} />, host));
    expect(onExplain).not.toHaveBeenCalled();
    act(() => (host.querySelector('.explain-button') as HTMLButtonElement).click());
    expect(onExplain).toHaveBeenCalledWith('meaning-in-context');
    const contextResult = { ...validLookup, request_id: 'new', quick: { ...validLookup.quick, definition_en: 'MUST NOT REPLACE QUICK' }, deep: { ...validLookup.deep, context_explanation_en: 'A deeper explanation.' } };
    act(() => render(<LookupBottomSheet {...props} contextResult={contextResult} />, host));
    expect(host.querySelector('.deep-explanation')?.textContent).toContain('A deeper explanation.');
    expect(host.querySelector('.meaning-en')?.textContent).toBe(validLookup.quick.definition_en);
  } finally { act(() => render(null, host)); host.remove(); }
});
