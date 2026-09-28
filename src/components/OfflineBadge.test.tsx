import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, expect, it } from 'vitest';
import { OfflineBadge } from './OfflineBadge';
import type { DocumentRecord } from '../db/database';

const host = document.createElement('div');
afterEach(() => { act(() => render(null, host)); host.remove(); });

function makeDocument(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return { id: 'doc', title: 'Reading', kind: 'text', content: 'Readable text', createdAt: 1, updatedAt: 1,
    location: { kind: 'text', scrollY: 0, progress: 0, updatedAt: 1 }, ...overrides };
}

function draw(value: DocumentRecord) {
  document.body.append(host);
  act(() => render(<OfflineBadge document={value} />, host));
}

it('marks a stored document as available offline', () => {
  draw(makeDocument());
  expect(host.textContent).toBe('✓ Available offline');
});

it('stays silent when the local payload the reader needs is missing', () => {
  draw(makeDocument({ kind: 'pdf', data: undefined }));
  expect(host.textContent).toBe('');
});
