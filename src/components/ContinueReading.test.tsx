import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { ContinueReading } from './ContinueReading';
import type { DocumentRecord } from '../db/database';

const doc: DocumentRecord = { id: 'book', title: 'Book', kind: 'text', content: 'Text', createdAt: 1, updatedAt: 1, location: { kind: 'text', scrollY: 10, progress: 0.5, updatedAt: 1 } };

describe('Continue reading', () => {
  it('starts collapsed, supports disclosure and dismisses without opening', () => {
    const host = document.createElement('div'); document.body.append(host);
    const onOpen = vi.fn(); const onDismiss = vi.fn();
    try {
      act(() => render(<ContinueReading documents={[doc]} onOpen={onOpen} onDismiss={onDismiss} positionLabel={() => 'Page 2 / 4'} kindLabel={() => 'Text'} />, host));
      const details = host.querySelector('details')!;
      expect(details.open).toBe(false);
      host.querySelector('summary')!.click();
      expect(details.open).toBe(true);
      expect(host.querySelector('.continue-card')!.textContent).toContain('Page 2 / 4');
      act(() => host.querySelector<HTMLButtonElement>('.continue-dismiss')!.click());
      expect(onDismiss).toHaveBeenCalledWith(doc);
      expect(onOpen).not.toHaveBeenCalled();
      act(() => host.querySelector<HTMLButtonElement>('.continue-card')!.click());
      expect(onOpen).toHaveBeenCalledWith(doc);
      host.querySelector('summary')!.click();
      expect(details.open).toBe(false);
    } finally { act(() => render(null, host)); host.remove(); }
  });
});
