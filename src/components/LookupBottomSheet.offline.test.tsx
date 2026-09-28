import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { LookupBottomSheet } from './LookupBottomSheet';
import { validLookup } from '../test/fixtures';

const noop = vi.fn();
const host = document.createElement('div');
afterEach(() => { act(() => render(null, host)); host.remove(); });

function draw(offline: boolean, pending: boolean) {
  document.body.append(host);
  act(() => render(<LookupBottomSheet open selectionKey="maintain" selectionText="maintain" result={validLookup} quickPending={pending}
    offline={offline} loading={false} error={null} mode="bilingual" onModeChange={noop} onClose={noop} onOpenSettings={noop}
    onSpeak={noop} onToggleSave={noop} saved={false} />, host));
}

it('replaces the enrichment pending state with the local-only status while offline', () => {
  draw(true, true);
  expect(host.textContent).toContain('Offline · Local results');
  expect(host.textContent).not.toContain('Finding more meanings');
  expect(host.textContent).toContain('to keep something at the same level or strength');
});

it('keeps the online enrichment status and hides the local-only note when online', () => {
  draw(false, true);
  expect(host.textContent).toContain('Finding more meanings');
  expect(host.textContent).not.toContain('Offline · Local results');
});
