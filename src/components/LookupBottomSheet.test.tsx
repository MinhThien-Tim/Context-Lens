import { render } from 'preact';
import { act } from 'preact/test-utils';
import { expect, it, vi } from 'vitest';
import { LookupBottomSheet } from './LookupBottomSheet';
import { validLookup } from '../test/fixtures';

it('shows Vietnamese-only offline entries even in the English tab', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const noop = vi.fn();
  const result = { ...validLookup, source: 'offline' as const,
    quick: { ...validLookup.quick, definition_en: '', meaning_vi: ['xảy ra'], lexical_unit: null } };
  try {
    act(() => render(<LookupBottomSheet open result={result} loading={false} error={null} mode="en"
      onModeChange={noop} onClose={noop} onOpenSettings={noop} onSpeak={noop} onToggleSave={noop} saved={false} />, host));
    expect(host.textContent).toContain('Vietnamese meanings only');
    expect(host.querySelector('.meaning-vi')?.textContent).toBe('xảy ra');
  } finally { act(() => render(null, host)); host.remove(); }
});
